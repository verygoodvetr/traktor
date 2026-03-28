import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTrending, getPopularMovies, getPopularShows, getUpcomingMovies,
  getDetails, getMediaMeta, IMAGE_BASE, IMAGE_BASE_ORIGINAL
} from '../tmdb'
import { addToWatched, getUserData } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY

function DiscCard({ item, user, watchedSet, onWatched }) {
  const navigate = useNavigate()
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const key = `${type}-${item.id}`
  const isWatched = watchedSet?.has(key)
  const meta = getMediaMeta({ ...item, media_type: type })

  async function quickWatch(e) {
    e.stopPropagation()
    if (!user || isWatched) return
    await addToWatched(user, { ...item, media_type: type }, 'now')
    onWatched(key)
    showToast(`${item.title || item.name} marked as watched!`)
  }

  return (
    <div
      className="disc-card"
      onClick={() => navigate(`/movie/${type}/${item.id}`)}
    >
      <div className="disc-card-img">
        {item.poster_path ? (
          <img
            src={IMAGE_BASE + item.poster_path}
            alt={item.title || item.name}
            style={{ objectPosition: 'center top' }}
          />
        ) : <div className="no-poster">No Image</div>}
        {item.vote_average > 0 && (
          <span className="disc-card-tmdb">{item.vote_average.toFixed(1)}</span>
        )}
        {meta && <span className="disc-card-dur">{meta}</span>}
      </div>
      <div className="disc-card-info">
        <div className="disc-card-text">
          <p className="disc-card-title">{item.title || item.name}</p>
          <p className="disc-card-year">
            {(item.release_date || item.first_air_date || '').slice(0, 4)}
          </p>
        </div>
        {user && (
          <button
            className={`disc-quick-btn ${isWatched ? 'done' : ''}`}
            onClick={quickWatch}
            title={isWatched ? 'Watched' : 'Mark as watched'}
          >
            {isWatched ? '✓' : '+'}
          </button>
        )}
      </div>
    </div>
  )
}

function DiscRow({ title, items, loading, user, watchedSet, onWatched }) {
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

  if (!loading && items.length === 0) return null

  return (
    <div className="home-section">
      <div className="home-section-header">
        <h2 className="home-section-title">{title}</h2>
      </div>
      <div
        className="row-wrap"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {canLeft && (
          <button className={`row-arrow row-arrow-left ${hovered ? 'visible' : ''}`} onClick={() => scroll(-1)}>‹</button>
        )}
        <div className="row-scroll" ref={scrollRef} onScroll={checkArrows}>
          {loading
            ? [...Array(7)].map((_, i) => (
              <div key={i} style={{ minWidth: 145, maxWidth: 145, height: 240, background: 'var(--bg3)', borderRadius: 8 }} />
            ))
            : items.map(item => (
              <DiscCard
                key={`${item.media_type || 'movie'}-${item.id}`}
                item={item}
                user={user}
                watchedSet={watchedSet}
                onWatched={onWatched}
              />
            ))
          }
        </div>
        {canRight && (
          <button className={`row-arrow row-arrow-right ${hovered ? 'visible' : ''}`} onClick={() => scroll(1)}>›</button>
        )}
      </div>
    </div>
  )
}

import { useRef } from 'react'

function Discovery({ user }) {
  const navigate = useNavigate()
  const [trending, setTrending] = useState([])
  const [popularMovies, setPopularMovies] = useState([])
  const [popularShows, setPopularShows] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [topRated, setTopRated] = useState([])
  const [topRatedShows, setTopRatedShows] = useState([])
  const [watchedSet, setWatchedSet] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [t, pm, ps, up] = await Promise.all([
        getTrending(),
        getPopularMovies(),
        getPopularShows(),
        getUpcomingMovies(),
      ])

      // Top rated
      const [trMovies, trShows] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}`).then(r => r.json()).then(d => d.results),
        fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_KEY}`).then(r => r.json()).then(d => d.results),
      ])

      setTrending(t.map(i => ({ ...i, media_type: i.media_type || 'movie' })))
      setPopularMovies(pm.map(i => ({ ...i, media_type: 'movie' })))
      setPopularShows(ps.map(i => ({ ...i, media_type: 'tv' })))
      setUpcoming(up.map(i => ({ ...i, media_type: 'movie' })))
      setTopRated(trMovies.map(i => ({ ...i, media_type: 'movie' })))
      setTopRatedShows(trShows.map(i => ({ ...i, media_type: 'tv' })))
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!user) return
    getUserData(user).then(data => {
      setWatchedSet(new Set(Object.keys(data.watched || {})))
    })
  }, [user])

  function onWatched(key) {
    setWatchedSet(prev => new Set([...prev, key]))
  }

  return (
    <PageWrapper>
      <div className="discovery-page">
        <h1>Discovery</h1>

        <DiscRow title="Trending This Week" items={trending} loading={loading} user={user} watchedSet={watchedSet} onWatched={onWatched} />
        <DiscRow title="Popular Movies" items={popularMovies} loading={loading} user={user} watchedSet={watchedSet} onWatched={onWatched} />
        <DiscRow title="Popular TV Shows" items={popularShows} loading={loading} user={user} watchedSet={watchedSet} onWatched={onWatched} />
        <DiscRow title="Coming Soon" items={upcoming} loading={loading} user={user} watchedSet={watchedSet} onWatched={onWatched} />
        <DiscRow title="Top Rated Movies" items={topRated} loading={loading} user={user} watchedSet={watchedSet} onWatched={onWatched} />
        <DiscRow title="Top Rated TV Shows" items={topRatedShows} loading={loading} user={user} watchedSet={watchedSet} onWatched={onWatched} />
      </div>
    </PageWrapper>
  )
}

export default Discovery