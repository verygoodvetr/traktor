import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getUserByUsername, getUserData } from '../firestore'
import { IMAGE_BASE } from '../tmdb'
import PageWrapper from '../components/PageWrapper'

function PublicProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [userData, setUserData] = useState(null)
  const [tab, setTab] = useState('watched')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    getUserByUsername(username).then(async p => {
      if (!p) { setNotFound(true); return }
      setProfile(p)
      if (!p.isPrivate) {
        const data = await getUserData({ uid: p.uid })
        setUserData(data)
      }
    })
  }, [username])

  if (notFound) return (
    <PageWrapper>
      <div className="detail-page">
        <p className="status-text">User not found.</p>
      </div>
    </PageWrapper>
  )

  if (!profile) return (
    <PageWrapper>
      <p className="status-text">Loading...</p>
    </PageWrapper>
  )

  const isPrivate = profile.isPrivate
  const visible = profile.visibleFields || {}

  const watched = userData ? Object.values(userData.watched || {}) : []
  const watchlist = userData ? Object.values(userData.watchlist || {}) : []

  const tabs = [
    visible.watchHistory && { key: 'watched', label: `Watched (${watched.length})` },
    visible.watchlist && { key: 'watchlist', label: `Watchlist (${watchlist.length})` },
  ].filter(Boolean)

  const items = tab === 'watched' ? watched : watchlist

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="detail-page">
          <div className="profile-header">
            {profile.photoURL && (
              <img className="profile-avatar" src={profile.photoURL} alt={profile.displayName} />
            )}
            <div>
              <h1>{profile.displayName}</h1>
              {profile.username && (
                <p className="profile-username">@{profile.username}</p>
              )}
              {!isPrivate && (
                <p className="profile-stats">
                  {visible.watchHistory && `${watched.length} watched`}
                  {visible.watchHistory && visible.watchlist && ' · '}
                  {visible.watchlist && `${watchlist.length} on watchlist`}
                </p>
              )}
            </div>
          </div>

          {isPrivate ? (
            <div className="private-profile">
              <p>🔒 This profile is private.</p>
            </div>
          ) : (
            <>
              {tabs.length > 0 && (
                <div className="filters">
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
              )}

              <div className="results-grid">
                {items.map(item => (
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
                      {tab === 'watched' && item.rating && visible.ratings && (
                        <span className="card-rating">{item.rating}/10</span>
                      )}
                    </div>
                    <div className="media-card-info">
                      <p className="media-title">{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}

export default PublicProfile