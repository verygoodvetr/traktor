import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTrending, getPopularMovies, getPopularShows,
  getDetails, getMediaMeta,
  getPersonalizedRecommendations,
  IMAGE_BASE, IMAGE_BASE_ORIGINAL, IMAGE_BASE_LARGE
} from '../tmdb'
import { getUserData, markEpisodeWatched, addToWatched } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { CardSkeleton } from '../components/Skeleton'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY

// ── Generic scroll row ────────────────────────────────────
function ScrollRow({ children, className = '' }) {
  const scrollRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  function checkArrows() {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 0)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })
    setTimeout(checkArrows, 300)
  }

  return (
    <div
      className={`row-wrap ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {canLeft && (
        <button
          className={`row-arrow row-arrow-left ${hovered ? 'visible' : ''}`}
          onClick={() => scroll(-1)}
        >‹</button>
      )}
      <div className="row-scroll" ref={scrollRef} onScroll={checkArrows}>
        {children}
      </div>
      {canRight && (
        <button
          className={`row-arrow row-arrow-right ${hovered ? 'visible' : ''}`}
          onClick={() => scroll(1)}
        >›</button>
      )}
    </div>
  )
}

// ── Card hover panel ──────────────────────────────────────
function HoverPanel({ item, onQuickWatch, watched }) {
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const meta = getMediaMeta(item)

  return (
    <div className="card-hover-panel panel-right">
      <p className="card-hover-title">{item.title || item.name}</p>
      {item.overview && (
        <p className="card-hover-overview">{item.overview}</p>
      )}
      <div className="card-hover-meta">
        {(item.release_date || item.first_air_date || '').slice(0, 4) && (
          <span>{(item.release_date || item.first_air_date || '').slice(0, 4)}</span>
        )}
        {meta && <span>{meta}</span>}
        {item.vote_average > 0 && <span>⭐ {item.vote_average.toFixed(1)}</span>}
      </div>
      {onQuickWatch && !watched && (
        <button
          className="card-hover-quick"
          onClick={e => { e.stopPropagation(); onQuickWatch() }}
        >
          + Mark as watched
        </button>
      )}
    </div>
  )
}

// ── Poster row (general) ──────────────────────────────────
function PosterRow({ items, loading, onQuickWatch, watchedSet }) {
  const navigate = useNavigate()

  function handleClick(item) {
    const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
    navigate(`/movie/${type}/${item.id}`)
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 14, overflow: 'hidden' }}>
      {[...Array(7)].map((_, i) => (
        <div key={i} style={{ minWidth: 140, maxWidth: 140 }}><CardSkeleton /></div>
      ))}
    </div>
  )

  return (
    <ScrollRow>
      {items.map(item => {
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
        const key = `${type}-${item.id}`
        const isWatched = watchedSet?.has(key)
        return (
          <div
            className="media-card row-card"
            key={`${item.id}-${type}`}
            onClick={() => handleClick(item)}
          >
            <div className="media-card-img-wrap">
              {item.poster_path ? (
                <img
                  src={IMAGE_BASE + item.poster_path}
                  alt={item.title || item.name}
                  style={{ objectPosition: 'center top' }}
                />
              ) : (
                <div className="no-poster">No Image</div>
              )}
              {isWatched && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, color: '#4ade80'
                }}>✓</div>
              )}
            </div>
            <div className="media-card-info">
              <p className="media-title">{item.title || item.name}</p>
              <div className="media-card-meta-row">
                <p className="media-year">{(item.release_date || item.first_air_date || '').slice(0, 4)}</p>
              </div>
            </div>
            <HoverPanel
              item={{ ...item, media_type: type }}
              onQuickWatch={onQuickWatch ? () => onQuickWatch(item, type) : null}
              watched={isWatched}
            />
          </div>
        )
      })}
    </ScrollRow>
  )
}

// ── Start Watching row ────────────────────────────────────
function StartWatchingRow({ items, user, onQuickWatch }) {
  const navigate = useNavigate()

  const validItems = items.filter(item => {
    const dateStr = item.release_date || item.first_air_date
    if (!dateStr) return false
    return new Date(dateStr) <= new Date()
  })

  if (validItems.length === 0) return null

  return (
    <ScrollRow>
      {validItems.map(item => {
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
        const meta = type === 'movie'
          ? (item.runtime ? `${item.runtime} min` : null)
          : (item.number_of_episodes
            ? (item.number_of_seasons === 1
              ? `${item.number_of_episodes} episodes`
              : `${item.number_of_seasons || '?'} seasons`)
            : null)

        return (
          <div
            className="start-card"
            key={`${type}-${item.id}`}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
          >
            <div className="start-card-img">
              {item.poster_path ? (
                <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />
              ) : (
                <div className="no-poster">No Image</div>
              )}
            </div>
            <div className="start-card-info">
              <p className="start-card-title">{item.title || item.name}</p>
              {meta && <p className="start-card-meta">{meta}</p>}
            </div>
            <HoverPanel
              item={{ ...item, media_type: type }}
              onQuickWatch={onQuickWatch ? () => onQuickWatch(item, type) : null}
            />
          </div>
        )
      })}
    </ScrollRow>
  )
}

// ── Continue watching ─────────────────────────────────────
function ContinueWatchingRow({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const data = await getUserData(user)
    const showIds = new Set()
    Object.values(data.episodes || {}).forEach(ep => showIds.add(ep.showId))

    const result = []
    for (const showId of showIds) {
      if (data.watched[`tv-${showId}`]) continue
      try {
        const details = await getDetails('tv', showId)
        // Skip unreleased
        const firstAir = details.first_air_date
        if (firstAir && new Date(firstAir) > new Date()) continue

        const showEps = Object.values(data.episodes).filter(e => e.showId === showId)
        let nextEp = null
        let nextEpRuntime = null
        for (const season of (details.seasons || []).filter(s => s.season_number > 0)) {
          const sd = await fetch(
            `https://api.themoviedb.org/3/tv/${showId}/season/${season.season_number}?api_key=${TMDB_KEY}`
          ).then(r => r.json())
          const unwatched = (sd.episodes || []).find(ep => {
            if (!data.episodes[`tv-${showId}-s${season.season_number}e${ep.episode_number}`]) {
              // Skip episodes not yet aired
              if (ep.air_date && new Date(ep.air_date) > new Date()) return false
              return true
            }
            return false
          })
          if (unwatched) {
            nextEp = { ...unwatched, seasonNum: season.season_number }
            nextEpRuntime = unwatched.runtime
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
          nextEpRuntime,
          watchedCount: showEps.length,
          totalEps,
          lastWatched: showEps.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))[0]?.watchedAt
        })
      } catch (e) {}
    }
    setItems(result.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched)))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function quickWatch(e, item) {
    e.stopPropagation()
    if (!item.nextEp) return
    await markEpisodeWatched(user, item.showId, item.nextEp.seasonNum, item.nextEp.episode_number, 'now')
    showToast(`S${item.nextEp.seasonNum} E${item.nextEp.episode_number} marked as watched!`)
    // Reload to show updated next episode
    setLoading(true)
    await load()
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 14, overflow: 'hidden' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ minWidth: 280, height: 200, background: 'var(--bg3)', borderRadius: 12 }} />
      ))}
    </div>
  )
  if (items.length === 0) return null

  const pct = (item) => {
    if (!item.totalEps) return 0
    return Math.min(100, (item.watchedCount / item.totalEps) * 100)
  }

  return (
    <ScrollRow>
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
              <img src={IMAGE_BASE_ORIGINAL + item.backdrop_path} alt={item.showTitle} />
            ) : item.poster_path ? (
              <img src={IMAGE_BASE + item.poster_path} alt={item.showTitle} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--bg4)' }} />
            )}
            <div className="backdrop-card-overlay" />

            {/* In-image progress bar */}
            <div className="backdrop-in-image-bar">
              <div className="backdrop-in-image-fill" style={{ width: `${pct(item)}%` }} />
            </div>

            {/* Episode info on image */}
            <div className="backdrop-card-onimage">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                {item.nextEp && (
                  <span className="backdrop-card-ep">
                    S{item.nextEp.seasonNum} E{item.nextEp.episode_number}
                  </span>
                )}
                {item.nextEpRuntime && (
                  <span className="backdrop-ep-runtime">{item.nextEpRuntime}m</span>
                )}
              </div>
              {item.nextEp && (
                <button
                  className="backdrop-quick-watch"
                  onClick={e => quickWatch(e, item)}
                  title="Mark as watched"
                >✓</button>
              )}
            </div>
          </div>

          <div className="backdrop-card-info">
            <p className="backdrop-card-title">{item.showTitle}</p>
            <p className="backdrop-card-sub">
              {item.nextEp ? `Next: ${item.nextEp.name}` : 'All caught up!'}
            </p>
            <p className="backdrop-card-pct">
              {pct(item).toFixed(1)}% watched ({item.watchedCount}/{item.totalEps} eps)
            </p>
          </div>
        </div>
      ))}
    </ScrollRow>
  )
}

// ── Upcoming row ──────────────────────────────────────────
function UpcomingRow({ user }) {
  const [items, setItems] = useState([])
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
            id: parseInt(id), title: details.name,
            poster_path: details.poster_path, backdrop_path: details.backdrop_path,
            airDate, nextEp: details.next_episode_to_air
          })
        } catch (e) {}
      }

      for (const [, item] of Object.entries(data.watchlist || {})) {
        if (item.media_type !== 'movie') continue
        try {
          const details = await getDetails('movie', item.id)
          if (!details.release_date) continue
          const releaseDate = new Date(details.release_date)
          if (releaseDate < new Date()) continue
          upcoming.push({
            id: item.id, title: details.title,
            poster_path: details.poster_path, backdrop_path: details.backdrop_path,
            airDate: releaseDate, isMovie: true
          })
        } catch (e) {}
      }

      setItems(upcoming.sort((a, b) => a.airDate - b.airDate).slice(0, 20))
    })
  }, [user])

  if (items.length === 0) return null

  function formatDate(date) {
    const diff = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff <= 7) return `In ${diff} days`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <ScrollRow>
      {items.map(item => (
        <div
          className="schedule-card"
          key={`${item.isMovie ? 'movie' : 'tv'}-${item.id}`}
          onClick={() => navigate(`/movie/${item.isMovie ? 'movie' : 'tv'}/${item.id}`)}
        >
          {item.backdrop_path ? (
            <img className="schedule-card-img" src={IMAGE_BASE_ORIGINAL + item.backdrop_path} alt={item.title} />
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
    </ScrollRow>
  )
}

// ── Recommended row ───────────────────────────────────────
function RecommendedRow({ user }) {
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const watched = Object.values(data.watched || {})
      if (watched.length === 0) return
      const recs = await getPersonalizedRecommendations(watched)
      setItems(recs)
    })
  }, [user])

  if (items.length === 0) return null

  return (
    <ScrollRow>
      {items.map(item => {
        const type = item.media_type || 'movie'
        const meta = getMediaMeta({ ...item, media_type: type })
        return (
          <div
            className="rec-card"
            key={`${type}-${item.id}`}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
          >
            <div className="rec-card-img">
              {item.poster_path ? (
                <img
                  src={IMAGE_BASE + item.poster_path}
                  alt={item.title || item.name}
                  style={{ objectPosition: 'center top' }}
                />
              ) : <div className="no-poster">No Image</div>}
              {item.vote_average > 0 && (
                <span className="rec-card-rating">{item.vote_average.toFixed(1)}</span>
              )}
              {meta && <span className="rec-card-meta-img">{meta}</span>}
            </div>
            <div className="rec-card-info">
              <p className="rec-card-title">{item.title || item.name}</p>
              {item.reason && <p className="rec-card-reason">{item.reason}</p>}
            </div>
          </div>
        )
      })}
    </ScrollRow>
  )
}

// ── History row ───────────────────────────────────────────
function HistoryRow({ user }) {
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const history = []

      // Movies
      Object.values(data.watched || {}).forEach(w => {
        if (w.media_type === 'movie' && w.watchedAt) {
          history.push({ ...w, historyType: 'movie', sortDate: new Date(w.watchedAt) })
        }
      })

      // Episodes
      Object.entries(data.episodes || {}).forEach(([key, ep]) => {
        if (ep.watchedAt) {
          history.push({ ...ep, historyType: 'episode', key, sortDate: new Date(ep.watchedAt) })
        }
      })

      history.sort((a, b) => b.sortDate - a.sortDate)
      const top = history.slice(0, 20)

      // Enrich with details
      const enriched = []
      for (const h of top) {
        try {
          if (h.historyType === 'movie') {
            const details = await getDetails('movie', h.id)
            enriched.push({
              ...h,
              title: details.title,
              backdrop_path: details.backdrop_path,
              poster_path: details.poster_path,
            })
          } else {
            const details = await getDetails('tv', h.showId)
            const epDetails = await fetch(
              `https://api.themoviedb.org/3/tv/${h.showId}/season/${h.seasonNum}/episode/${h.episodeNum}?api_key=${TMDB_KEY}`
            ).then(r => r.json())
            enriched.push({
              ...h,
              title: details.name,
              epName: epDetails.name,
              backdrop_path: epDetails.still_path || details.backdrop_path,
              poster_path: details.poster_path,
              epLabel: `S${h.seasonNum} E${h.episodeNum}`,
            })
          }
        } catch (e) {}
      }
      setItems(enriched)
    })
  }, [user])

  if (items.length === 0) return null

  function formatDate(date) {
    const now = new Date()
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7) return `${diff}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <ScrollRow>
      {items.map((item, i) => (
        <div
          className="history-card"
          key={`${item.historyType}-${item.id || item.showId}-${i}`}
          onClick={() => {
            if (item.historyType === 'movie') navigate(`/movie/movie/${item.id}`)
            else navigate(`/tv/${item.showId}/season/${item.seasonNum}/episode/${item.episodeNum}`)
          }}
        >
          <div className="history-card-img">
            {item.backdrop_path ? (
              <img src={IMAGE_BASE + item.backdrop_path} alt={item.title} />
            ) : <div style={{ width: '100%', height: '100%', background: 'var(--bg4)' }} />}
            <span className="history-card-date">{formatDate(item.sortDate)}</span>
          </div>
          <div className="history-card-info">
            <p className="history-card-title">{item.title}</p>
            {item.epLabel && (
              <p className="history-card-ep">{item.epLabel}{item.epName ? ` · ${item.epName}` : ''}</p>
            )}
          </div>
        </div>
      ))}
    </ScrollRow>
  )
}

// ── Landing page ──────────────────────────────────────────
function LandingPage({ onSignIn }) {
  const [trending, setTrending] = useState([])
  const navigate = useNavigate()
  useEffect(() => { getTrending().then(setTrending) }, [])

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
            <button className="landing-btn-primary" onClick={onSignIn}>Sign in to get started</button>
          </div>
        </div>
      </div>
      <div className="landing-trending">
        <p className="landing-trending-title">Trending this week</p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {trending.slice(0, 6).map(item => (
            <div
              className="media-card"
              key={item.id}
              style={{ minWidth: 140, maxWidth: 140 }}
              onClick={() => navigate(`/movie/${item.media_type || 'movie'}/${item.id}`)}
            >
              <div className="media-card-img-wrap">
                {item.poster_path && <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />}
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
  const [watchlistItems, setWatchlistItems] = useState([])
  const [watchedSet, setWatchedSet] = useState(new Set())

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const ws = new Set(Object.keys(data.watched || {}))
      setWatchedSet(ws)

      // Enrich watchlist with runtime/episode data
      const wl = Object.values(data.watchlist || {})
        .filter(i => {
          const dateStr = i.release_date || i.first_air_date
          // If no date we include; if has date check it's released
          return true // we'll filter per item in StartWatchingRow
        })
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))

      // Fetch details for runtime
      const enriched = []
      for (const item of wl.slice(0, 20)) {
        try {
          const d = await getDetails(item.media_type, item.id)
          enriched.push({ ...item, ...d })
        } catch (e) {
          enriched.push(item)
        }
      }
      setWatchlistItems(enriched)
    })
  }, [user])

  async function handleQuickWatch(item, type) {
    if (!user) return
    await addToWatched(user, { ...item, media_type: type }, 'now')
    setWatchedSet(prev => new Set([...prev, `${type}-${item.id}`]))
    showToast(`${item.title || item.name} marked as watched!`)
  }

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
              <StartWatchingRow items={watchlistItems} user={user} onQuickWatch={handleQuickWatch} />
            </div>
          )}

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Upcoming Schedule</h2>
              <span className="home-section-sub">New episodes and releases</span>
            </div>
            <UpcomingRow user={user} />
          </div>

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Recommended for You</h2>
              <span className="home-section-sub">Based on your watch history</span>
            </div>
            <RecommendedRow user={user} />
          </div>

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Recently Watched</h2>
            </div>
            <HistoryRow user={user} />
          </div>

        </div>
      </div>
    </PageWrapper>
  )
}

export default Home