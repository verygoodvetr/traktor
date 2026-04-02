import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTrending,
  getDetails, getMediaMeta,
  getPersonalizedRecommendations,
  IMAGE_BASE, IMAGE_BASE_ORIGINAL, IMAGE_BASE_LARGE
} from '../tmdb'
import { getUserData, markEpisodeWatched, addToWatched } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { CardSkeleton } from '../components/Skeleton'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY

// ─────────────────────────────────────────────────────────
// ScrollRow
// Arrows are OUTSIDE the scrollable track (vertical tabs),
// only shown when there is actual overflow to scroll to.
// Scrolls 5 cards at a time.
// ─────────────────────────────────────────────────────────
function ScrollRow({ children, cardWidth = 180, gap = 14, className = '' }) {
  const scrollRef   = useRef(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(false)

  function checkArrows() {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    checkArrows()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(checkArrows)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  function scroll(dir) {
    const amount = (cardWidth + gap) * 5
    scrollRef.current?.scrollBy({ left: dir * amount, behavior: 'smooth' })
    setTimeout(checkArrows, 350)
  }

  return (
    <div className={`scroll-row-outer ${className}`}>
      <button
        className={`scroll-arrow scroll-arrow-left ${canLeft ? 'visible' : ''}`}
        onClick={() => scroll(-1)}
        tabIndex={canLeft ? 0 : -1}
      >‹</button>

      <div className="row-scroll" ref={scrollRef} onScroll={checkArrows}>
        {children}
      </div>

      <button
        className={`scroll-arrow scroll-arrow-right ${canRight ? 'visible' : ''}`}
        onClick={() => scroll(1)}
        tabIndex={canRight ? 0 : -1}
      >›</button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Fill card — encouraging placeholder at end of short lists
// ─────────────────────────────────────────────────────────
function FillCard({ message, onClick, aspect = '2/3' }) {
  return (
    <div className="fill-card" onClick={onClick} style={{ aspectRatio: aspect }}>
      <span className="fill-card-icon">＋</span>
      <p className="fill-card-msg">{message}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Trakt-style info panel shown on hover (like the screenshot)
// ─────────────────────────────────────────────────────────
function InfoPanel({ item, side = 'right' }) {
  const year    = (item.release_date || item.first_air_date || '').slice(0, 4)
  const rating  = item.vote_average > 0 ? Math.round(item.vote_average * 10) : null
  const genres  = (item.genres || []).slice(0, 2).map(g => g.name || g).join(', ')
  const voteK   = item.vote_count > 0 ? `${(item.vote_count / 1000).toFixed(1)}K` : null
  const eps     = item.number_of_episodes
  const runtime = item.runtime

  return (
    <div className={`info-panel info-panel-${side}`} onClick={e => e.stopPropagation()}>
      {item.poster_path && (
        <img className="info-panel-poster" src={IMAGE_BASE + item.poster_path} alt="" />
      )}
      <div className="info-panel-body">
        <div className="info-panel-top">
          <span className="info-panel-dots">···</span>
        </div>
        <p className="info-panel-title">{item.title || item.name}</p>
        {genres && <p className="info-panel-genre">{genres}</p>}
        <div className="info-panel-stats">
          {voteK && (
            <div className="info-panel-stat">
              <span className="info-stat-icon">𝓕</span> {voteK}
            </div>
          )}
          {year && <div className="info-panel-stat">{year}</div>}
          {eps   && <div className="info-panel-stat">{eps} eps.</div>}
          {runtime && <div className="info-panel-stat">{runtime} min</div>}
        </div>
        <div className="info-panel-footer">
          <span className="info-panel-wl">🖥</span>
          {rating && (
            <span className="info-panel-rating">
              <span className="info-star">★</span>{rating}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Standard poster card
// ─────────────────────────────────────────────────────────
function PosterCard({ item, onClick, rank, showQuickWatch, onQuickWatch, isWatched, panelSide = 'right' }) {
  return (
    <div className="poster-card" onClick={onClick}>
      <div className="poster-card-img">
        {item.poster_path ? (
          <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />
        ) : (
          <div className="no-poster">No Image</div>
        )}
        {isWatched && <div className="poster-watched-overlay">✓</div>}
        {rank != null && <span className="poster-rank">#{rank + 1}</span>}
        {showQuickWatch && (
          <button
            className="poster-qw-btn"
            onClick={e => { e.stopPropagation(); onQuickWatch && onQuickWatch() }}
            title="Mark as watched"
          >✓</button>
        )}
      </div>
      <div className="poster-card-info">
        <p className="poster-card-title">{item.title || item.name}</p>
        <p className="poster-card-year">{(item.release_date || item.first_air_date || '').slice(0, 4)}</p>
      </div>
      <InfoPanel item={item} side={panelSide} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Trakt-style Continue Watching card (16/9)
// No 3-dot button. Quick watch always visible below image.
// Progress bar fills based on % of show watched.
// Shows episode still if available, else show backdrop.
// ─────────────────────────────────────────────────────────
function TraktCard({ item, onQuickWatch }) {
  const navigate = useNavigate()
  const pct       = item.totalEps > 0 ? Math.min(100, (item.watchedCount / item.totalEps) * 100) : 0
  const remaining = item.totalEps - item.watchedCount

  function handleClick() {
    if (item.nextEp) {
      navigate(`/tv/${item.showId}/season/${item.nextEp.seasonNum}/episode/${item.nextEp.episode_number}`)
    } else {
      navigate(`/movie/tv/${item.showId}`)
    }
  }

  const imgSrc = item.nextEpStill
    ? IMAGE_BASE_LARGE + item.nextEpStill
    : item.backdrop_path
    ? IMAGE_BASE_ORIGINAL + item.backdrop_path
    : null

  return (
    <div className="trakt-card" onClick={handleClick}>
      {/* Image */}
      <div className="trakt-card-img">
        {imgSrc
          ? <img src={imgSrc} alt={item.showTitle} />
          : <div style={{ width: '100%', height: '100%', background: 'var(--bg4)' }} />
        }
        <div className="trakt-card-overlay" />

        {/* Progress bar + pills inside image at bottom */}
        <div className="trakt-card-bottom">
          <div className="trakt-card-meta-row">
            {item.nextEpRuntime
              ? <span className="trakt-pill">{item.nextEpRuntime}m</span>
              : <span />
            }
            <span className="trakt-pill">
              {remaining > 0 ? `${remaining} remaining` : 'All caught up'}
            </span>
          </div>
          <div className="trakt-progress-bar">
            <div className="trakt-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Text + quick-watch below image */}
      <div className="trakt-card-info">
        <div className="trakt-card-text">
          <p className="trakt-card-title">{item.showTitle}</p>
          {item.nextEp && (
            <p className="trakt-card-sub">
              S{item.nextEp.seasonNum} · E{item.nextEp.episode_number}
              {item.nextEp.name ? ` — ${item.nextEp.name}` : ''}
            </p>
          )}
        </div>
        {item.nextEp && (
          <button
            className="trakt-qw-btn"
            onClick={e => { e.stopPropagation(); onQuickWatch(item) }}
            title="Mark episode as watched"
          >✓</button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Continue Watching row
// ─────────────────────────────────────────────────────────
function ContinueWatchingRow({ user }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const data = await getUserData(user)
    const showIds = new Set()
    Object.values(data.episodes || {}).forEach(ep => showIds.add(ep.showId))

    const result = []
    for (const showId of showIds) {
      if (data.watched[`tv-${showId}`]) continue
      try {
        const details  = await getDetails('tv', showId)
        const firstAir = details.first_air_date
        if (firstAir && new Date(firstAir) > new Date()) continue

        const showEps = Object.values(data.episodes).filter(e => e.showId === showId)
        let nextEp = null, nextEpRuntime = null, nextEpStill = null

        for (const season of (details.seasons || []).filter(s => s.season_number > 0)) {
          const sd = await fetch(
            `https://api.themoviedb.org/3/tv/${showId}/season/${season.season_number}?api_key=${TMDB_KEY}`
          ).then(r => r.json())

          const unwatched = (sd.episodes || []).find(ep => {
            if (data.episodes[`tv-${showId}-s${season.season_number}e${ep.episode_number}`]) return false
            if (ep.air_date && new Date(ep.air_date) > new Date()) return false
            return true
          })

          if (unwatched) {
            nextEp        = { ...unwatched, seasonNum: season.season_number }
            nextEpRuntime = unwatched.runtime
            nextEpStill   = unwatched.still_path || null
            break
          }
        }

        if (!nextEp) continue

        const totalEps = details.seasons
          ?.filter(s => s.season_number > 0)
          .reduce((sum, s) => sum + s.episode_count, 0) || 0

        result.push({
          showId, showTitle: details.name,
          poster_path: details.poster_path, backdrop_path: details.backdrop_path,
          nextEp, nextEpRuntime, nextEpStill,
          watchedCount: showEps.length, totalEps,
          lastWatched: showEps.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))[0]?.watchedAt
        })
      } catch (e) {}
    }

    setItems(result.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched)))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function quickWatch(item) {
    if (!item.nextEp) return
    await markEpisodeWatched(user, item.showId, item.nextEp.seasonNum, item.nextEp.episode_number, 'now')
    showToast(`S${item.nextEp.seasonNum} E${item.nextEp.episode_number} marked as watched!`)
    setLoading(true)
    await load()
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 14, overflow: 'hidden' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ minWidth: 280, height: 220, background: 'var(--bg3)', borderRadius: 10, flexShrink: 0 }} />
      ))}
    </div>
  )

  if (items.length === 0) return (
    <p className="row-empty-msg">Start watching a TV show — your progress will appear here.</p>
  )

  return (
    <ScrollRow cardWidth={280} gap={14}>
      {items.map(item => (
        <TraktCard key={item.showId} item={item} onQuickWatch={quickWatch} />
      ))}
      {items.length < 5 && (
        <FillCard message="Keep watching shows to fill your queue" onClick={() => {}} aspect="16/9" />
      )}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Start Watching card (ranked, with episode thumb for TV)
// ─────────────────────────────────────────────────────────
function StartWatchingCard({ item, rank, onQuickWatch }) {
  const navigate = useNavigate()
  const type     = item.media_type || (item.first_air_date ? 'tv' : 'movie')

  const isTV     = type === 'tv'
  const imgSrc   = isTV && item.firstEpStill
    ? IMAGE_BASE_LARGE + item.firstEpStill
    : item.poster_path
    ? IMAGE_BASE + item.poster_path
    : null
  const imgAspect = isTV && item.firstEpStill ? '16/9' : '2/3'

  function handleClick() {
    if (isTV && item.firstEpStill) {
      navigate(`/tv/${item.id}/season/1/episode/1`)
    } else {
      navigate(`/movie/${type}/${item.id}`)
    }
  }

  return (
    <div className="start-card-v2" style={{ '--img-aspect': imgAspect }} onClick={handleClick}>
      <div className="start-card-v2-img" style={{ aspectRatio: imgAspect }}>
        {imgSrc
          ? <img src={imgSrc} alt={item.title || item.name} />
          : <div className="no-poster">No Image</div>
        }
        {/* Rank badge — bottom left over image */}
        <span className="poster-rank">#{rank + 1}</span>
        {/* Quick watch — bottom right over image, always visible */}
        <button
          className="poster-qw-btn poster-qw-visible"
          onClick={e => { e.stopPropagation(); onQuickWatch(item, type) }}
          title={isTV ? 'Watch S1 E1' : 'Mark as watched'}
        >▶</button>
      </div>
      <div className="poster-card-info">
        <p className="poster-card-title">{item.title || item.name}</p>
        <p className="poster-card-year">{(item.release_date || item.first_air_date || '').slice(0, 4)}</p>
      </div>
      <InfoPanel item={item} side="right" />
    </div>
  )
}

function StartWatchingRow({ items, user, onQuickWatch }) {
  const navigate = useNavigate()

  const scored = items
    .filter(item => {
      const d = item.release_date || item.first_air_date
      return d && new Date(d) <= new Date()
    })
    .map(item => {
      const pop     = item.popularity || 0
      const rating  = (item.vote_average || 0) * 10
      const recency = item.addedAt
        ? Math.max(0, 30 - (Date.now() - new Date(item.addedAt)) / (1000 * 60 * 60 * 24))
        : 0
      return { ...item, _score: pop * 0.4 + rating * 0.4 + recency * 0.2 }
    })
    .sort((a, b) => b._score - a._score)

  if (scored.length === 0) return (
    <p className="row-empty-msg">Add movies and shows to your watchlist to see them here.</p>
  )

  return (
    <ScrollRow cardWidth={160} gap={14}>
      {scored.map((item, i) => (
        <StartWatchingCard
          key={`${item.media_type}-${item.id}`}
          item={item}
          rank={i}
          onQuickWatch={onQuickWatch}
        />
      ))}
      {scored.length < 5 && (
        <FillCard
          message="Add more to your watchlist"
          onClick={() => navigate('/search')}
          aspect="2/3"
        />
      )}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Upcoming row
// ─────────────────────────────────────────────────────────
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

  function formatDate(date) {
    const diff = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff <= 7)  return `In ${diff} days`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (items.length === 0) return (
    <p className="row-empty-msg">Shows you're watching and watchlisted movies with upcoming releases will appear here.</p>
  )

  return (
    <ScrollRow cardWidth={220} gap={14}>
      {items.map(item => (
        <div
          className="schedule-card"
          key={`${item.isMovie ? 'movie' : 'tv'}-${item.id}`}
          onClick={() => navigate(`/movie/${item.isMovie ? 'movie' : 'tv'}/${item.id}`)}
        >
          {item.backdrop_path
            ? <img className="schedule-card-img" src={IMAGE_BASE_ORIGINAL + item.backdrop_path} alt={item.title} />
            : <div className="schedule-card-img" style={{ background: 'var(--bg4)' }} />
          }
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
      {items.length < 5 && (
        <FillCard message="Watch more shows to see upcoming episodes" onClick={() => {}} aspect="16/9" />
      )}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Recommended row
// ─────────────────────────────────────────────────────────
function RecommendedRow({ user }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) { setLoading(false); return }
    getUserData(user).then(async data => {
      const watched = Object.values(data.watched || {})
      if (watched.length === 0) { setLoading(false); return }
      const recs = await getPersonalizedRecommendations(watched)
      setItems(recs)
      setLoading(false)
    })
  }, [user])

  if (loading) return null

  if (items.length === 0) return (
    <p className="row-empty-msg">Mark some movies or shows as watched to get personalised recommendations.</p>
  )

  return (
    <ScrollRow cardWidth={160} gap={14}>
      {items.map(item => {
        const type = item.media_type || 'movie'
        return (
          <PosterCard
            key={`${type}-${item.id}`}
            item={{ ...item, media_type: type }}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
          />
        )
      })}
      {items.length < 5 && (
        <FillCard message="Watch more to unlock better recommendations" onClick={() => {}} aspect="2/3" />
      )}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Recently Watched row
// ─────────────────────────────────────────────────────────
function HistoryRow({ user }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) { setLoading(false); return }
    getUserData(user).then(async data => {
      const history = []

      Object.values(data.watched || {}).forEach(w => {
        if (w.media_type === 'movie' && w.watchedAt)
          history.push({ ...w, historyType: 'movie', sortDate: new Date(w.watchedAt) })
      })

      Object.entries(data.episodes || {}).forEach(([, ep]) => {
        if (ep.watchedAt)
          history.push({ ...ep, historyType: 'episode', sortDate: new Date(ep.watchedAt) })
      })

      history.sort((a, b) => b.sortDate - a.sortDate)

      const enriched = []
      for (const h of history.slice(0, 20)) {
        try {
          if (h.historyType === 'movie') {
            const d = await getDetails('movie', h.id)
            enriched.push({ ...h, title: d.title, backdrop_path: d.backdrop_path, poster_path: d.poster_path })
          } else {
            const d  = await getDetails('tv', h.showId)
            const ep = await fetch(
              `https://api.themoviedb.org/3/tv/${h.showId}/season/${h.seasonNum}/episode/${h.episodeNum}?api_key=${TMDB_KEY}`
            ).then(r => r.json())
            enriched.push({
              ...h, title: d.name, epName: ep.name,
              backdrop_path: ep.still_path || d.backdrop_path,
              poster_path: d.poster_path,
              epLabel: `S${h.seasonNum} E${h.episodeNum}`,
            })
          }
        } catch (e) {}
      }
      setItems(enriched)
      setLoading(false)
    })
  }, [user])

  if (loading) return null

  if (items.length === 0) return (
    <p className="row-empty-msg">Your watch history will appear here once you start marking things as watched.</p>
  )

  function fmt(date) {
    const diff = Math.floor((Date.now() - date) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7)  return `${diff}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <ScrollRow cardWidth={180} gap={14}>
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
            {item.backdrop_path
              ? <img src={IMAGE_BASE + item.backdrop_path} alt={item.title} />
              : <div style={{ width: '100%', height: '100%', background: 'var(--bg4)' }} />
            }
            <span className="history-card-date">{fmt(item.sortDate)}</span>
          </div>
          <div className="history-card-info">
            <p className="history-card-title">{item.title}</p>
            {item.epLabel && (
              <p className="history-card-ep">{item.epLabel}{item.epName ? ` · ${item.epName}` : ''}</p>
            )}
          </div>
        </div>
      ))}
      {items.length < 8 && (
        <FillCard message="Keep watching to build your history" onClick={() => {}} aspect="16/9" />
      )}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Landing page
// ─────────────────────────────────────────────────────────
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
            <PosterCard
              key={item.id}
              item={{ ...item, media_type: item.media_type || 'movie' }}
              onClick={() => navigate(`/movie/${item.media_type || 'movie'}/${item.id}`)}
            />
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

// ─────────────────────────────────────────────────────────
// Main Home
// ─────────────────────────────────────────────────────────
function Home({ user, onSignIn }) {
  const [watchlistItems, setWatchlistItems] = useState([])

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const wl = Object.values(data.watchlist || {})
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))

      const enriched = []
      for (const item of wl.slice(0, 20)) {
        try {
          const d = await getDetails(item.media_type, item.id)
          let firstEpStill = null
          if (item.media_type === 'tv') {
            try {
              const ep = await fetch(
                `https://api.themoviedb.org/3/tv/${item.id}/season/1/episode/1?api_key=${TMDB_KEY}`
              ).then(r => r.json())
              firstEpStill = ep.still_path || null
            } catch (e) {}
          }
          enriched.push({ ...item, ...d, firstEpStill })
        } catch (e) { enriched.push(item) }
      }
      setWatchlistItems(enriched)
    })
  }, [user])

  async function handleQuickWatch(item, type) {
    if (!user) return
    if (type === 'tv') {
      await markEpisodeWatched(user, item.id, 1, 1, 'now')
      showToast(`${item.title || item.name} S1 E1 marked as watched!`)
    } else {
      await addToWatched(user, { ...item, media_type: type }, 'now')
      showToast(`${item.title || item.name} marked as watched!`)
    }
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

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Start Watching</h2>
              <span className="home-section-sub">From your watchlist</span>
            </div>
            <StartWatchingRow items={watchlistItems} user={user} onQuickWatch={handleQuickWatch} />
          </div>

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