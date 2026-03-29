import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getDetails, IMAGE_BASE_LARGE, IMAGE_BASE, IMAGE_BASE_ORIGINAL,
  getAgeRating, getVideos, getSimilar, getWatchProviders,
} from '../tmdb'
import {
  addToWatched, removeFromWatched, addToWatchlist, removeFromWatchlist,
  getUserData, setRating, markSeasonWatched, getShowEpisodes,
} from '../firestore'
import WatchedDatePicker from '../components/WatchedDatePicker'
import PageWrapper from '../components/PageWrapper'
import { DetailSkeleton } from '../components/Skeleton'
import ShareModal from '../components/ShareModal'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY

function MovieDetail({ user }) {
  const { type, id } = useParams()
  const navigate     = useNavigate()

  const [item,         setItem]         = useState(null)
  const [watchedEntry, setWatchedEntry] = useState(null)
  const [watched,      setWatched]      = useState(false)
  const [onWatchlist,  setOnWatchlist]  = useState(false)
  const [rating,       setRatingState]  = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [watchedEps,   setWatchedEps]   = useState({})
  const [videos,       setVideos]       = useState([])
  const [similar,      setSimilar]      = useState([])
  const [providers,    setProviders]    = useState(null)
  const [showShare,    setShowShare]    = useState(false)

  const key = `${type}-${id}`

  /* ── Fetch media data ── */
  useEffect(() => {
    setItem(null)
    getDetails(type, id).then(setItem)
    getVideos(type, id).then(setVideos)
    getSimilar(type, id).then(setSimilar)
    getWatchProviders(type, id).then(setProviders)
    window.scrollTo(0, 0)
  }, [type, id])

  /* ── Fetch user data ── */
  useEffect(() => {
    if (!user) return
    getUserData(user).then(data => {
      const entry = data.watched[key]
      setWatchedEntry(entry || null)
      setWatched(!!entry)
      setOnWatchlist(!!data.watchlist[key])
      setRatingState(entry?.rating || null)
    })
    if (type === 'tv') {
      getShowEpisodes(user, parseInt(id)).then(setWatchedEps)
    }
  }, [user, key, type, id])

  /* ── Toggle watched ── */
  async function toggleWatched(watchedAt) {
    if (!user || loading) return
    setLoading(true)
    if (watched) {
      await removeFromWatched(user, { ...item, media_type: type })
      setWatched(false)
      setWatchedEntry(null)
      setRatingState(null)
      setWatchedEps({})
      showToast('Removed from watched')
    } else {
      await addToWatched(user, { ...item, media_type: type }, watchedAt)
      const newEntry = {
        watchedAt:        watchedAt === 'now'     ? new Date().toISOString()
                        : watchedAt === 'unknown' ? null
                        : watchedAt,
        watchedAtUnknown: watchedAt === 'unknown',
      }
      setWatched(true)
      setWatchedEntry(newEntry)
      showToast('Marked as watched!')
      if (onWatchlist) {
        await removeFromWatchlist(user, { ...item, media_type: type })
        setOnWatchlist(false)
      }
    }
    setShowDatePicker(false)
    setLoading(false)
  }

  /* ── Toggle watchlist ── */
  async function toggleWatchlist() {
    if (!user || loading || watched) return
    setLoading(true)
    if (onWatchlist) {
      await removeFromWatchlist(user, { ...item, media_type: type })
      setOnWatchlist(false)
      showToast('Removed from watchlist')
    } else {
      await addToWatchlist(user, { ...item, media_type: type })
      setOnWatchlist(true)
      showToast('Added to watchlist!')
    }
    setLoading(false)
  }

  /* ── Rating ── */
  async function handleRating(r) {
    if (!user || !watched) return
    await setRating(user, { ...item, media_type: type }, r)
    setRatingState(r)
    showToast(`Rated ${r}/10!`)
  }

  /* ── Mark all seasons (batched) ── */
  async function handleMarkAllSeasons(watchedAt) {
    if (!user || !item) return
    setLoading(true)
    const seasons = item.seasons?.filter(s => s.season_number > 0) || []

    // Fetch all season episode lists in parallel
    const seasonData = await Promise.all(
      seasons.map(s =>
        fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s.season_number}?api_key=${TMDB_KEY}`)
          .then(r => r.json())
      )
    )

    // Build one giant batch
    const allSeasons = seasonData.map((sd, i) => ({
      seasonNum: seasons[i].season_number,
      episodes:  sd.episodes || [],
    }))

    // Import and use the batch function
    const { markAllSeasonsWatched } = await import('../firestore')
    await markAllSeasonsWatched(user, parseInt(id), allSeasons, watchedAt)

    await addToWatched(user, { ...item, media_type: type }, watchedAt)
    setWatched(true)
    setWatchedEntry({
      watchedAt:        watchedAt === 'now'     ? new Date().toISOString()
                      : watchedAt === 'unknown' ? null
                      : watchedAt,
      watchedAtUnknown: watchedAt === 'unknown',
    })
    showToast('Marked as watched!')
    setShowDatePicker(false)
    setLoading(false)
  }

  /* ── Render ── */
  if (!item) return <PageWrapper><div style={{ padding: 32 }}><DetailSkeleton /></div></PageWrapper>

  const directors = item.credits?.crew
    .filter(p => p.job === 'Director')
    .map(p => p.name).join(', ')

  const producers = item.credits?.crew
    .filter(p => p.job === 'Producer' || p.job === 'Executive Producer')
    .slice(0, 3).map(p => p.name).join(', ')

  const cast       = item.credits?.cast.slice(0, 8)
  const ageRating  = getAgeRating(item, type)

  const runtime = type === 'movie'
    ? (item.runtime ? `${item.runtime} min` : null)
    : item.number_of_seasons
      ? (item.number_of_seasons === 1
        ? (item.number_of_episodes ? `${item.number_of_episodes} episodes` : '1 season')
        : `${item.number_of_seasons} seasons`)
      : null

  const watchedDate = watchedEntry?.watchedAtUnknown ? 'unknown date'
    : watchedEntry?.watchedAt ? new Date(watchedEntry.watchedAt).toLocaleString()
    : null

  const seasons          = item.seasons?.filter(s => s.season_number > 0) || []
  const totalEpisodes    = seasons.reduce((s, x) => s + (x.episode_count || 0), 0)
  const watchedEpCount   = Object.keys(watchedEps).length

  const releaseDate      = item.release_date || item.first_air_date
  const daysSince        = releaseDate
    ? (new Date() - new Date(releaseDate)) / (1000 * 60 * 60 * 24) : null
  const releaseStatus    = daysSince != null
    ? (type === 'movie'
        ? (daysSince < 0 && daysSince > -180 ? 'IN THEATERS'
          : daysSince >= 0 && daysSince <= 30 ? 'JUST RELEASED' : null)
        : (daysSince >= 0 && daysSince <= 30 ? 'NEW' : null))
    : null

  const pageUrl = `${window.location.origin}/movie/${type}/${id}`

  return (
    <PageWrapper>
      <div style={{ padding: 32 }}>
        {/* Share modal */}
        {showShare && (
          <ShareModal
            title={item.title || item.name}
            url={pageUrl}
            onClose={() => setShowShare(false)}
          />
        )}

        <div className="detail-page-wrapper">
          {item.backdrop_path && (
            <div
              className="detail-backdrop"
              style={{ backgroundImage: `url(${IMAGE_BASE_ORIGINAL + item.backdrop_path})` }}
            />
          )}

          <div className="detail-page">
            <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

            {/* ── Top section ── */}
            <div className="detail-top">
              {item.poster_path && (
                <img
                  className="detail-poster"
                  src={IMAGE_BASE_LARGE + item.poster_path}
                  alt={item.title || item.name}
                />
              )}

              <div className="detail-info">
                <h1>{item.title || item.name}</h1>

                {item.tagline && (
                  <p className="detail-tagline">"{item.tagline}"</p>
                )}

                <div className="detail-meta">
                  {releaseStatus && <span className="release-badge">{releaseStatus}</span>}
                  <span>{(item.release_date || item.first_air_date || '').slice(0, 4)}</span>
                  {runtime    && <span>{runtime}</span>}
                  {ageRating  && <span className="age-rating">{ageRating}</span>}
                  {item.vote_average > 0 && (
                    <span>
                      <span className="tmdb-badge">TMDB</span>
                      {item.vote_average.toFixed(1)}
                      <span className="vote-count"> ({item.vote_count?.toLocaleString()} votes)</span>
                    </span>
                  )}
                </div>

                {type === 'tv' && totalEpisodes > 0 && (
                  <p className="episode-progress">
                    {watchedEpCount}/{totalEpisodes} episodes watched
                  </p>
                )}

                {item.genres && (
                  <div className="detail-genres">
                    {item.genres.map(g => (
                      <span className="genre-tag" key={g.id}>{g.name}</span>
                    ))}
                  </div>
                )}

                {item.overview && (
                  <p className="detail-overview">{item.overview}</p>
                )}

                {/* Crew grid */}
                <div className="detail-crew-grid">
                  {directors && (
                    <div className="crew-item">
                      <span className="crew-label">Director</span>
                      <span className="crew-value">{directors}</span>
                    </div>
                  )}
                  {producers && (
                    <div className="crew-item">
                      <span className="crew-label">Producer</span>
                      <span className="crew-value">{producers}</span>
                    </div>
                  )}
                  {item.networks?.length > 0 && (
                    <div className="crew-item">
                      <span className="crew-label">Network</span>
                      <span className="crew-value">{item.networks.map(n => n.name).join(', ')}</span>
                    </div>
                  )}
                  {item.production_companies?.length > 0 && (
                    <div className="crew-item">
                      <span className="crew-label">Studio</span>
                      <span className="crew-value">
                        {item.production_companies.slice(0, 3).map(c => c.name).join(', ')}
                      </span>
                    </div>
                  )}
                  {item.budget  > 0 && (
                    <div className="crew-item">
                      <span className="crew-label">Budget</span>
                      <span className="crew-value">${item.budget.toLocaleString()}</span>
                    </div>
                  )}
                  {item.revenue > 0 && (
                    <div className="crew-item">
                      <span className="crew-label">Revenue</span>
                      <span className="crew-value">${item.revenue.toLocaleString()}</span>
                    </div>
                  )}
                  {item.status && (
                    <div className="crew-item">
                      <span className="crew-label">Status</span>
                      <span className="crew-value">{item.status}</span>
                    </div>
                  )}
                  {item.original_language && (
                    <div className="crew-item">
                      <span className="crew-label">Language</span>
                      <span className="crew-value">{item.original_language.toUpperCase()}</span>
                    </div>
                  )}
                </div>

                {/* ── Actions ── */}
                {user ? (
                  <div className="detail-actions">
                    <div className="action-row">
                      {!watched ? (
                        showDatePicker ? (
                          <WatchedDatePicker
                            onSelect={type === 'tv' ? handleMarkAllSeasons : toggleWatched}
                            onCancel={() => setShowDatePicker(false)}
                          />
                        ) : (
                          <button
                            className="action-btn primary-action"
                            onClick={() => setShowDatePicker(true)}
                            disabled={loading}
                          >
                            + Mark as Watched
                          </button>
                        )
                      ) : (
                        <button
                          className="action-btn active primary-action"
                          onClick={() => toggleWatched('now')}
                          disabled={loading}
                        >
                          ✓ Watched
                          {watchedDate && (
                            <span className="watched-date-label"> · {watchedDate}</span>
                          )}
                        </button>
                      )}

                      <button
                        className={`action-btn ${onWatchlist ? 'active' : ''}`}
                        onClick={toggleWatchlist}
                        disabled={loading || watched}
                        title={watched ? 'Already watched' : ''}
                      >
                        {onWatchlist ? '✓ Watchlist' : '+ Watchlist'}
                      </button>

                      <button
                        className="action-btn"
                        onClick={() => setShowShare(true)}
                        title="Share"
                      >
                        ↗ Share
                      </button>
                    </div>

                    {watched && (
                      <div className="rating-row">
                        <span className="rating-label">Your rating:</span>
                        <div className="rating-stars">
                          {[1,2,3,4,5,6,7,8,9,10].map(n => (
                            <button
                              key={n}
                              className={`rating-btn ${rating === n ? 'active' : ''} ${rating && n <= rating ? 'filled' : ''}`}
                              onClick={() => handleRating(n)}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="status-text">Sign in to track this</p>
                )}
              </div>
            </div>

            {/* ── Cast ── */}
            {cast?.length > 0 && (
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

            {/* ── Where to watch ── */}
            {providers && (providers.flatrate || providers.rent || providers.buy) && (
              <div className="detail-extra-section">
                <h2>Where to Watch</h2>
                <div className="providers-grid">
                  {providers.flatrate?.map(p => (
                    <div key={p.provider_id} className="provider-item">
                      <img
                        src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                        alt={p.provider_name}
                        title={p.provider_name}
                      />
                      <span className="provider-type">Stream</span>
                    </div>
                  ))}
                  {providers.rent?.map(p => (
                    <div key={`rent-${p.provider_id}`} className="provider-item">
                      <img
                        src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                        alt={p.provider_name}
                        title={p.provider_name}
                      />
                      <span className="provider-type">Rent</span>
                    </div>
                  ))}
                  {providers.buy?.map(p => (
                    <div key={`buy-${p.provider_id}`} className="provider-item">
                      <img
                        src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                        alt={p.provider_name}
                        title={p.provider_name}
                      />
                      <span className="provider-type">Buy</span>
                    </div>
                  ))}
                </div>
                <p className="providers-note">Availability may vary by region. Data from JustWatch via TMDB.</p>
              </div>
            )}

            {/* ── Videos ── */}
            {videos.length > 0 && (
              <div className="detail-extra-section">
                <h2>Videos</h2>
                <div className="videos-row">
                  {videos.slice(0, 4).map(v => (
                    <a
                      key={v.key}
                      href={`https://www.youtube.com/watch?v=${v.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="video-card"
                    >
                      <div className="video-thumb-wrap">
                        <img
                          src={`https://img.youtube.com/vi/${v.key}/mqdefault.jpg`}
                          alt={v.name}
                        />
                        <div className="video-play-btn">▶</div>
                      </div>
                      <p className="video-title">{v.name}</p>
                      <p className="video-type">{v.type}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Similar ── */}
            {similar.length > 0 && (
              <div className="detail-extra-section">
                <h2>Related</h2>
                <div className="row-scroll">
                  {similar.slice(0, 10).map(sim => (
                    <div
                      key={sim.id}
                      className="media-card row-card"
                      onClick={() => navigate(`/movie/${type}/${sim.id}`)}
                    >
                      <div className="media-card-img-wrap">
                        <img src={IMAGE_BASE + sim.poster_path} alt={sim.title || sim.name} />
                      </div>
                      <div className="media-card-info">
                        <p className="media-title">{sim.title || sim.name}</p>
                        <p className="media-year">
                          {(sim.release_date || sim.first_air_date || '').slice(0, 4)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Seasons (multi-season) ── */}
            {type === 'tv' && seasons.length > 1 && (
              <div className="seasons-section">
                <h2>Seasons</h2>
                <div className="seasons-grid">
                  {seasons.map(season => {
                    const seasonWatched = Object.keys(watchedEps).filter(k =>
                      k.includes(`-s${season.season_number}e`)
                    ).length
                    const complete = season.episode_count > 0 && seasonWatched === season.episode_count
                    return (
                      <div
                        key={season.season_number}
                        className={`season-card ${complete ? 'complete' : ''}`}
                        onClick={() => navigate(`/tv/${id}/season/${season.season_number}`)}
                      >
                        {season.poster_path ? (
                          <img src={IMAGE_BASE + season.poster_path} alt={season.name} />
                        ) : (
                          <div className="no-poster">No Image</div>
                        )}
                        <p className="season-name">{season.name}</p>
                        <p className="season-progress">{seasonWatched}/{season.episode_count} eps</p>
                        {complete && <span className="season-complete-badge">✓</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Episodes link (single-season) ── */}
            {type === 'tv' && seasons.length === 1 && (
              <div className="seasons-section">
                <h2>Episodes</h2>
                <p
                  className="season-show-link"
                  onClick={() => navigate(`/tv/${id}/season/${seasons[0].season_number}`)}
                  style={{ marginBottom: 8, display: 'inline-block' }}
                >
                  View all {seasons[0].episode_count} episodes →
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default MovieDetail