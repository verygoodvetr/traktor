import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTrending, getPopularMovies, getPopularShows, getUpcomingMovies,
  IMAGE_BASE, IMAGE_BASE_LARGE,
} from '../tmdb'
import { addToWatched, getUserData, addToWatchlist, removeFromWatchlist } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY

// ─── Badge logic (same as Netflix-style) ───────────────
function getDiscBadge(item, hideBadge = false) {
  if (hideBadge) return null // Allow hiding badges (e.g., Coming Soon section)

  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const dateStr = type === 'movie' ? item.release_date : item.first_air_date
  if (!dateStr) return null

  const release = new Date(dateStr)
  const now = new Date()
  const daysSince = (now - release) / (1000 * 60 * 60 * 24)

  if (type === 'movie') {
    // In theatres: released within last 90 days but NOT yet on streaming (rough heuristic)
    if (daysSince >= 0 && daysSince <= 90) return { text: 'IN THEATRES', color: '#e50914' }
    // Coming soon
    if (daysSince < 0 && daysSince > -120) return { text: 'COMING SOON', color: '#1d4ed8' }
  } else {
    // New show / recently premiered
    if (daysSince >= 0 && daysSince <= 30) return { text: 'NEW', color: '#16a34a' }
    if (daysSince < 0) return { text: 'UPCOMING', color: '#1d4ed8' }
  }
  return null
}

// ─── Discovery card — matches Start Watching style exactly ─
function DiscCard({ item, user, watchedSet, watchlistSet, onWatched, onAddedToWatchlist, hideBadge }) {
  const navigate = useNavigate()
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const key = `${type}-${item.id}`
  const isWatched = watchedSet?.has(key)
  const isInWatchlist = watchlistSet?.has(key)
  const badge = getDiscBadge(item, hideBadge)

  // TMDB rating pill (bottom-left, like Start Watching meta)
  const rating = item.vote_average > 0 ? `★ ${item.vote_average.toFixed(1)}` : null

  // Subtitle: year
  const year = (item.release_date || item.first_air_date || '').slice(0, 4)

  async function quickAdd(e) {
    e.stopPropagation()
    if (!user) return
    if (isInWatchlist) {
      // Already in watchlist, remove it
      await removeFromWatchlist(user, { ...item, media_type: type })
      showToast(`${item.title || item.name} removed from watchlist`)
    } else {
      // Add to watchlist
      await addToWatchlist(user, { ...item, media_type: type })
      showToast(`${item.title || item.name} added to watchlist!`)
    }
    onAddedToWatchlist(key, !isInWatchlist)
  }

  return (
    <div className="poster-card disc-poster-card" style={{ minWidth: 160, maxWidth: 160 }}
      onClick={() => navigate(`/movie/${type}/${item.id}`)}>

      {/* Poster image */}
      <div className="poster-card-img">
        {item.poster_path
          ? <img src={IMAGE_BASE + item.poster_path} alt={item.title || item.name} loading="lazy" style={{ objectPosition: 'center top' }} />
          : <div className="no-poster">No Image</div>}

        {/* Netflix-style ribbon badge */}
        {badge && (
          <div className="disc-ribbon" style={{ background: badge.color }}>
            {badge.text}
          </div>
        )}

        {/* TMDB rating — bottom left */}
        {rating && (
          <span className="disc-rating-pill">{rating}</span>
        )}
      </div>

      {/* Info row — title left, QW button right */}
      <div className="trakt-card-info" style={{ padding: '7px 2px 0' }}>
        <div className="trakt-card-text">
          <p className="poster-card-title">{item.title || item.name}</p>
          <p className="poster-card-year">{year}</p>
        </div>
        {user && (
          <button
            className="trakt-qw-btn"
            style={{ flexShrink: 0, background: isInWatchlist ? 'var(--green)' : undefined }}
            onClick={quickAdd}
            title={isInWatchlist ? 'In watchlist (click to remove)' : 'Add to watchlist'}
          >
            {isInWatchlist ? '✓' : '+'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Scroll row with proper arrow management ────────────
function DiscRow({ title, items, loading, user, watchedSet, watchlistSet, onWatched, onAddedToWatchlist, hideBadge }) {
  const scrollRef = useRef(null)
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(true)
  const CARD_W = 160

  function checkArrows() {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkArrows()
    const ro = new ResizeObserver(checkArrows)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items])

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * (CARD_W + 14) * 4, behavior: 'smooth' })
    setTimeout(checkArrows, 350)
  }

  if (!loading && items.length === 0) return null

  return (
    <div className="home-section">
      <div className="home-section-header">
        <h2 className="home-section-title">{title}</h2>
      </div>
      <div className="scroll-row-outer">
        <button className={`scroll-arrow scroll-arrow-left${canLeft ? ' visible' : ''}`} onClick={() => scroll(-1)}>‹</button>
        <div className="row-scroll" ref={scrollRef} onScroll={checkArrows}>
          {loading
            ? [...Array(8)].map((_, i) => (
                <div key={i} style={{ minWidth: CARD_W, maxWidth: CARD_W, flexShrink: 0 }}>
                  <div className="skeleton" style={{ width: '100%', aspectRatio: '2/3', borderRadius: 8 }} />
                  <div style={{ padding: '7px 2px 0' }}>
                    <div className="skeleton" style={{ width: '75%', height: 13, borderRadius: 4, marginBottom: 5 }} />
                    <div className="skeleton" style={{ width: '40%', height: 11, borderRadius: 4 }} />
                  </div>
                </div>
              ))
            : items.map(item => (
                <DiscCard
                  key={`${item.media_type || 'movie'}-${item.id}`}
                  item={item} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet}
                  onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={hideBadge}
                />
              ))
          }
        </div>
        <button className={`scroll-arrow scroll-arrow-right${canRight ? ' visible' : ''}`} onClick={() => scroll(1)}>›</button>
      </div>
    </div>
  )
}

