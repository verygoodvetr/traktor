import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTrending,
  getDetails, getStartWatchingMeta,
  getPersonalizedRecommendations,
  IMAGE_BASE, IMAGE_BASE_ORIGINAL, IMAGE_BASE_LARGE
} from '../tmdb'
import { getUserData, markEpisodeWatched, addToWatched, removeFromWatchlist, addToWatchlist } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY

// ─────────────────────────────────────────────────────────
// Global refresh signal
// ─────────────────────────────────────────────────────────
let _refreshListeners = []
export function subscribeToRefresh(fn) {
  _refreshListeners.push(fn)
  return () => { _refreshListeners = _refreshListeners.filter(l => l !== fn) }
}
export function broadcastRefresh() {
  _refreshListeners.forEach(fn => fn())
}

// ─────────────────────────────────────────────────────────
// Time / date helpers
// ─────────────────────────────────────────────────────────
function formatTime(isoStr, use12h) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  if (isNaN(d)) return null
  return use12h
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatWatchedLabel(date, use12h, useDMY) {
  const now  = new Date()
  const diff = Math.floor((now - date) / 86400000)
  const time = formatTime(date.toISOString(), use12h) || ''

  if (diff === 0) return `Today ${time}`.trim()
  if (diff === 1) return `Yesterday ${time}`.trim()

  // Older — full date + time
  const dateStr = useDMY
    ? `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`
    : date.toLocaleDateString('en-US', { day: 'numeric', month: 'numeric', year: 'numeric' })
  return `${dateStr} ${time}`.trim()
}

