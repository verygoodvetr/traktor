import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSeasonDetails, getDetails, IMAGE_BASE, IMAGE_BASE_LARGE, IMAGE_BASE_ORIGINAL } from '../tmdb'
import { markEpisodeWatched, unmarkEpisodeWatched, markSeasonWatched, unmarkSeasonWatched, getShowEpisodes } from '../firestore'
import WatchedDatePicker from '../components/WatchedDatePicker'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'
import { db } from '../firebase'
import { doc, setDoc } from 'firebase/firestore'

function SeasonDetail({ user }) {
  const { showId, seasonNum } = useParams()
  const navigate = useNavigate()
  const [season, setSeason] = useState(null)
  const [show, setShow] = useState(null)
  const [specials, setSpecials] = useState([])
  const [watchedEps, setWatchedEps] = useState({})
  const [activePicker, setActivePicker] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getSeasonDetails(showId, seasonNum).then(setSeason)
    getDetails('tv', showId).then(data => {
      setShow(data)
      const hasSpecials = data.seasons?.some(s => s.season_number === 0)
      if (hasSpecials) {
        getSeasonDetails(showId, 0).then(s => setSpecials(s.episodes || []))
      }
    })
    window.scrollTo(0, 0)
  }, [showId, seasonNum])

  useEffect(() => {
    if (!user) return
    getShowEpisodes(user, parseInt(showId)).then(setWatchedEps)
  }, [user, showId])

  const episodes = season?.episodes || []
  const watchedCount = episodes.filter(ep =>
    watchedEps[`tv-${showId}-s${seasonNum}e${ep.episode_number}`]
  ).length
  const allWatched = episodes.length > 0 && watchedCount === episodes.length

  async function handleEpisode(ep, watchedAt) {
    if (!user || loading) return
    setLoading(true)
    const key = `tv-${showId}-s${seasonNum}e${ep.episode_number}`
    if (watchedEps[key]) {
      await unmarkEpisodeWatched(user, parseInt(showId), parseInt(seasonNum), ep.episode_number)
      setWatchedEps(prev => { const n = { ...prev }; delete n[key]; return n })
      showToast('Episode removed from watched')
    } else {
      await markEpisodeWatched(user, parseInt(showId), parseInt(seasonNum), ep.episode_number, watchedAt)
      setWatchedEps(prev => ({ ...prev, [key]: { watchedAt } }))
      showToast(`S${seasonNum} E${ep.episode_number} marked as watched!`)
    }
    setActivePicker(null)
    setLoading(false)
  }

  async function handleSeason(watchedAt) {
    if (!user || loading) return
    setLoading(true)
    if (allWatched) {
      await unmarkSeasonWatched(user, parseInt(showId), parseInt(seasonNum), episodes)
      const newWatched = { ...watchedEps }
      episodes.forEach(ep => {
        delete newWatched[`tv-${showId}-s${seasonNum}e${ep.episode_number}`]
      })
      setWatchedEps(newWatched)
      showToast('Season unmarked')
    } else {
      await markSeasonWatched(user, parseInt(showId), parseInt(seasonNum), episodes, watchedAt)
      const newWatched = { ...watchedEps }
      episodes.forEach(ep => {
        newWatched[`tv-${showId}-s${seasonNum}e${ep.episode_number}`] = { watchedAt }
      })
      setWatchedEps(newWatched)
      showToast('Whole season marked as watched!')
    }
    setActivePicker(null)
    setLoading(false)
  }

  async function handleEpisodeRating(ep, rating) {
    if (!user) return
    const key = `tv-${showId}-s${seasonNum}e${ep.episode_number}`
    const ref = doc(db, 'users', user.uid, 'episodes', key)
    await setDoc(ref, { ...watchedEps[key], rating }, { merge: true })
    setWatchedEps(prev => ({
      ...prev,
      [key]: { ...prev[key], rating }
    }))
    showToast(`Rated ${rating}/5!`)
  }

  if (!season) return <PageWrapper><p className="status-text">Loading...</p></PageWrapper>

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="detail-page-wrapper">
          {show?.backdrop_path && (
            <div
              className="detail-backdrop"
              style={{ backgroundImage: `url(${IMAGE_BASE_ORIGINAL + show.backdrop_path})` }}
            />
          )}

          <div className="detail-page">
            <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

            <div className="detail-top">
              {season.poster_path && (
                <img
                  className="detail-poster"
                  src={IMAGE_BASE_LARGE + season.poster_path}
                  alt={season.name}
                />
              )}
              <div className="detail-info">
                {show && (
                  <p
                    className="season-show-link"
                    onClick={() => navigate(`/movie/tv/${showId}`)}
                  >
                    {show.name}
                  </p>
                )}
                <h1>{season.name}</h1>

                <div className="detail-meta">
                  <span>{season.air_date?.slice(0, 4)}</span>
                  <span>{episodes.length} episodes</span>
                </div>

                <p className="episode-progress">
                  {watchedCount}/{episodes.length} episodes watched
                </p>

                {season.overview && (
                  <p className="detail-overview">{season.overview}</p>
                )}

                {user && (
                  <div className="detail-actions">
                    <div className="action-row">
                      {activePicker === 'season' ? (
                        <WatchedDatePicker
                          onSelect={handleSeason}
                          onCancel={() => setActivePicker(null)}
                        />
                      ) : (
                        <button
                          className={`action-btn primary-action ${allWatched ? 'active' : ''}`}
                          onClick={() => allWatched ? handleSeason('now') : setActivePicker('season')}
                          disabled={loading}
                        >
                          {allWatched ? '✓ Unmark whole season' : '+ Mark whole season as watched'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="episode-list">
              {episodes.map(ep => {
                const key = `tv-${showId}-s${seasonNum}e${ep.episode_number}`
                const isWatched = !!watchedEps[key]

                return (
                  <div
                    key={ep.episode_number}
                    className={`episode-row ${isWatched ? 'watched' : ''}`}
                    onClick={() => navigate(`/tv/${showId}/season/${seasonNum}/episode/${ep.episode_number}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {ep.still_path ? (
                      <img
                        className="episode-thumb"
                        src={IMAGE_BASE + ep.still_path}
                        alt={ep.name}
                      />
                    ) : (
                      <div className="episode-thumb episode-no-thumb">No image</div>
                    )}
                    <div className="episode-info">
                      <p className="episode-title">
                        <span className="episode-num">E{ep.episode_number}</span>
                        {ep.name}
                      </p>
                      {ep.overview && (
                        <p className="episode-overview">{ep.overview}</p>
                      )}
                      <p className="episode-meta">
                        {ep.air_date && <span>{ep.air_date}</span>}
                        {ep.runtime && <span>{ep.runtime} min</span>}
                        {ep.vote_average > 0 && <span>⭐ {ep.vote_average.toFixed(1)}</span>}
                      </p>
                      {user && isWatched && (
                        <div className="episode-rating-row" onClick={e => e.stopPropagation()}>
                          {[1,2,3,4,5].map(n => (
                            <button
                              key={n}
                              className={`ep-rating-btn ${watchedEps[key]?.rating >= n ? 'filled' : ''}`}
                              onClick={() => handleEpisodeRating(ep, n)}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {user && (
                      <div className="episode-actions" onClick={e => e.stopPropagation()}>
                        {activePicker === key ? (
                          <WatchedDatePicker
                            onSelect={(watchedAt) => handleEpisode(ep, watchedAt)}
                            onCancel={() => setActivePicker(null)}
                          />
                        ) : (
                          <button
                            className={`action-btn ${isWatched ? 'active' : ''}`}
                            onClick={() => isWatched ? handleEpisode(ep, 'now') : setActivePicker(key)}
                            disabled={loading}
                          >
                            {isWatched ? '✓ Watched' : '+ Watch'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {specials.length > 0 && (
              <div className="specials-section">
                <h3 className="specials-title">Special Episodes</h3>
                {specials.map(ep => (
                  <div
                    key={ep.episode_number}
                    className="episode-row specials-row"
                    onClick={() => navigate(`/tv/${showId}/season/0/episode/${ep.episode_number}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {ep.still_path ? (
                      <img
                        className="episode-thumb"
                        src={IMAGE_BASE + ep.still_path}
                        alt={ep.name}
                      />
                    ) : (
                      <div className="episode-thumb episode-no-thumb">No image</div>
                    )}
                    <div className="episode-info">
                      <p className="episode-title">
                        <span className="special-badge">Special</span>
                        {ep.name}
                      </p>
                      {ep.overview && (
                        <p className="episode-overview">{ep.overview}</p>
                      )}
                      <p className="episode-meta">
                        {ep.air_date && <span>{ep.air_date}</span>}
                        {ep.runtime && <span>{ep.runtime} min</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default SeasonDetail