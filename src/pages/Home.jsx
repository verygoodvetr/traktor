import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  getTrending, getPopularMovies, getPopularShows,
  getUpcomingMovies, getDetails, getMediaMeta,
  getReleaseStatus, getPersonalizedRecommendations,
  IMAGE_BASE, IMAGE_BASE_ORIGINAL
} from '../tmdb'
import { getUserData, markEpisodeWatched, calculateStreak } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { CardSkeleton } from '../components/Skeleton'
import { showToast } from '../components/Toast'

// ── Poster row ──────────────────────────────────────────
function PosterRow({ items, loading }) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [hovered, setHovered] = useState(false)

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })
  }

  function handleClick(item) {
    const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
    navigate(`/movie/${type}/${item.id}`)
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 14, overflow: 'hidden' }}>
      {[...Array(7)].map((_, i) => (
        <div key={i} style={{ minWidth: 140, maxWidth: 140 }}>
          <CardSkeleton />
        </div>
      ))}
    </div>
  )

  return (
    <div
      className="row-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={`row-arrow row-arrow-left ${hovered ? 'visible' : ''}`}
        onClick={() => scroll(-1)}
      >‹</button>
      <div className="row-scroll" ref={scrollRef}>
        {items.map(item => (
          <div
            className="media-card row-card"
            key={item.id}
            onClick={() => handleClick(item)}
          >
            <div className="media-card-img-wrap">
              {item.poster_path ? (
                <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />
              ) : (
                <div className="no-poster">No Image</div>
              )}
              {getReleaseStatus(item) && (
                <span className="card-release-badge">{getReleaseStatus(item)}</span>
              )}
            </div>
            <div className="media-card-info">
              <p className="media-title">{item.title || item.name}</p>
              <div className="media-card-meta-row">
                <p className="media-year">
                  {(item.release_date || item.first_air_date || '').slice(0, 4)}
                </p>
                {getMediaMeta(item) && (
                  <p className="media-runtime">{getMediaMeta(item)}</p>
                )}
              </div>
              {item.vote_average > 0 && (
                <p className="media-rating">
                  <span className="tmdb-badge">TMDB</span>
                  {item.vote_average.toFixed(1)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        className={`row-arrow row-arrow-right ${hovered ? 'visible' : ''}`}
        onClick={() => scroll(1)}
      >›</button>
    </div>
  )
}

// ── Continue watching (backdrop cards) ───────────────────
function ContinueWatchingRow({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) { setLoading(false); return }
    getUserData(user).then(async data => {
      const showIds = new Set()
      Object.values(data.episodes || {}).forEach(ep => showIds.add(ep.showId))

      const result = []
      for (const showId of showIds) {
        if (data.watched[`tv-${showId}`]) continue
        try {
          const details = await getDetails('tv', showId)
          const showEps = Object.values(data.episodes).filter(e => e.showId === showId)
          let nextEp = null
          for (const season of (details.seasons || []).filter(s => s.season_number > 0)) {
            const sd = await fetch(
              `https://api.themoviedb.org/3/tv/${showId}/season/${season.season_number}?api_key=${import.meta.env.VITE_TMDB_KEY}`
            ).then(r => r.json())
            const unwatched = (sd.episodes || []).find(ep =>
              !data.episodes[`tv-${showId}-s${season.season_number}e${ep.episode_number}`]
            )
            if (unwatched) {
              nextEp = { ...unwatched, seasonNum: season.season_number }
              break
            }
          }
          const totalEps = details.seasons
            ?.filter(s => s.season_number > 0)
            .reduce((sum, s) => sum + s.episode_count, 0) || 0
          result.push({
            showId,
            showTitle: details.name,
            poster_path: details.poster_path,
            backdrop_path: details.backdrop_path,
            nextEp,
            watchedCount: showEps.length,
            totalEps,
            lastWatched: showEps.sort((a, b) =>
              new Date(b.watchedAt) - new Date(a.watchedAt)
            )[0]?.watchedAt
          })
        } catch (e) {}
      }
      setItems(result.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched)))
      setLoading(false)
    })
  }, [user])

  async function quickWatch(e, item) {
    e.stopPropagation()
    if (!item.nextEp) return
    await markEpisodeWatched(user, item.showId, item.nextEp.seasonNum, item.nextEp.episode_number, 'now')
    showToast(`S${item.nextEp.seasonNum} E${item.nextEp.episode_number} marked as watched!`)
    setItems(prev => prev.map(i =>
      i.showId === item.showId ? { ...i, watchedCount: i.watchedCount + 1 } : i
    ))
  }

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 14, overflow: 'hidden' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ minWidth: 280, height: 200, background: 'var(--bg3)', borderRadius: 12 }} />
      ))}
    </div>
  )

  if (items.length === 0) return null

  return (
    <div
      className="row-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={`row-arrow row-arrow-left ${hovered ? 'visible' : ''}`}
        onClick={() => scroll(-1)}
      >‹</button>
      <div className="row-scroll" ref={scrollRef}>
        {items.map(item => (
          <div
            className="backdrop-card"
            key={item.showId}
            onClick={() => item.nextEp
              ? navigate(`/tv/${item.showId}/season/${item.nextEp.seasonNum}/episode/${item.nextEp.episode_number}`)
              : navigate(`/movie/tv/${item.showId}`)
            }
          >
            <div className="backdrop-card-img">
              {item.backdrop_path ? (
                <img
                  src={IMAGE_BASE_ORIGINAL + item.backdrop_path}
                  alt={item.showTitle}
                />
              ) : item.poster_path ? (
                <img src={IMAGE_BASE + item.poster_path} alt={item.showTitle} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'var(--bg4)' }} />
              )}
              <div className="backdrop-card-overlay" />
              {item.nextEp && (
                <span className="backdrop-card-ep">
                  S{item.nextEp.seasonNum} E{item.nextEp.episode_number}
                </span>
              )}
              {item.nextEp && (
                <button
                  className="backdrop-quick-watch"
                  onClick={e => quickWatch(e, item)}
                  title="Mark as watched"
                >
                  ✓
                </button>
              )}
            </div>
            <div className="backdrop-card-info">
              <p className="backdrop-card-title">{item.showTitle}</p>
              <p className="backdrop-card-sub">
                {item.nextEp
                  ? `Next: ${item.nextEp.name}`
                  : 'All caught up!'}
              </p>
              <div className="backdrop-progress">
                <div
                  className="backdrop-progress-fill"
                  style={{ width: `${Math.min(100, (item.watchedCount / item.totalEps) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        className={`row-arrow row-arrow-right ${hovered ? 'visible' : ''}`}
        onClick={() => scroll(1)}
      >›</button>
    </div>
  )
}

// ── Upcoming schedule row ─────────────────────────────────
function UpcomingRow({ user }) {
  const [items, setItems] = useState([])
  const scrollRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const candidates = new Set()
      Object.values(data.episodes || {}).forEach(ep => candidates.add(`tv-${ep.showId}`))
      Object.keys(data.watchlist || {}).forEach(k => candidates.add(k))

      const upcoming = []
      for (const key of candidates) {
        const [type, id] = key.split('-')
        if (type !== 'tv') continue
        try {
          const details = await getDetails('tv', id)
          const nextEpisodeDate = details.next_episode_to_air?.air_date
          if (!nextEpisodeDate) continue
          const airDate = new Date(nextEpisodeDate)
          if (airDate < new Date()) continue
          upcoming.push({
            id: parseInt(id),
            title: details.name,
            poster_path: details.poster_path,
            backdrop_path: details.backdrop_path,
            airDate,
            nextEp: details.next_episode_to_air
          })
        } catch (e) {}
      }

      // Also add watchlisted movies with release dates
      for (const [key, item] of Object.entries(data.watchlist || {})) {
        if (item.media_type !== 'movie') continue
        try {
          const details = await getDetails('movie', item.id)
          if (!details.release_date) continue
          const releaseDate = new Date(details.release_date)
          if (releaseDate < new Date()) continue
          upcoming.push({
            id: item.id,
            title: details.title,
            poster_path: details.poster_path,
            backdrop_path: details.backdrop_path,
            airDate: releaseDate,
            isMovie: true
          })
        } catch (e) {}
      }

      setItems(upcoming.sort((a, b) => a.airDate - b.airDate).slice(0, 20))
    })
  }, [user])

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })
  }

  if (items.length === 0) return null

  function formatDate(date) {
    const now = new Date()
    const diff = Math.ceil((date - now) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff <= 7) return `In ${diff} days`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className="row-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={`row-arrow row-arrow-left ${hovered ? 'visible' : ''}`}
        onClick={() => scroll(-1)}
      >‹</button>
      <div className="row-scroll" ref={scrollRef}>
        {items.map(item => (
          <div
            className="schedule-card"
            key={`${item.isMovie ? 'movie' : 'tv'}-${item.id}`}
            onClick={() => navigate(`/movie/${item.isMovie ? 'movie' : 'tv'}/${item.id}`)}
          >
            {item.backdrop_path ? (
              <img
                className="schedule-card-img"
                src={IMAGE_BASE_ORIGINAL + item.backdrop_path}
                alt={item.title}
              />
            ) : item.poster_path ? (
              <img
                className="schedule-card-img"
                src={IMAGE_BASE + item.poster_path}
                alt={item.title}
                style={{ objectPosition: 'top' }}
              />
            ) : (
              <div className="schedule-card-img" style={{ background: 'var(--bg4)' }} />
            )}
            <div className="schedule-card-info">
              <p className="schedule-card-title">{item.title}</p>
              <p className="schedule-card-date">{formatDate(item.airDate)}</p>
              <p className="schedule-card-sub">
                {item.isMovie ? 'Movie release' : item.nextEp
                  ? `S${item.nextEp.season_number} E${item.nextEp.episode_number}`
                  : 'New episode'}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button
        className={`row-arrow row-arrow-right ${hovered ? 'visible' : ''}`}
        onClick={() => scroll(1)}
      >›</button>
    </div>
  )
}

// ── Signed out landing ────────────────────────────────────
function LandingPage({ onSignIn }) {
  const [trending, setTrending] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    getTrending().then(setTrending)
  }, [])

  return (
    <div className="landing-page">
      <div className="landing-hero">
        {trending[0]?.backdrop_path && (
          <div
            className="landing-backdrop"
            style={{ backgroundImage: `url(${IMAGE_BASE_ORIGINAL + trending[0].backdrop_path})` }}
          />
        )}
        <div className="landing-overlay" />
        <div className="landing-content">
          <div className="landing-logo">Traktor</div>
          <p className="landing-tagline">Track every movie and show you watch.</p>
          <p className="landing-desc">
            Keep your watch history, rate what you've seen, build watchlists,
            track episode progress and get personalised recommendations.
          </p>
          <div className="landing-actions">
            <button className="landing-btn-primary" onClick={onSignIn}>
              Sign in to get started
            </button>
          </div>
        </div>
      </div>

      <div className="landing-trending">
        <p className="landing-trending-title">Trending this week</p>
        <div style={{ display: 'flex', gap: 14, overflow: 'hidden', flexWrap: 'wrap' }}>
          {trending.slice(0, 6).map(item => (
            <div
              className="media-card"
              key={item.id}
              style={{ minWidth: 140, maxWidth: 140 }}
              onClick={() => navigate(`/movie/${item.media_type || 'movie'}/${item.id}`)}
            >
              <div className="media-card-img-wrap">
                {item.poster_path && (
                  <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />
                )}
              </div>
              <div className="media-card-info">
                <p className="media-title">{item.title || item.name}</p>
                <p className="media-year">{(item.release_date || item.first_air_date || '').slice(0, 4)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="landing-signin-strip">
          Sign in to see your personalised feed, track what you watch and more.{' '}
          <button onClick={onSignIn}>Sign in free →</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Home ─────────────────────────────────────────────
function Home({ user, onSignIn }) {
  const [trending, setTrending] = useState([])
  const [popular, setPopular] = useState([])
  const [newReleases, setNewReleases] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [watchlistItems, setWatchlistItems] = useState([])
  const [loadingTrending, setLoadingTrending] = useState(true)

  useEffect(() => {
    getTrending().then(data => { setTrending(data); setLoadingTrending(false) })
    Promise.all([getPopularMovies(), getPopularShows()]).then(([movies, shows]) => {
      const mixed = [...movies, ...shows].sort(() => Math.random() - 0.5)
      setPopular(mixed)
    })
    Promise.all([getPopularMovies(), getUpcomingMovies()]).then(([popular, upcoming]) => {
      const all = [...popular, ...upcoming].filter(i => {
        const days = (new Date() - new Date(i.release_date || i.first_air_date)) / (1000 * 60 * 60 * 24)
        return days >= 0 && days <= 60
      })
      setNewReleases(all.sort((a, b) => new Date(b.release_date) - new Date(a.release_date)))
    })
  }, [])

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const watched = Object.values(data.watched || {})
      if (watched.length > 0) {
        getPersonalizedRecommendations(watched).then(setRecommendations)
      }
      const watchlist = Object.values(data.watchlist || {})
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      setWatchlistItems(watchlist)
    })
  }, [user])

  if (!user) return <LandingPage onSignIn={onSignIn} />

  return (
    <PageWrapper>
      <div className="home-page">
        <div className="home-rows">

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Continue Watching</h2>
            </div>
            <ContinueWatchingRow user={user} />
          </div>

          {watchlistItems.length > 0 && (
            <div className="home-section">
              <div className="home-section-header">
                <h2 className="home-section-title">Start Watching</h2>
                <span className="home-section-sub">From your watchlist</span>
              </div>
              <PosterRow items={watchlistItems} />
            </div>
          )}

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Upcoming Schedule</h2>
              <span className="home-section-sub">New episodes and releases</span>
            </div>
            <UpcomingRow user={user} />
          </div>

          {recommendations.length > 0 && (
            <div className="home-section">
              <div className="home-section-header">
                <h2 className="home-section-title">Recommended for You</h2>
                <span className="home-section-sub">Based on your watch history</span>
              </div>
              <PosterRow items={recommendations} />
            </div>
          )}

          {newReleases.length > 0 && (
            <div className="home-section">
              <div className="home-section-header">
                <h2 className="home-section-title">Just Released</h2>
                <span className="home-section-sub">In theaters and streaming now</span>
              </div>
              <PosterRow items={newReleases} />
            </div>
          )}

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Trending</h2>
            </div>
            <PosterRow items={trending} loading={loadingTrending} />
          </div>

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Popular Right Now</h2>
            </div>
            <PosterRow items={popular} />
          </div>

        </div>
      </div>
    </PageWrapper>
  )
}

export default Home