// ─────────────────────────────────────────────────────────
// ScrollRow – always shows arrows (dim when unusable)
// Snaps exactly 5 cards per click
// ─────────────────────────────────────────────────────────
function ScrollRow({ children, cardWidth, gap = 14 }) {
  const scrollRef  = useRef(null)
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
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * (cardWidth + gap) * 5, behavior: 'smooth' })
    setTimeout(checkArrows, 350)
  }

  return (
    <div className="scroll-row-outer">
      <button
        className={`scroll-arrow scroll-arrow-left${canLeft ? ' visible' : ''}`}
        onClick={() => scroll(-1)}
        tabIndex={canLeft ? 0 : -1}
      >‹</button>

      <div className="row-scroll" ref={scrollRef} onScroll={checkArrows}>
        {children}
      </div>

      <button
        className={`scroll-arrow scroll-arrow-right${canRight ? ' visible' : ''}`}
        onClick={() => scroll(1)}
        tabIndex={canRight ? 0 : -1}
      >›</button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// TraktCard — the one canonical 16/9 card component used
// by Continue Watching, Start Watching, and Recently Watched
// ─────────────────────────────────────────────────────────
function TraktCard({
  imgSrc,
  title,
  subtitle,
  pillLeft,
  pillRight,
  progressPct,   // undefined = no bar rendered
  onQwClick,
  qwIcon = '✓',
  qwTitle = '',
  onClick,
  cardWidth = 280,
}) {
  return (
    <div
      className="trakt-card"
      style={{ minWidth: cardWidth, maxWidth: cardWidth }}
      onClick={onClick}
    >
      <div className="trakt-card-img">
        {imgSrc
          ? <img src={imgSrc} alt={title} />
          : <div style={{ width:'100%', height:'100%', background:'var(--bg4)' }} />
        }
        <div className="trakt-card-overlay" />

        <div className="trakt-card-bottom">
          <div className="trakt-card-meta-row">
            {pillLeft  ? <span className="trakt-pill">{pillLeft}</span>  : <span />}
            {pillRight ? <span className="trakt-pill">{pillRight}</span> : <span />}
          </div>
          {progressPct !== undefined && (
            <div className="trakt-progress-bar">
              <div className="trakt-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="trakt-card-info">
        <div className="trakt-card-text">
          <p className="trakt-card-title">{title}</p>
          {subtitle && <p className="trakt-card-sub">{subtitle}</p>}
        </div>
        {onQwClick && (
          <button
            className="trakt-qw-btn"
            onClick={e => { e.stopPropagation(); onQwClick() }}
            title={qwTitle}
          >{qwIcon}</button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PosterCard — vertical 2/3 card used by Recommended
// QW button sits BELOW the image in the info row (right side)
// ─────────────────────────────────────────────────────────
function PosterCard({ item, onClick, onQwClick, qwIcon = '+', qwTitle = '', ratingLabel }) {
  return (
    <div className="poster-card" onClick={onClick}>
      <div className="poster-card-img">
        {item.poster_path
          ? <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />
          : <div className="no-poster">No Image</div>
        }
        {ratingLabel && <span className="card-rating">{ratingLabel}</span>}
      </div>
      {/* info row: title left, QW button right — always visible */}
      <div className="trakt-card-info" style={{ padding: '7px 2px 0' }}>
        <div className="trakt-card-text">
          <p className="poster-card-title">{item.title || item.name}</p>
          <p className="poster-card-year">{(item.release_date || item.first_air_date || '').slice(0,4)}</p>
        </div>
        {onQwClick && (
          <button
            className="trakt-qw-btn"
            style={{ flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onQwClick() }}
            title={qwTitle}
          >{qwIcon}</button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Continue Watching
// Next episode = episode after the furthest-watched one.
// If user skipped ahead, still picks up from furthest watched.
// When all aired eps done → wraps to ep 1 (rewatch).
// ─────────────────────────────────────────────────────────
function ContinueWatchingRow({ user, refreshKey }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const CARD_W = 280

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const data = await getUserData(user)
    const showIds = new Set()
    Object.values(data.episodes || {}).forEach(ep => showIds.add(ep.showId))

    const result = []
    for (const showId of showIds) {
      if (data.watched[`tv-${showId}`]) continue
      try {
        const details = await getDetails('tv', showId)
        if (details.first_air_date && new Date(details.first_air_date) > new Date()) continue

        // Build ordered list of all aired episodes
        const airedEps = []
        for (const season of (details.seasons || []).filter(s => s.season_number > 0)) {
          const sd = await fetch(
            `https://api.themoviedb.org/3/tv/${showId}/season/${season.season_number}?api_key=${TMDB_KEY}`
          ).then(r => r.json())
          for (const ep of (sd.episodes || [])) {
            if (ep.air_date && new Date(ep.air_date) > new Date()) continue
            airedEps.push({ ...ep, seasonNum: season.season_number })
          }
        }
        if (airedEps.length === 0) continue

        // Find furthest watched episode (highest index in airedEps)
        let furthestIdx = -1
        airedEps.forEach((ep, idx) => {
          if (data.episodes[`tv-${showId}-s${ep.seasonNum}e${ep.episode_number}`]) {
            furthestIdx = idx
          }
        })
        if (furthestIdx === -1) continue // hasn't started any aired ep

        // Next ep: after furthest, wrap to 0 if at end
        const nextEpObj = furthestIdx >= airedEps.length - 1
          ? airedEps[0]
          : airedEps[furthestIdx + 1]

        const availableToWatch = airedEps.filter(ep =>
          !data.episodes[`tv-${showId}-s${ep.seasonNum}e${ep.episode_number}`]
        ).length

        const showEps = Object.values(data.episodes).filter(e => e.showId === showId)
        const totalEps = details.seasons
          ?.filter(s => s.season_number > 0)
          .reduce((acc, s) => acc + s.episode_count, 0) || 0

        result.push({
          showId,
          showTitle: details.name,
          backdrop_path: details.backdrop_path,
          nextEp: nextEpObj,
          nextEpRuntime: nextEpObj.runtime,
          nextEpStill: nextEpObj.still_path || null,
          watchedCount: showEps.length,
          totalEps,
          availableToWatch,
          lastWatched: showEps.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))[0]?.watchedAt,
        })
      } catch (e) {}
    }

    setItems(result.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched)))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load, refreshKey])

  async function quickWatch(item) {
    if (!item.nextEp) return
    await markEpisodeWatched(user, item.showId, item.nextEp.seasonNum, item.nextEp.episode_number, 'now')
    showToast(`S${item.nextEp.seasonNum} E${item.nextEp.episode_number} marked as watched!`)
    broadcastRefresh()
  }

  if (loading) return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ minWidth: CARD_W, maxWidth: CARD_W, height: 230, background: 'var(--bg3)', borderRadius: 10, flexShrink: 0 }} />
      ))}
    </ScrollRow>
  )

  if (items.length === 0) return (
    <p className="row-empty-msg">Start watching a TV show — your progress will appear here.</p>
  )

  return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {items.map(item => {
        const pct    = item.totalEps > 0 ? Math.min(100, (item.watchedCount / item.totalEps) * 100) : 0
        const imgSrc = item.nextEpStill
          ? IMAGE_BASE_LARGE + item.nextEpStill
          : item.backdrop_path
          ? IMAGE_BASE_ORIGINAL + item.backdrop_path
          : null
        return (
          <TraktCard
            key={item.showId}
            cardWidth={CARD_W}
            imgSrc={imgSrc}
            title={item.showTitle}
            subtitle={item.nextEp
              ? `S${item.nextEp.seasonNum} · E${item.nextEp.episode_number}${item.nextEp.name ? ` — ${item.nextEp.name}` : ''}`
              : null}
            pillLeft={item.nextEpRuntime ? `${item.nextEpRuntime}m` : null}
            pillRight={item.availableToWatch > 0 ? `${item.availableToWatch} to watch` : 'Up to date'}
            progressPct={pct}
            onQwClick={() => quickWatch(item)}
            qwIcon="✓"
            qwTitle="Mark episode as watched"
            onClick={() => item.nextEp
              ? navigate(`/tv/${item.showId}/season/${item.nextEp.seasonNum}/episode/${item.nextEp.episode_number}`)
              : navigate(`/movie/tv/${item.showId}`)
            }
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Start Watching — same TraktCard, vertical poster image,
// release date as subtitle, meta as left pill
// ─────────────────────────────────────────────────────────
function StartWatchingRow({ items, user, onQuickWatch }) {
  const navigate = useNavigate()
  const CARD_W = 280

  const scored = items
    .filter(item => {
      const d = item.release_date || item.first_air_date
      return d && new Date(d) <= new Date()
    })
    .map(item => {
      const pop    = item.popularity || 0
      const rating = (item.vote_average || 0) * 10
      const recency = item.addedAt
        ? Math.max(0, 30 - (Date.now() - new Date(item.addedAt)) / 86400000)
        : 0
      return { ...item, _score: pop * 0.4 + rating * 0.4 + recency * 0.2 }
    })
    .sort((a, b) => b._score - a._score)

  if (scored.length === 0) return (
    <p className="row-empty-msg">Add movies and shows to your watchlist to see them here.</p>
  )

  return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {scored.map((item) => {
        const type  = item.media_type || (item.first_air_date ? 'tv' : 'movie')
        const meta  = getStartWatchingMeta({ ...item, media_type: type })
        const year  = (item.release_date || item.first_air_date || '').slice(0, 4)
        // Vertical poster — use poster_path at large size
        const imgSrc = item.poster_path ? IMAGE_BASE_LARGE + item.poster_path : null

        return (
          <TraktCard
            key={`${type}-${item.id}`}
            cardWidth={CARD_W}
            imgSrc={imgSrc}
            title={item.title || item.name}
            subtitle={year || null}
            pillLeft={meta || null}
            pillRight={null}
            progressPct={undefined}
            onQwClick={() => onQuickWatch(item, type)}
            qwIcon="▶"
            qwTitle={type === 'tv' ? 'Watch S1 E1' : 'Mark as watched'}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Upcoming Schedule
// Shows episodes from ALL seasons (not just next one),
// includes tomorrow's time, shows even if user hasn't
// watched that season yet.
// ─────────────────────────────────────────────────────────
function UpcomingRow({ user, use12hClock }) {
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      // Collect all TV shows user has ANY relationship with
      const tvIds = new Set()
      Object.values(data.episodes  || {}).forEach(ep => tvIds.add(String(ep.showId)))
      Object.values(data.watched   || {}).forEach(w  => { if (w.media_type === 'tv') tvIds.add(String(w.id)) })
      Object.values(data.watchlist || {}).forEach(w  => { if (w.media_type === 'tv') tvIds.add(String(w.id)) })

      const upcoming = []
      const seenKeys = new Set()

      for (const id of tvIds) {
        try {
          const details = await getDetails('tv', id)
          // Use TMDB's next_episode_to_air field — shows ALL upcoming regardless of season
          const neta = details.next_episode_to_air
          if (!neta?.air_date) continue
          const airDate = new Date(neta.air_date)
          const now = new Date()
          now.setHours(0, 0, 0, 0)
          if (airDate < now) continue
          const key = `tv-${id}-s${neta.season_number}e${neta.episode_number}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          upcoming.push({
            id: parseInt(id),
            title: details.name,
            poster_path: details.poster_path,
            backdrop_path: details.backdrop_path,
            airDate,
            nextEp: neta,
          })
        } catch (e) {}
      }

      // Movies from watchlist
      for (const [, item] of Object.entries(data.watchlist || {})) {
        if (item.media_type !== 'movie') continue
        try {
          const details = await getDetails('movie', item.id)
          if (!details.release_date) continue
          const releaseDate = new Date(details.release_date)
          const now = new Date(); now.setHours(0,0,0,0)
          if (releaseDate < now) continue
          upcoming.push({
            id: item.id, title: details.title,
            poster_path: details.poster_path, backdrop_path: details.backdrop_path,
            airDate: releaseDate, isMovie: true,
          })
        } catch (e) {}
      }

      setItems(upcoming.sort((a, b) => a.airDate - b.airDate).slice(0, 20))
    })
  }, [user])

  function formatLabel(item) {
    const date = item.airDate
    const now  = new Date(); now.setHours(0,0,0,0)
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
    const dayAfter = new Date(now); dayAfter.setDate(now.getDate() + 2)

    const isToday    = date >= now    && date < tomorrow
    const isTomorrow = date >= tomorrow && date < dayAfter
    const diffDays   = Math.floor((date - now) / 86400000)

    const timeStr = !item.isMovie
      ? formatTime(item.nextEp?.air_date || item.airDate.toISOString(), use12hClock)
      : null

    if (isToday)    return timeStr ? `Today (${timeStr})`    : 'Today'
    if (isTomorrow) return timeStr ? `Tomorrow (${timeStr})` : 'Tomorrow'
    if (diffDays <= 7) return `In ${diffDays} days`
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
            <p className="schedule-card-date">{formatLabel(item)}</p>
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

// ─────────────────────────────────────────────────────────
// Recommended — vertical poster, "add to watchlist" QW,
// rating overlay on image
// ─────────────────────────────────────────────────────────
function RecommendedRow({ user, refreshKey }) {
  const [items,     setItems]     = useState([])
  const [watchlist, setWatchlist] = useState(new Set())
  const [loading,   setLoading]   = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const data = await getUserData(user)
    setWatchlist(new Set(Object.keys(data.watchlist || {})))
    const watched = Object.values(data.watched || {})
    if (watched.length === 0) { setLoading(false); return }
    const recs = await getPersonalizedRecommendations(watched)
    const watchedKeys = new Set(Object.keys(data.watched || {}))
    setItems(recs.filter(r => !watchedKeys.has(`${r.media_type || 'movie'}-${r.id}`)))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load, refreshKey])

  async function handleAddToWatchlist(item) {
    const type = item.media_type || 'movie'
    const key  = `${type}-${item.id}`
    if (watchlist.has(key)) { showToast('Already on your watchlist'); return }
    await addToWatchlist(user, { ...item, media_type: type })
    setWatchlist(prev => new Set([...prev, key]))
    setItems(prev => prev.filter(r => `${r.media_type || 'movie'}-${r.id}` !== key))
    showToast(`Added to watchlist!`)
    broadcastRefresh()
  }

  if (loading) return null
  if (items.length === 0) return (
    <p className="row-empty-msg">Mark some movies or shows as watched to get personalised recommendations.</p>
  )

  return (
    <ScrollRow cardWidth={160} gap={14}>
      {items.map(item => {
        const type   = item.media_type || 'movie'
        const key    = `${type}-${item.id}`
        const rating = item.vote_average > 0 ? `★ ${item.vote_average.toFixed(1)}` : null
        return (
          <PosterCard
            key={key}
            item={{ ...item, media_type: type }}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
            onQwClick={() => handleAddToWatchlist(item)}
            qwIcon="+"
            qwTitle="Add to watchlist"
            ratingLabel={rating}
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Recently Watched — Trakt 16/9, respects time/date prefs
// ─────────────────────────────────────────────────────────
function HistoryRow({ user, refreshKey, use12hClock, useDMY }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const CARD_W = 280

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const data = await getUserData(user)
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
          enriched.push({ ...h, title: d.title, backdrop_path: d.backdrop_path })
        } else {
          const d  = await getDetails('tv', h.showId)
          const ep = await fetch(
            `https://api.themoviedb.org/3/tv/${h.showId}/season/${h.seasonNum}/episode/${h.episodeNum}?api_key=${TMDB_KEY}`
          ).then(r => r.json())
          enriched.push({
            ...h,
            title: d.name,
            epName: ep.name,
            backdrop_path: ep.still_path || d.backdrop_path,
            epLabel: `S${h.seasonNum} E${h.episodeNum}`,
          })
        }
      } catch (e) {}
    }
    setItems(enriched)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load, refreshKey])

  if (loading) return null
  if (items.length === 0) return (
    <p className="row-empty-msg">Your watch history will appear here once you start marking things as watched.</p>
  )

  return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {items.map((item, i) => {
        const dateLabel = formatWatchedLabel(item.sortDate, use12hClock, useDMY)
        const imgSrc    = item.backdrop_path ? IMAGE_BASE + item.backdrop_path : null
        return (
          <TraktCard
            key={`${item.historyType}-${item.id || item.showId}-${i}`}
            cardWidth={CARD_W}
            imgSrc={imgSrc}
            title={item.title}
            subtitle={item.epLabel
              ? `${item.epLabel}${item.epName ? ` — ${item.epName}` : ''}`
              : null}
            pillLeft={null}
            pillRight={dateLabel}
            progressPct={undefined}
            onQwClick={null}
            onClick={() => {
              if (item.historyType === 'movie') navigate(`/movie/movie/${item.id}`)
              else navigate(`/tv/${item.showId}/season/${item.seasonNum}/episode/${item.episodeNum}`)
            }}
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Landing (signed-out)
// ─────────────────────────────────────────────────────────
function LandingPage({ onSignIn }) {
  const [trending, setTrending] = useState([])
  const navigate = useNavigate()
  useEffect(() => { getTrending().then(setTrending) }, [])

  return (
    <div className="landing-page">
      <div className="landing-hero">
        {trending[0]?.backdrop_path && (
          <div className="landing-backdrop"
            style={{ backgroundImage: `url(${IMAGE_BASE_ORIGINAL + trending[0].backdrop_path})` }} />
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
        <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
          {trending.slice(0, 6).map(item => {
            const type = item.media_type || 'movie'
            return (
              <div key={item.id} className="poster-card"
                onClick={() => navigate(`/movie/${type}/${item.id}`)}>
                <div className="poster-card-img">
                  {item.poster_path
                    ? <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} />
                    : <div className="no-poster">No Image</div>}
                </div>
                <div className="poster-card-info">
                  <p className="poster-card-title">{item.title || item.name}</p>
                  <p className="poster-card-year">{(item.release_date || item.first_air_date || '').slice(0,4)}</p>
                </div>
              </div>
            )
          })}
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
function Home({ user, onSignIn, onStreakRefresh }) {
  const [watchlistItems, setWatchlistItems] = useState([])
  const [refreshKey,     setRefreshKey]     = useState(0)

  const use12hClock = (() => { try { return localStorage.getItem('traktor_12h') === 'true' } catch { return false } })()
  const useDMY      = (() => { try { return localStorage.getItem('traktor_dmy') !== 'false'  } catch { return true  } })()

  useEffect(() => {
    const unsub = subscribeToRefresh(() => {
      setRefreshKey(k => k + 1)
      // Tell App.jsx to re-fetch streak
      onStreakRefresh?.()
    })
    return unsub
  }, [onStreakRefresh])

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const wl = Object.values(data.watchlist || {})
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      const enriched = []
      for (const item of wl.slice(0, 20)) {
        try {
          const d = await getDetails(item.media_type, item.id)
          enriched.push({ ...item, ...d })
        } catch (e) { enriched.push(item) }
      }
      setWatchlistItems(enriched)
    })
  }, [user, refreshKey])

  async function handleQuickWatch(item, type) {
    if (!user) return
    if (type === 'tv') {
      await markEpisodeWatched(user, item.id, 1, 1, 'now')
      showToast(`${item.title || item.name} S1 E1 marked as watched!`)
    } else {
      await addToWatched(user, { ...item, media_type: type }, 'now')
      showToast(`${item.title || item.name} marked as watched!`)
    }
    await removeFromWatchlist(user, { ...item, media_type: type }).catch(() => {})
    broadcastRefresh()
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
            <ContinueWatchingRow user={user} refreshKey={refreshKey} />
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
            <UpcomingRow user={user} use12hClock={use12hClock} />
          </div>

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Recommended for You</h2>
              <span className="home-section-sub">Based on your watch history</span>
            </div>
            <RecommendedRow user={user} refreshKey={refreshKey} />
          </div>

          <div className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Recently Watched</h2>
            </div>
            <HistoryRow user={user} refreshKey={refreshKey} use12hClock={use12hClock} useDMY={useDMY} />
          </div>

        </div>
      </div>
    </PageWrapper>
  )
}

export default Home