import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchMedia, IMAGE_BASE, getMediaMeta, getReleaseStatus } from '../tmdb'
import PageWrapper from '../components/PageWrapper'
import { CardSkeleton } from '../components/Skeleton'

function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const navigate = useNavigate()

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setPage(1)
      setTotalPages(1)
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      const data = await searchMedia(query, 1)
      setResults(data.results)
      setTotalPages(data.totalPages)
      setPage(1)
      setLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [query])

  async function loadMore() {
    const nextPage = page + 1
    setLoading(true)
    const data = await searchMedia(query, nextPage)
    setResults(prev => [...prev, ...data.results])
    setPage(nextPage)
    setLoading(false)
  }

  const filtered = results
    .filter(item => {
      if (filter === 'movie') return item.media_type === 'movie'
      if (filter === 'tv') return item.media_type === 'tv'
      return item.media_type === 'movie' || item.media_type === 'tv'
    })
    .sort((a, b) => {
      const scoreA = a.popularity + a.vote_count * 0.1
      const scoreB = b.popularity + b.vote_count * 0.1
      return scoreB - scoreA
    })

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search movies and shows..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'movie' ? 'active' : ''} onClick={() => setFilter('movie')}>Movies</button>
          <button className={filter === 'tv' ? 'active' : ''} onClick={() => setFilter('tv')}>TV Shows</button>
        </div>

        {loading && query && (
          <div className="results-grid">
            {[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && query && filtered.length === 0 && (
          <p className="status-text">No results found.</p>
        )}

        {!loading && (
          <div className="results-grid">
            {filtered.map(item => (
              <div
                className="media-card"
                key={item.id}
                onClick={() => navigate(`/movie/${item.media_type}/${item.id}`)}
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
                  {item.overview && (
                    <p className="media-overview">{item.overview}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {query && page < totalPages && (
          <div className="load-more">
            <button onClick={loadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}

export default Search