import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getUserByUsername, getUserData } from '../firestore'
import { IMAGE_BASE } from '../tmdb'
import PageWrapper from '../components/PageWrapper'

// Profile background presets
const MOVIE_BACKGROUNDS = [
  { id: 'default', label: 'Default', image: null, gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' },
  { id: 'interstellar', label: 'Interstellar', image: 'https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg', gradient: null },
  { id: 'dark-knight', label: 'The Dark Knight', image: 'https://image.tmdb.org/t/p/original/9i7u687c2KJeZNbVJ7b1C8QXqO.jpg', gradient: null },
  { id: 'inception', label: 'Inception', image: 'https://image.tmdb.org/t/p/original/ljsIYj6xqxJYapiFPP3VVClkdDM.jpg', gradient: null },
  { id: 'matrix', label: 'The Matrix', image: 'https://image.tmdb.org/t/p/original/fNNZmpFeVOsRnnP2F5XgvYvVcVY.jpg', gradient: null },
  { id: 'breaking-bad', label: 'Breaking Bad', image: 'https://image.tmdb.org/t/p/original/tsRy63Mu5cu8etLw9Pk1D0VRXyq.jpg', gradient: null },
  { id: 'stranger-things', label: 'Stranger Things', image: 'https://image.tmdb.org/t/p/original/49WJfeN0h1F3H3H5s8e9giVbmwq.jpg', gradient: null },
  { id: 'game-of-thrones', label: 'Game of Thrones', image: 'https://image.tmdb.org/t/p/original/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg', gradient: null },
  { id: 'oppenheimer', label: 'Oppenheimer', image: 'https://image.tmdb.org/t/p/original/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', gradient: null },
  { id: 'dune', label: 'Dune', image: 'https://image.tmdb.org/t/p/original/dU4H5Y3Jx9F2C9YhUE0sURdJ3l.jpg', gradient: null },
]

// Social media presets with SVG icons
const SOCIAL_PRESETS = [
  {
    key: 'instagram',
    label: 'Instagram',
    color: '#E4405F',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`
  },
  {
    key: 'twitter',
    label: 'X / Twitter',
    color: '#000000',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
  },
  {
    key: 'youtube',
    label: 'YouTube',
    color: '#FF0000',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
  },
  {
    key: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
  },
]

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

  // Get profile customization
  const profileBackground = profile.profileBackground || 'default'
  const socialLinks = profile.socialLinks || {}
  const showEmail = profile.showEmail || false
  const website = profile.website || ''

  // Get background style - check for custom TMDB background first
  let bgStyle = {}
  if (profileBackground.startsWith('tmdb_')) {
    // Custom TMDB backdrop
    const bgPath = profile.customBgPath || ''
    bgStyle = {
      backgroundImage: `url(https://image.tmdb.org/t/p/original${bgPath})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }
  } else {
    const bgPreset = MOVIE_BACKGROUNDS.find(b => b.id === profileBackground) || MOVIE_BACKGROUNDS[0]
    bgStyle = bgPreset.image
      ? { backgroundImage: `url(${bgPreset.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: bgPreset.gradient }
  }

  const watched = userData ? Object.values(userData.watched || {}) : []
  const watchlist = userData ? Object.values(userData.watchlist || {}) : []

  const tabs = [
    visible.watchHistory && { key: 'watched', label: `Watched (${watched.length})` },
    visible.watchlist && { key: 'watchlist', label: `Watchlist (${watchlist.length})` },
  ].filter(Boolean)

  const items = tab === 'watched' ? watched : watchlist

  // Filter active social links
  const activeSocialLinks = SOCIAL_PRESETS.filter(s => socialLinks[s.key])

  return (
    <div className="pub-profile-page" style={bgStyle}>
      <div className="pub-profile-overlay" />
      <PageWrapper>
        <div className="pub-profile-content">
          <div className="detail-page">
            {/* Profile header info */}
            <div className="pub-profile-header-content">
              {profile.photoURL && (
                <img className="pub-profile-avatar" src={profile.photoURL} alt={profile.displayName} />
              )}
              <div className="pub-profile-info">
                <h1>{profile.displayName}</h1>
                {profile.username && (
                  <p className="pub-profile-username">@{profile.username}</p>
                )}
                {!isPrivate && (
                  <p className="pub-profile-stats">
                    {visible.watchHistory && `${watched.length} watched`}
                    {visible.watchHistory && visible.watchlist && ' · '}
                    {visible.watchlist && `${watchlist.length} on watchlist`}
                  </p>
                )}
              </div>
            </div>

            {/* Social links and contact */}
            {(activeSocialLinks.length > 0 || showEmail || website) && (
              <div className="pub-profile-contact">
                {showEmail && profile.email && (
                  <a href={`mailto:${profile.email}`} className="pub-profile-contact-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    {profile.email}
                  </a>
                )}
                {website && (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="pub-profile-contact-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    {website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {activeSocialLinks.map(s => (
                  <a key={s.key}
                    href={s.key === 'instagram' ? `https://instagram.com/${socialLinks[s.key]}` :
                          s.key === 'twitter' ? `https://x.com/${socialLinks[s.key]}` :
                          s.key === 'youtube' ? `https://youtube.com/${socialLinks[s.key]}` :
                          socialLinks[s.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pub-profile-contact-item"
                    style={{ color: s.color }}>
                    <span dangerouslySetInnerHTML={{ __html: s.icon }} />
                    {s.label}
                  </a>
                ))}
              </div>
            )}

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
    </div>
  )
}

export default PublicProfile
