import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTrending, getDetails, getStartWatchingMeta,
  getPersonalizedRecommendations,
  getSeasonDetails,
  IMAGE_BASE, IMAGE_BASE_ORIGINAL, IMAGE_BASE_LARGE
} from '../api'
import { getUserData, markEpisodeWatched, addToWatched, removeFromWatchlist, addToWatchlist } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'
import { getDisplayPrefs, formatDateWithPattern, formatTimeWithPrefs } from './Settings'

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
// Date helpers - now respects user preferences
// ─────────────────────────────────────────────────────────
function formatWatchedLabel(date, prefs) {
  const now  = new Date()
  const diff = Math.floor((now - date) / 86400000)
  const time = formatTimeWithPrefs(date, prefs.use12h, prefs.showSeconds)

  if (diff === 0) return `Today ${time}`.trim()
  if (diff === 1) return `Yesterday ${time}`.trim()

  const dateStr = formatDateWithPattern(date, prefs.dateFormat)
  return `${dateStr} ${time}`.trim()
}

// ─────────────────────────────────────────────────────────
// Intersection-observer based lazy section
// ─────────────────────────────────────────────────────────
function LazySection({ children, title, sub, placeholder }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [hasContent, setHasContent] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Check content after children render
  const contentRef = useRef(null)
  useEffect(() => {
    if (!visible) return
    const check = () => {
      if (!contentRef.current) return
      // null children means the row returned null (empty)
      const hasCards = contentRef.current.children.length > 0
      setHasContent(hasCards)
    }
    const t = setTimeout(check, 800) // allow async rows to finish
    return () => clearTimeout(t)
  }, [visible, children])

  return (
    <div ref={ref} className="home-section" style={{ display: hasContent ? undefined : 'none' }}>
      <div className="home-section-header">
        <h2 className="home-section-title">{title}</h2>
        {sub && <span className="home-section-sub">{sub}</span>}
      </div>
      <div ref={contentRef}>
        {visible ? children : placeholder}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ScrollRow – zoom-safe fixed pixel scroll
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
    el.scrollBy({ left: dir * (cardWidth + gap) * 4, behavior: 'smooth' })
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
// Skeleton shapes matching actual cards
// ─────────────────────────────────────────────────────────
function TraktSkeleton({ count = 4, cardWidth = 280 }) {
  return (
    <div className="scroll-row-outer">
      <div className="scroll-arrow scroll-arrow-left" />
      <div className="row-scroll">
        {[...Array(count)].map((_, i) => (
          <div key={i} style={{ minWidth: cardWidth, maxWidth: cardWidth, flexShrink: 0 }}>
            <div className="skeleton" style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10 }} />
            <div style={{ padding: '8px 2px 0', display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '75%', height: 14, borderRadius: 4, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '50%', height: 12, borderRadius: 4 }} />
              </div>
              <div className="skeleton" style={{ width: 30, height: 30, borderRadius: '50%' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="scroll-arrow scroll-arrow-right" />
    </div>
  )
}

function PosterSkeleton({ count = 6, cardWidth = 160 }) {
  return (
    <div className="scroll-row-outer">
      <div className="scroll-arrow scroll-arrow-left" />
      <div className="row-scroll">
        {[...Array(count)].map((_, i) => (
          <div key={i} style={{ minWidth: cardWidth, maxWidth: cardWidth, flexShrink: 0 }}>
            <div className="skeleton" style={{ width: '100%', aspectRatio: '2/3', borderRadius: 8 }} />
            <div style={{ padding: '7px 2px 0' }}>
              <div className="skeleton" style={{ width: '80%', height: 13, borderRadius: 4, marginBottom: 5 }} />
              <div className="skeleton" style={{ width: '40%', height: 11, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="scroll-arrow scroll-arrow-right" />
    </div>
  )
}

function ScheduleSkeleton({ count = 4 }) {
  return (
    <div className="scroll-row-outer">
      <div className="scroll-arrow scroll-arrow-left" />
      <div className="row-scroll">
        {[...Array(count)].map((_, i) => (
          <div key={i} style={{ minWidth: 220, maxWidth: 220, flexShrink: 0 }}>
            <div className="skeleton" style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10 }} />
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ width: '80%', height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: '50%', height: 12, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: '40%', height: 11, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="scroll-arrow scroll-arrow-right" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// TraktCard — 16/9 horizontal card
// ─────────────────────────────────────────────────────────
function TraktCard({ imgSrc, title, subtitle, pillLeft, pillRight, progressPct, onQwClick, qwIcon = '✓', qwTitle = '', onClick, cardWidth = 280 }) {
  return (
    <div className="trakt-card" style={{ minWidth: cardWidth, maxWidth: cardWidth }} onClick={onClick}>
      <div className="trakt-card-img">
        {imgSrc
          ? <img src={imgSrc} alt={title} loading="lazy" />
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
          <button className="trakt-qw-btn" onClick={e => { e.stopPropagation(); onQwClick() }} title={qwTitle}>
            {qwIcon}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// PosterCard — 2/3 vertical card
// ─────────────────────────────────────────────────────────
function PosterCard({ item, onClick, onQwClick, qwIcon = '+', qwTitle = '', bottomLeft, cardWidth = 160 }) {
  return (
    <div className="poster-card" style={{ minWidth: cardWidth, maxWidth: cardWidth }} onClick={onClick}>
      <div className="poster-card-img">
        {item.poster_path
          ? <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} loading="lazy" />
          : <div className="no-poster">No Image</div>
        }
        {bottomLeft && (
          <span style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(0,0,0,0.72)', color: 'rgba(255,255,255,0.9)',
            fontSize: 10, fontWeight: 600, padding: '3px 7px', borderRadius: 4,
            backdropFilter: 'blur(4px)'
          }}>{bottomLeft}</span>
        )}
      </div>
      <div className="trakt-card-info" style={{ padding: '7px 2px 0' }}>
        <div className="trakt-card-text">
          <p className="poster-card-title">{item.title || item.name}</p>
          <p className="poster-card-year">{item._subtitle || (item.release_date || item.first_air_date || '').slice(0,4)}</p>
        </div>
        {onQwClick && (
          <button className="trakt-qw-btn" style={{ flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onQwClick() }} title={qwTitle}>
            {qwIcon}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Continue Watching
// ─────────────────────────────────────────────────────────
function ContinueWatchingRow({ user, refreshKey }) {
  const [items, setItems] = useState(null) // null = loading
  const navigate = useNavigate()
  const CARD_W = 280

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
    const data = await getUserData(user)
    const showIds = new Set()
    Object.values(data.episodes || {}).forEach(ep => showIds.add(ep.showId))

    if (showIds.size === 0) { setItems([]); return }

    // Fetch all show details in parallel (batch by 10)
    const showIdArray = Array.from(showIds)
    const showDetails = {}

    // Fetch in batches to avoid rate limiting
    const BATCH_SIZE = 10
    for (let i = 0; i < showIdArray.length; i += BATCH_SIZE) {
      const batch = showIdArray.slice(i, i + BATCH_SIZE)
      const promises = batch.map(async (showId) => {
        try {
          const details = await getDetails('tv', showId)
          return { showId, details }
        } catch (e) { return null }
      })
      const results = await Promise.all(promises)
      results.forEach(r => { if (r) showDetails[r.showId] = r.details })
    }

    const result = []
    for (const showId of showIdArray) {
      if (data.watched[`tv-${showId}`]) continue
      const details = showDetails[showId]
      if (!details) continue
      if (details.first_air_date && new Date(details.first_air_date) > new Date()) continue

      // Fetch all season data in parallel using unified API
      const seasonPromises = (details.seasons || [])
        .filter(s => s.season_number > 0)
        .map(s => getSeasonDetails(showId, s.season_number).catch(() => null))
      const seasonDataResults = await Promise.all(seasonPromises)

      const airedEps = []
      seasonDataResults.forEach((sd) => {
        if (!sd?.episodes) return
        for (const ep of sd.episodes) {
          if (ep.air_date && new Date(ep.air_date) > new Date()) continue
          airedEps.push({ ...ep, seasonNum: ep.seasonNumber || ep.seasonNum })
        }
      })

      if (airedEps.length === 0) continue

      let furthestIdx = -1
      airedEps.forEach((ep, idx) => {
        if (data.episodes[`tv-${showId}-s${ep.seasonNum}e${ep.episode_number}`]) furthestIdx = idx
      })
      if (furthestIdx === -1) continue

      const nextEpObj = furthestIdx >= airedEps.length - 1 ? airedEps[0] : airedEps[furthestIdx + 1]
      const availableToWatch = airedEps.filter(ep => !data.episodes[`tv-${showId}-s${ep.seasonNum}e${ep.episode_number}`]).length
      const showEps = Object.values(data.episodes).filter(e => e.showId === showId)
      const totalEps = details.seasons?.filter(s => s.season_number > 0).reduce((acc, s) => acc + s.episode_count, 0) || 0

      // Skip shows that are "up to date" (all episodes watched)
      if (availableToWatch === 0) continue

      result.push({
        showId, showTitle: details.name, backdrop_path: details.backdrop_path,
        nextEp: nextEpObj, nextEpRuntime: nextEpObj.runtime, nextEpStill: nextEpObj.still_path || null,
        watchedCount: showEps.length, totalEps, availableToWatch,
        lastWatched: showEps.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))[0]?.watchedAt,
      })
    }
    setItems(result.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched)))
  }, [user])

  useEffect(() => { setItems(null); load() }, [load, refreshKey])

  async function quickWatch(item) {
    if (!item.nextEp) return
    await markEpisodeWatched(user, item.showId, item.nextEp.seasonNum, item.nextEp.episode_number, 'now')
    showToast(`S${item.nextEp.seasonNum} E${item.nextEp.episode_number} marked as watched!`)
    broadcastRefresh()
  }

  if (items === null) return <TraktSkeleton count={4} cardWidth={CARD_W} />
  if (items.length === 0) return null

  return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {items.map(item => {
        const pct = item.totalEps > 0 ? Math.min(100, (item.watchedCount / item.totalEps) * 100) : 0
        const imgSrc = item.nextEpStill ? IMAGE_BASE_LARGE + item.nextEpStill
          : item.backdrop_path ? IMAGE_BASE_ORIGINAL + item.backdrop_path : null
        return (
          <TraktCard key={item.showId} cardWidth={CARD_W} imgSrc={imgSrc}
            title={item.showTitle}
            subtitle={item.nextEp ? `S${item.nextEp.seasonNum} · E${item.nextEp.episode_number}${item.nextEp.name ? ` — ${item.nextEp.name}` : ''}` : null}
            pillLeft={item.nextEpRuntime ? `${item.nextEpRuntime}m` : null}
            pillRight={item.availableToWatch > 0 ? `${item.availableToWatch} to watch` : 'Up to date'}
            progressPct={pct}
            onQwClick={() => quickWatch(item)} qwIcon="✓" qwTitle="Mark episode as watched"
            onClick={() => item.nextEp
              ? navigate(`/tv/${item.showId}/season/${item.nextEp.seasonNum}/episode/${item.nextEp.episode_number}`)
              : navigate(`/movie/tv/${item.showId}`)}
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Start Watching — vertical poster, meta on image, episode subtitle for shows
// ─────────────────────────────────────────────────────────
function StartWatchingRow({ items, user, onQuickWatch }) {
  const navigate = useNavigate()
  const CARD_W = 160

  const scored = items
    .filter(item => {
      const d = item.release_date || item.first_air_date
      return d && new Date(d) <= new Date()
    })
    .map(item => {
      const pop = item.popularity || 0
      const rating = (item.vote_average || 0) * 10
      const recency = item.addedAt ? Math.max(0, 30 - (Date.now() - new Date(item.addedAt)) / 86400000) : 0
      return { ...item, _score: pop * 0.4 + rating * 0.4 + recency * 0.2 }
    })
    .sort((a, b) => b._score - a._score)

  if (scored.length === 0) return null

  return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {scored.map(item => {
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')

        // Bottom-left pill: runtime for movies, seasons/episodes for shows
        let bottomLeft = null
        if (type === 'movie' && item.runtime) bottomLeft = `${item.runtime}m`
        else if (type === 'tv') {
          if (item.number_of_seasons > 1) bottomLeft = `${item.number_of_seasons} seasons`
          else if (item.number_of_episodes) bottomLeft = `${item.number_of_episodes} eps`
        }

        // Subtitle: for shows show S1 E1, for movies show year
        let subtitle = null
        if (type === 'tv') {
          // Find next episode to watch (S1E1 since nothing watched)
          subtitle = 'S1 E1'
        } else {
          subtitle = (item.release_date || '').slice(0, 4)
        }

        return (
          <PosterCard
            key={`${type}-${item.id}`}
            cardWidth={CARD_W}
            item={{ ...item, media_type: type, _subtitle: subtitle }}
            bottomLeft={bottomLeft}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
            onQwClick={() => onQuickWatch(item, type)}
            qwIcon="✓"
            qwTitle={type === 'tv' ? 'Watch S1 E1' : 'Mark as watched'}
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Upcoming Schedule — now uses user's date format preference
// ─────────────────────────────────────────────────────────
function UpcomingRow({ user }) {
  const [items, setItems] = useState(null)
  const navigate = useNavigate()
  const prefs = getDisplayPrefs()

  useEffect(() => {
    if (!user) { setItems([]); return }
    getUserData(user).then(async data => {
      const tvIds = new Set()
      Object.values(data.episodes  || {}).forEach(ep => tvIds.add(String(ep.showId)))
      Object.values(data.watched   || {}).forEach(w  => { if (w.media_type === 'tv') tvIds.add(String(w.id)) })
      Object.values(data.watchlist || {}).forEach(w  => { if (w.media_type === 'tv') tvIds.add(String(w.id)) })

      const upcoming = []
      const seenKeys = new Set()
      const todayOnly = new Date().toISOString().slice(0, 10)
      const twoWeeksFromNow = new Date()
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
      const twoWeeksStr = twoWeeksFromNow.toISOString().slice(0, 10)

      // Fetch all TV details in batches (parallel)
      const tvIdArray = Array.from(tvIds)
      const BATCH_SIZE = 10
      const tvDetails = {}

      for (let i = 0; i < tvIdArray.length; i += BATCH_SIZE) {
        const batch = tvIdArray.slice(i, i + BATCH_SIZE)
        const promises = batch.map(async (id) => {
          try {
            const details = await getDetails('tv', id)
            return { id, details }
          } catch (e) { return null }
        })
        const results = await Promise.all(promises)
        results.forEach(r => { if (r) tvDetails[r.id] = r.details })
      }

      for (const id of tvIdArray) {
        try {
          const details = tvDetails[id]
          if (!details) continue
          const neta = details.next_episode_to_air
          if (!neta?.air_date) continue
          const airDateOnly = neta.air_date
          if (airDateOnly < todayOnly) continue
          if (airDateOnly > twoWeeksStr) continue // Skip episodes more than 2 weeks away
          const key = `tv-${id}-s${neta.season_number}e${neta.episode_number}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          upcoming.push({ id: parseInt(id), title: details.name, poster_path: details.poster_path, backdrop_path: details.backdrop_path, airDateStr: airDateOnly, nextEp: neta })
        } catch (e) {}
      }

      for (const [, item] of Object.entries(data.watchlist || {})) {
        if (item.media_type !== 'movie') continue
        try {
          const details = await getDetails('movie', item.id)
          if (!details.release_date) continue
          if (details.release_date < todayOnly) continue
          // Filter movies to only show if releasing within 14 days
          const daysUntil = Math.floor((new Date(details.release_date) - new Date(todayOnly)) / 86400000)
          if (daysUntil > 14) continue
          upcoming.push({ id: item.id, title: details.title, poster_path: details.poster_path, backdrop_path: details.backdrop_path, airDateStr: details.release_date, isMovie: true })
        } catch (e) {}
      }

      setItems(upcoming.sort((a, b) => a.airDateStr.localeCompare(b.airDateStr)).slice(0, 20))
    })
  }, [user])

  function formatLabel(airDateStr) {
    const todayOnly = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date()
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrowOnly = tomorrowDate.toISOString().slice(0, 10)

    if (airDateStr === todayOnly) return 'Today'
    if (airDateStr === tomorrowOnly) return 'Tomorrow'

    const diff = Math.floor((new Date(airDateStr) - new Date(todayOnly)) / 86400000)
    if (diff <= 7) return `In ${diff} days`
    // Use user's date format preference
    return formatDateWithPattern(new Date(airDateStr), prefs.dateFormat)
  }

  if (items === null) return <ScheduleSkeleton count={4} />
  if (items.length === 0) return null

  return (
    <ScrollRow cardWidth={220} gap={14}>
      {items.map(item => (
        <div className="schedule-card" key={`${item.isMovie ? 'movie' : 'tv'}-${item.id}`}
          onClick={() => navigate(`/movie/${item.isMovie ? 'movie' : 'tv'}/${item.id}`)}>
          {item.backdrop_path
            ? <img className="schedule-card-img" src={IMAGE_BASE_ORIGINAL + item.backdrop_path} alt={item.title} loading="lazy" />
            : <div className="schedule-card-img" style={{ background: 'var(--bg4)' }} />}
          <div className="schedule-card-info">
            <p className="schedule-card-title">{item.title}</p>
            <p className="schedule-card-date">{formatLabel(item.airDateStr)}</p>
            <p className="schedule-card-sub">
              {item.isMovie ? 'Movie release' : item.nextEp ? `S${item.nextEp.season_number} E${item.nextEp.episode_number}${item.nextEp.name ? ` — ${item.nextEp.name}` : ''}` : 'New episode'}
            </p>
          </div>
        </div>
      ))}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Recommended — filters watched + watchlist + in-progress
// ─────────────────────────────────────────────────────────
function RecommendedRow({ user, refreshKey }) {
  const [items, setItems] = useState(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
    const data = await getUserData(user)
    const watched = Object.values(data.watched || {})
    if (watched.length === 0) { setItems([]); return }

    const recs = await getPersonalizedRecommendations(watched)
    const watchedKeys = new Set(Object.keys(data.watched || {}))
    const watchlistKeys = new Set(Object.keys(data.watchlist || {}))
    const inProgressIds = new Set()
    Object.values(data.episodes || {}).forEach(ep => inProgressIds.add(ep.showId))

    setItems(recs.filter(r => {
      const type = r.media_type || 'movie'
      const key = `${type}-${r.id}`
      if (watchedKeys.has(key)) return false
      if (watchlistKeys.has(key)) return false
      if (type === 'tv' && inProgressIds.has(r.id)) return false
      return true
    }))
  }, [user])

  useEffect(() => { setItems(null); load() }, [load, refreshKey])

  async function addToWL(item) {
    const type = item.media_type || 'movie'
    const key = `${type}-${item.id}`
    await addToWatchlist(user, { ...item, media_type: type })
    setItems(prev => prev.filter(r => `${r.media_type || 'movie'}-${r.id}` !== key))
    showToast('Added to watchlist!')
    broadcastRefresh()
  }

  if (items === null) return <PosterSkeleton count={6} cardWidth={160} />
  if (items.length === 0) return null

  return (
    <ScrollRow cardWidth={160} gap={14}>
      {items.map(item => {
        const type = item.media_type || 'movie'
        return (
          <PosterCard key={`${type}-${item.id}`}
            item={{ ...item, media_type: type }}
            onClick={() => navigate(`/movie/${type}/${item.id}`)}
            onQwClick={() => addToWL(item)}
            qwIcon="+" qwTitle="Add to watchlist"
          />
        )
      })}
    </ScrollRow>
  )
}

// ─────────────────────────────────────────────────────────
// Recently Watched — movies show year, episodes show ep info
// ─────────────────────────────────────────────────────────
function HistoryRow({ user, refreshKey }) {
  const [items, setItems] = useState(null)
  const navigate = useNavigate()
  const CARD_W = 280
  const prefs = getDisplayPrefs()

  const load = useCallback(async () => {
    if (!user) { setItems([]); return }
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
          enriched.push({ ...h, title: d.title, backdrop_path: d.backdrop_path, releaseYear: (d.release_date || '').slice(0, 4) })
        } else {
          const d = await getDetails('tv', h.showId)
          const seasonData = await getSeasonDetails(h.showId, h.seasonNum)
          const ep = seasonData?.episodes?.find(e => e.episodeNumber === h.episodeNum || e.episode_number === h.episodeNum)
          enriched.push({ ...h, title: d.name, epName: ep?.name, backdrop_path: ep?.still_path || d.backdrop_path, epLabel: `S${h.seasonNum} E${h.episodeNum}` })
        }
      } catch (e) {}
    }
    setItems(enriched)
  }, [user])

  useEffect(() => { setItems(null); load() }, [load, refreshKey])

  if (items === null) return <TraktSkeleton count={4} cardWidth={CARD_W} />
  if (items.length === 0) return null

  return (
    <ScrollRow cardWidth={CARD_W} gap={14}>
      {items.map((item, i) => {
        const dateLabel = formatWatchedLabel(item.sortDate, prefs)
        const imgSrc = item.backdrop_path ? IMAGE_BASE + item.backdrop_path : null
        const subtitle = item.historyType === 'movie'
          ? (item.releaseYear || null)
          : (item.epLabel ? `${item.epLabel}${item.epName ? ` — ${item.epName}` : ''}` : null)

        return (
          <TraktCard key={`${item.historyType}-${item.id || item.showId}-${i}`}
            cardWidth={CARD_W} imgSrc={imgSrc} title={item.title} subtitle={subtitle}
            pillLeft={null} pillRight={dateLabel} progressPct={undefined} onQwClick={null}
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
// Empty home state (brand new user)
// ─────────────────────────────────────────────────────────
function EmptyHome({ user }) {
  const navigate = useNavigate()
  return (
    <div className="empty-home">
      <div className="empty-home-inner">
        <div className="empty-home-icon">🎬</div>
        <h2>Welcome to Traktor, {user.displayName?.split(' ')[0] || 'there'}!</h2>
        <p>Start building your watch history. Search for movies and shows, mark them as watched, and your personalised feed will appear here.</p>
        <div className="empty-home-actions">
          <button className="landing-btn-primary" onClick={() => navigate('/search')}>
            Search for something to watch
          </button>
          <button className="action-btn" onClick={() => navigate('/discovery')}>
            Browse Discovery
          </button>
        </div>
        <div className="empty-home-steps">
          <div className="empty-step">
            <span className="empty-step-num">1</span>
            <span>Search or browse Discovery</span>
          </div>
          <div className="empty-step">
            <span className="empty-step-num">2</span>
            <span>Mark movies and shows as watched</span>
          </div>
          <div className="empty-step">
            <span className="empty-step-num">3</span>
            <span>Get personalised recommendations</span>
          </div>
        </div>
      </div>
    </div>
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
          <div className="landing-backdrop" style={{ backgroundImage: `url(${IMAGE_BASE_ORIGINAL + trending[0].backdrop_path})` }} />
        )}
        <div className="landing-overlay" />
        <div className="landing-content">
          <div className="landing-logo">Traktor</div>
          <p className="landing-tagline">Track every movie and show you watch.</p>
          <p className="landing-desc">Keep your watch history, rate what you've seen, build watchlists, track episode progress and get personalised recommendations.</p>
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
              <div key={item.id} className="poster-card" onClick={() => navigate(`/movie/${type}/${item.id}`)}>
                <div className="poster-card-img">
                  {item.poster_path ? <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} loading="lazy" /> : <div className="no-poster">No Image</div>}
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
  const [refreshKey, setRefreshKey] = useState(0)
  const [isNewUser, setIsNewUser] = useState(false)
  const [checkedEmpty, setCheckedEmpty] = useState(false)

  useEffect(() => {
    const unsub = subscribeToRefresh(() => {
      setRefreshKey(k => k + 1)
      onStreakRefresh?.()
    })
    return unsub
  }, [onStreakRefresh])

  useEffect(() => {
    if (!user) return
    getUserData(user).then(async data => {
      const wl = Object.values(data.watchlist || {}).sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      const enriched = []
      for (const item of wl.slice(0, 20)) {
        try {
          const d = await getDetails(item.media_type, item.id)
          enriched.push({ ...item, ...d })
        } catch (e) { enriched.push(item) }
      }
      setWatchlistItems(enriched)

      // Check if truly new user (no watched, no episodes, no watchlist)
      const hasAnyData = Object.keys(data.watched || {}).length > 0
        || Object.keys(data.episodes || {}).length > 0
        || Object.keys(data.watchlist || {}).length > 0
      setIsNewUser(!hasAnyData)
      setCheckedEmpty(true)
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

  if (checkedEmpty && isNewUser) return <PageWrapper><EmptyHome user={user} /></PageWrapper>

  return (
    <PageWrapper>
      <div className="home-page">
        <div className="home-rows">

          <LazySection title="Continue Watching" placeholder={<TraktSkeleton count={4} cardWidth={280} />}>
            <ContinueWatchingRow user={user} refreshKey={refreshKey} />
          </LazySection>

          <LazySection title="Start Watching" sub="From your watchlist" placeholder={<PosterSkeleton count={6} cardWidth={160} />}>
            <StartWatchingRow items={watchlistItems} user={user} onQuickWatch={handleQuickWatch} />
          </LazySection>

          <LazySection title="Upcoming Schedule" sub="New episodes and releases" placeholder={<ScheduleSkeleton count={4} />}>
            <UpcomingRow user={user} />
          </LazySection>

          <LazySection title="Recommended for You" sub="Based on your watch history" placeholder={<PosterSkeleton count={6} cardWidth={160} />}>
            <RecommendedRow user={user} refreshKey={refreshKey} />
          </LazySection>

          <LazySection title="Recently Watched" placeholder={<TraktSkeleton count={4} cardWidth={280} />}>
            <HistoryRow user={user} refreshKey={refreshKey} />
          </LazySection>

        </div>
      </div>
    </PageWrapper>
  )
}

export default Home