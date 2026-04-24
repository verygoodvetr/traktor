import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchMedia, IMAGE_BASE, getReleaseStatus } from '../api'

function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
    // Prevent body scroll
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const data = await searchMedia(query, 1)
      const filtered = (data.results || [])
        .filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path)
        .sort((a, b) => (b.popularity + b.vote_count * 0.1) - (a.popularity + a.vote_count * 0.1))
        .slice(0, 8)
      setResults(filtered)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function go(item) {
    navigate(`/movie/${item.media_type}/${item.id}`)
    onClose()
  }

  function goFullSearch() {
    navigate(`/search?q=${encodeURIComponent(query)}`)
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && query.trim()) goFullSearch()
  }

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-overlay-panel" onClick={e => e.stopPropagation()}>
        <div className="search-overlay-input-row">
          <span className="search-overlay-icon">⌕</span>
          <input
            ref={inputRef}
            className="search-overlay-input"
            type="text"
            placeholder="Search movies and shows…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button className="search-overlay-clear" onClick={() => setQuery('')}>✕</button>
          )}
          <button className="search-overlay-close" onClick={onClose}>Close</button>
        </div>

        {loading && (
          <div className="search-overlay-results">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="search-overlay-result-skeleton">
                <div className="skeleton" style={{ width: 44, height: 66, borderRadius: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="skeleton" style={{ width: '60%', height: 14, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: '35%', height: 12, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="search-overlay-results">
            {results.map(item => (
              <div key={item.id} className="search-overlay-result" onClick={() => go(item)}>
                <img
                  className="search-overlay-poster"
                  src={IMAGE_BASE + item.poster_path}
                  alt={item.title || item.name}
                />
                <div className="search-overlay-result-info">
                  <p className="search-overlay-title">{item.title || item.name}</p>
                  <p className="search-overlay-meta">
                    <span className="search-overlay-type">{item.media_type === 'movie' ? 'Movie' : 'TV'}</span>
                    <span>{(item.release_date || item.first_air_date || '').slice(0,4)}</span>
                    {item.vote_average > 0 && <span>★ {item.vote_average.toFixed(1)}</span>}
                  </p>
                </div>
              </div>
            ))}
            {query.trim() && (
              <button className="search-overlay-more" onClick={goFullSearch}>
                See all results for "{query}" →
              </button>
            )}
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="search-overlay-empty">No results for "{query}"</div>
        )}

        {!query && (
          <div className="search-overlay-hint">
            <p>Search for any movie or TV show</p>
            <div className="search-overlay-shortcuts">
              <span><kbd>Enter</kbd> full results</span>
              <span><kbd>Esc</kbd> close</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchOverlay