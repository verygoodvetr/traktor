import { useEffect, useState } from 'react'
import { getUserData } from '../firestore'
import { getDetails, IMAGE_BASE } from '../tmdb'
import { useNavigate } from 'react-router-dom'
import PageWrapper from '../components/PageWrapper'
import { CardSkeleton } from '../components/Skeleton'

function Profile({ user }) {
  const [watchedMovies, setWatchedMovies] = useState([])
  const [watchedShows, setWatchedShows] = useState([])
  const [watchlistMovies, setWatchlistMovies] = useState([])
  const [watchlistShows, setWatchlistShows] = useState([])
  const [inProgress, setInProgress] = useState([])
  const [tab, setTab] = useState('movies')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getUserData(user).then(async data => {
      const allWatched = Object.values(data.watched).sort((a, b) =>
        new Date(b.watchedAt) - new Date(a.watchedAt)
      )

      setWatchedMovies(allWatched.filter(i => i.media_type === 'movie'))
      setWatchedShows(allWatched.filter(i => i.media_type === 'tv'))

      const allWatchlist = Object.values(data.watchlist).sort((a, b) =>
        new Date(b.addedAt) - new Date(a.addedAt)
      )
      setWatchlistMovies(allWatchlist.filter(i => i.media_type === 'movie'))
      setWatchlistShows(allWatchlist.filter(i => i.media_type === 'tv'))

      const showIds = new Set()
      Object.values(data.episodes || {}).forEach(ep => showIds.add(ep.showId))

      const inProgressShows = []
      for (const showId of showIds) {
        if (data.watched[`tv-${showId}`]) continue
        try {
          const details = await getDetails('tv', showId)
          const showEps = Object.values(data.episodes).filter(e => e.showId === showId)
          const totalEps = details.seasons
            ?.filter(s => s.season_number > 0)
            .reduce((sum, s) => sum + s.episode_count, 0) || 0
          inProgressShows.push({
            id: showId,
            media_type: 'tv',
            title: details.name,
            poster_path: details.poster_path,
            watchedCount: showEps.length,
            totalEps,
            lastWatched: showEps.sort((a, b) =>
              new Date(b.watchedAt) - new Date(a.watchedAt)
            )[0]?.watchedAt
          })
        } catch (e) {}
      }

      setInProgress(inProgressShows.sort((a, b) =>
        new Date(b.lastWatched) - new Date(a.lastWatched)
      ))
      setLoading(false)
    })
  }, [user])

  const tabs = [
    { key: 'movies', label: `Movies (${watchedMovies.length})` },
    { key: 'shows', label: `TV Shows (${watchedShows.length})` },
    { key: 'inprogress', label: `In Progress (${inProgress.length})` },
    { key: 'watchlist-movies', label: `Movie Watchlist (${watchlistMovies.length})` },
    { key: 'watchlist-shows', label: `TV Watchlist (${watchlistShows.length})` },
  ]

  const itemMap = {
    movies: watchedMovies,
    shows: watchedShows,
    inprogress: inProgress,
    'watchlist-movies': watchlistMovies,
    'watchlist-shows': watchlistShows,
  }

  const items = itemMap[tab] || []

  const emptyMessages = {
    movies: "You haven't watched any movies yet.",
    shows: "You haven't watched any TV shows yet.",
    inprogress: "No shows in progress.",
    'watchlist-movies': "Your movie watchlist is empty.",
    'watchlist-shows': "Your TV show watchlist is empty.",
  }

  const isWatchlist = tab.startsWith('watchlist')
  const isInProgress = tab === 'inprogress'

  if (loading) return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="results-grid">
          {[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    </PageWrapper>
  )

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div>
          <div className="profile-header">
            <img className="profile-avatar" src={user.photoURL || DEFAULT_AVATAR} alt={user.displayName}
              onError={e => { e.target.src = DEFAULT_AVATAR }} />
            <div>
              <h1>{user.displayName}</h1>
              <p className="profile-stats">
                {watchedMovies.length} movies · {watchedShows.length + inProgress.length} shows · {watchlistMovies.length + watchlistShows.length} on watchlist
              </p>
            </div>
          </div>

          <div className="filters profile-tabs">
            {tabs.map(t => (
              <button
                key={t.key}
                className={tab === t.key ? 'active' : ''}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {items.length === 0 && (
            <p className="status-text">{emptyMessages[tab]}</p>
          )}

          <div className="results-grid">
            {items.map(item => {
              const isItemInProgress = item.watchedCount !== undefined
              return (
                <div
                  className="media-card"
                  key={`${item.media_type}-${item.id}`}
                  onClick={() => navigate(`/movie/${item.media_type}/${item.id}`)}
                >
                  <div className="media-card-img-wrap">
                    {item.poster_path ? (
                      <img src={IMAGE_BASE + item.poster_path} alt={item.title} />
                    ) : (
                      <div className="no-poster">No Image</div>
                    )}
                    <span className="media-type-badge">
                      {item.media_type === 'movie' ? 'Movie' : 'TV'}
                    </span>
                    {!isWatchlist && !isItemInProgress && item.rating && (
                      <span className="card-rating">{item.rating}/10</span>
                    )}
                    {isItemInProgress && (
                      <span className="card-rating">{item.watchedCount}/{item.totalEps}</span>
                    )}
                  </div>
                  <div className="media-card-info">
                    <p className="media-title">{item.title}</p>
                    <p className="media-year">
                      {isItemInProgress
                        ? `${item.watchedCount}/${item.totalEps} episodes`
                        : isWatchlist
                        ? `Added ${new Date(item.addedAt).toLocaleDateString()}`
                        : item.watchedAtUnknown
                        ? 'Unknown date'
                        : item.watchedAt
                        ? `Watched ${new Date(item.watchedAt).toLocaleDateString()}`
                        : 'Watched'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default Profile