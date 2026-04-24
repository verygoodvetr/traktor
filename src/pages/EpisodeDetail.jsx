import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEpisodeDetails, getSeasonDetails, getDetails, IMAGE_BASE_LARGE, IMAGE_BASE, IMAGE_BASE_ORIGINAL } from '../api'
import { markEpisodeWatched, unmarkEpisodeWatched, getShowEpisodes } from '../firestore'
import WatchedDatePicker from '../components/WatchedDatePicker'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

function EpisodeDetail({ user }) {
  const { showId, seasonNum, episodeNum } = useParams()
  const navigate = useNavigate()
  const [episode, setEpisode] = useState(null)
  const [show, setShow] = useState(null)
  const [season, setSeason] = useState(null)
  const [watchedEps, setWatchedEps] = useState({})
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getEpisodeDetails(showId, seasonNum, episodeNum).then(setEpisode)
    getDetails('tv', showId).then(setShow)
    getSeasonDetails(showId, seasonNum).then(setSeason)
    window.scrollTo(0, 0)
  }, [showId, seasonNum, episodeNum])

  useEffect(() => {
    if (!user) return
    getShowEpisodes(user, parseInt(showId)).then(setWatchedEps)
  }, [user, showId])

  const key = `tv-${showId}-s${seasonNum}e${episodeNum}`
  const isWatched = !!watchedEps[key]

  const episodes = season?.episodes || []
  const currentIndex = episodes.findIndex(e => e.episode_number === parseInt(episodeNum))
  const prevEp = episodes[currentIndex - 1]
  const nextEp = episodes[currentIndex + 1]

  async function toggleWatched(watchedAt) {
    if (!user || loading) return
    setLoading(true)
    if (isWatched) {
      await unmarkEpisodeWatched(user, parseInt(showId), parseInt(seasonNum), parseInt(episodeNum))
      setWatchedEps(prev => { const n = { ...prev }; delete n[key]; return n })
      showToast('Episode removed from watched')
    } else {
      await markEpisodeWatched(user, parseInt(showId), parseInt(seasonNum), parseInt(episodeNum), watchedAt)
      setWatchedEps(prev => ({ ...prev, [key]: { watchedAt } }))
      showToast('Episode marked as watched!')
    }
    setShowDatePicker(false)
    setLoading(false)
  }

  if (!episode) return <PageWrapper><p className="status-text">Loading...</p></PageWrapper>

  const cast = episode.credits?.cast?.slice(0, 8) || []
  const directors = episode.credits?.crew
    ?.filter(p => p.job === 'Director')
    .map(p => p.name)
    .join(', ')
  const writers = episode.credits?.crew
    ?.filter(p => p.job === 'Writer' || p.job === 'Screenplay')
    .map(p => p.name)
    .join(', ')

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
              {episode.still_path ? (
                <img
                  className="detail-poster episode-still"
                  src={IMAGE_BASE_LARGE + episode.still_path}
                  alt={episode.name}
                />
              ) : show?.poster_path ? (
                <img
                  className="detail-poster"
                  src={IMAGE_BASE_LARGE + show.poster_path}
                  alt={show.name}
                />
              ) : null}

              <div className="detail-info">
                <div className="episode-breadcrumb">
                  <span
                    className="season-show-link"
                    onClick={() => navigate(`/movie/tv/${showId}`)}
                  >
                    {show?.name}
                  </span>
                  <span className="breadcrumb-sep">›</span>
                  <span
                    className="season-show-link"
                    onClick={() => navigate(`/tv/${showId}/season/${seasonNum}`)}
                  >
                    Season {seasonNum}
                  </span>
                </div>

                <h1>{episode.name}</h1>

                <div className="detail-meta">
                  <span>S{seasonNum} E{episodeNum}</span>
                  {episode.air_date && <span>{episode.air_date}</span>}
                  {episode.runtime && <span>{episode.runtime} min</span>}
                  {episode.vote_average > 0 && (
                    <span>⭐ {episode.vote_average.toFixed(1)}</span>
                  )}
                </div>

                {episode.overview && (
                  <p className="detail-overview">{episode.overview}</p>
                )}

                <div className="detail-crew-grid">
                  {directors && (
                    <div className="crew-item">
                      <span className="crew-label">Director</span>
                      <span className="crew-value">{directors}</span>
                    </div>
                  )}
                  {writers && (
                    <div className="crew-item">
                      <span className="crew-label">Writer</span>
                      <span className="crew-value">{writers}</span>
                    </div>
                  )}
                </div>

                {user && (
                  <div className="detail-actions">
                    {!isWatched ? (
                      showDatePicker ? (
                        <WatchedDatePicker
                          onSelect={toggleWatched}
                          onCancel={() => setShowDatePicker(false)}
                        />
                      ) : (
                        <button
                          className="action-btn"
                          onClick={() => setShowDatePicker(true)}
                          disabled={loading}
                        >
                          + Mark as Watched
                        </button>
                      )
                    ) : (
                      <button
                        className="action-btn active"
                        onClick={() => toggleWatched('now')}
                        disabled={loading}
                      >
                        ✓ Watched
                      </button>
                    )}
                  </div>
                )}

                <div className="episode-nav">
                  {prevEp ? (
                    <button
                      className="ep-nav-btn"
                      onClick={() => navigate(`/tv/${showId}/season/${seasonNum}/episode/${prevEp.episode_number}`)}
                    >
                      ← E{prevEp.episode_number}: {prevEp.name}
                    </button>
                  ) : <div />}
                  {nextEp ? (
                    <button
                      className="ep-nav-btn ep-nav-next"
                      onClick={() => navigate(`/tv/${showId}/season/${seasonNum}/episode/${nextEp.episode_number}`)}
                    >
                      E{nextEp.episode_number}: {nextEp.name} →
                    </button>
                  ) : <div />}
                </div>
              </div>
            </div>

            {cast.length > 0 && (
              <div className="cast-section">
                <h2>Cast</h2>
                <div className="cast-grid">
                  {cast.map(person => (
                    <div
                      className="cast-card"
                      key={person.id}
                      onClick={() => navigate(`/person/${person.id}`)}
                    >
                      {person.profile_path ? (
                        <img src={IMAGE_BASE + person.profile_path} alt={person.name} />
                      ) : (
                        <div className="cast-no-photo">?</div>
                      )}
                      <p className="cast-name">{person.name}</p>
                      <p className="cast-character">{person.character}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default EpisodeDetail