// ─── Main Discovery page ────────────────────────────────
function Discovery({ user }) {
  const [trending,      setTrending]      = useState([])
  const [popularMovies, setPopularMovies] = useState([])
  const [popularShows,  setPopularShows]  = useState([])
  const [upcoming,      setUpcoming]      = useState([])
  const [topRated,      setTopRated]      = useState([])
  const [topRatedShows, setTopRatedShows] = useState([])
  const [watchedSet,    setWatchedSet]    = useState(new Set())
  const [watchlistSet,  setWatchlistSet]  = useState(new Set())
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      const [t, pm, ps, up, trM, trS] = await Promise.all([
        getTrending(),
        getPopularMovies(),
        getPopularShows(),
        getUpcomingMovies(),
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}`).then(r => r.json()).then(d => d.results || []),
        fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_KEY}`).then(r => r.json()).then(d => d.results || []),
      ])
      setTrending((t  || []).map(i => ({ ...i, media_type: i.media_type || 'movie' })))
      setPopularMovies((pm || []).map(i => ({ ...i, media_type: 'movie' })))
      setPopularShows((ps  || []).map(i => ({ ...i, media_type: 'tv' })))
      setUpcoming((up  || []).map(i => ({ ...i, media_type: 'movie' })))
      setTopRated((trM || []).map(i => ({ ...i, media_type: 'movie' })))
      setTopRatedShows((trS || []).map(i => ({ ...i, media_type: 'tv' })))
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!user) return
    getUserData(user).then(data => {
      setWatchedSet(new Set(Object.keys(data.watched || {})))
      setWatchlistSet(new Set(Object.keys(data.watchlist || {})))
    })
  }, [user])

  function onWatched(key) {
    setWatchedSet(prev => new Set([...prev, key]))
  }

  function onAddedToWatchlist(key, added) {
    setWatchlistSet(prev => {
      const newSet = new Set(prev)
      if (added) {
        newSet.add(key)
      } else {
        newSet.delete(key)
      }
      return newSet
    })
  }

  return (
    <PageWrapper>
      <div className="discovery-page">
        <h1>Discovery</h1>
        <DiscRow title="Trending This Week" items={trending}      loading={loading} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet} onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={false} />
        <DiscRow title="Popular Movies"     items={popularMovies} loading={loading} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet} onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={false} />
        <DiscRow title="Popular TV Shows"   items={popularShows}  loading={loading} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet} onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={false} />
        <DiscRow title="Coming Soon"        items={upcoming}      loading={loading} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet} onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={true} />
        <DiscRow title="Top Rated Movies"   items={topRated}      loading={loading} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet} onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={false} />
        <DiscRow title="Top Rated TV Shows" items={topRatedShows} loading={loading} user={user} watchedSet={watchedSet} watchlistSet={watchlistSet} onWatched={onWatched} onAddedToWatchlist={onAddedToWatchlist} hideBadge={false} />
      </div>
    </PageWrapper>
  )
}

export default Discovery