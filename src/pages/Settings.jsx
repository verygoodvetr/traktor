import { useState, useEffect, useRef } from 'react'
import { linkWithPopup, unlink, deleteUser, updateProfile, reauthenticateWithPopup } from 'firebase/auth'
import { auth, googleProvider, microsoftProvider } from '../firebase'
import { db } from '../firebase'
import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  getUserProfile, updateUserProfile, updateUsername, updateDisplayName,
  updateProfilePhoto, isUsernameTaken, exportUserData,
  getCachedCollection, invalidateUserCache,
} from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE_LARGE = 'https://image.tmdb.org/t/p/original'

// ─────────────────────────────────────────────────────────
// Social media presets with SVG icons for public profile
// ─────────────────────────────────────────────────────────
const SOCIAL_PRESETS = [
  {
    key: 'instagram',
    label: 'Instagram',
    placeholder: 'username',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    color: '#E4405F'
  },
  {
    key: 'twitter',
    label: 'X / Twitter',
    placeholder: 'username',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    color: '#000000'
  },
  {
    key: 'youtube',
    label: 'YouTube',
    placeholder: 'channel ID or @username',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    color: '#FF0000'
  },
  {
    key: 'facebook',
    label: 'Facebook',
    placeholder: 'profile or page URL',
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    color: '#1877F2'
  },
]

// ─────────────────────────────────────────────────────────
// Popular movie/show backdrop presets for public profile backgrounds
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// Blocked username patterns — checks full string AND substrings
// ─────────────────────────────────────────────────────────
const BLOCKED_EXACT = new Set([
  'me','user','username','admin','administrator','moderator','staff','support',
  'help','null','undefined','root','system','traktor','operator','bot','api',
  'official','mod','here','everyone','channel','contact','info','no',
])

const BLOCKED_SUBSTRINGS = [
  // Slurs & hate
  'nigger','nigga','faggot','retard','spastic','tranny','chink','gook','kike',
  'wetback','cracker','spic','coon','beaner','raghead','towelhead',
  // Sexual
  'fuck','shit','cunt','pussy','cock','dick','bitch','bastard','ass','arse',
  'piss','cum','slut','whore','rape','porn','xxx','sex','boob','tit','penis',
  'vagina','dildo','butt',
  // Violence / extremism
  'kill','murder','terror','isis','nazi','hitler','jihad','suicide',
  // Spam / scam
  'admin','support','official','verify','security','paypal','bitcoin',
]

export function isUsernameBlocked(username) {
  const lower = username.toLowerCase().replace(/[^a-z0-9]/g, '') // strip non-alnum for checking
  if (BLOCKED_EXACT.has(lower)) return true
  return BLOCKED_SUBSTRINGS.some(word => lower.includes(word))
}

// ─────────────────────────────────────────────────────────
// Date format helpers — exported so other pages can use them
// ─────────────────────────────────────────────────────────
export const DATE_FORMAT_PRESETS = [
  { label: 'DD.MM.YYYY', value: 'DD.MM.YYYY', example: '31.12.2025' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY', example: '12/31/2025' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD', example: '2025-12-31' },
  { label: 'D MMM YYYY', value: 'D MMM YYYY', example: '31 Dec 2025' },
  { label: 'MMMM D, YYYY', value: 'MMMM D, YYYY', example: 'December 31, 2025' },
  { label: 'D/M/YY', value: 'D/M/YY', example: '31/12/25' },
]

export function formatDateWithPattern(date, pattern) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return ''
  return pattern
    .replace('MMMM', d.toLocaleString('en-US', { month: 'long' }))
    .replace('MMM',  d.toLocaleString('en-US', { month: 'short' }))
    .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
    .replace('M',    String(d.getMonth() + 1))
    .replace('DD',   String(d.getDate()).padStart(2, '0'))
    .replace('D',    String(d.getDate()))
    .replace('YYYY', String(d.getFullYear()))
    .replace('YY',   String(d.getFullYear()).slice(2))
}

export function formatTimeWithPrefs(date, use12h, showSeconds) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return ''
  return d.toLocaleTimeString('en-US', {
    hour: use12h ? 'numeric' : '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: use12h,
  })
}

// Read all display prefs from localStorage
export function getDisplayPrefs() {
  return {
    use12h:       localStorage.getItem('traktor_12h')      === 'true',
    showSeconds:  localStorage.getItem('traktor_seconds')  === 'true',
    dateFormat:   localStorage.getItem('traktor_datefmt')  || 'DD.MM.YYYY',
    compactCards: localStorage.getItem('traktor_compact')  === 'true',
    spoilerMode:  localStorage.getItem('traktor_spoilers') === 'true',
    autoMarkShow: true, // Always enabled now
    defaultTab:   localStorage.getItem('traktor_deftab')   || 'movies',
    cardSize:     localStorage.getItem('traktor_cardsize') || 'medium',
  }
}

// ─────────────────────────────────────────────────────────
// Default avatar SVG (shown when no photo available)
// ─────────────────────────────────────────────────────────
export const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23242424'/%3E%3Ccircle cx='40' cy='32' r='16' fill='%23444'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='%23444'/%3E%3C/svg%3E`

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={`toggle${disabled ? ' toggle-disabled' : ''}`}>
      <input type="checkbox" checked={checked}
        onChange={e => !disabled && onChange(e.target.checked)} disabled={!!disabled} />
      <span className="toggle-slider" />
    </label>
  )
}

function SettingsSection({ title, description, children, danger }) {
  return (
    <div className={`settings-section${danger ? ' danger-section' : ''}`}>
      <h2>{title}</h2>
      {description && <p className="settings-desc">{description}</p>}
      {children}
    </div>
  )
}

function PrefRow({ label, desc, children, column }) {
  return (
    <div className={`pref-row${column ? ' pref-row-column' : ''}`}>
      <div className="pref-label-block">
        <span className="pref-label">{label}</span>
        {desc && <span className="pref-desc">{desc}</span>}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// History display component
// ─────────────────────────────────────────────────────────
function HistoryList({ items, dateFormat, use12h, showSeconds }) {
  if (!items || items.length === 0) return <p style={{ fontSize: 13, color: 'var(--text4)', padding: '8px 0' }}>No history yet.</p>
  return (
    <div className="history-list">
      {[...items].reverse().map((entry, i) => (
        <div key={i} className="history-entry">
          <span className="history-value">{entry.value}</span>
          <span className="history-date">
            {entry.changedAt
              ? `${formatDateWithPattern(new Date(entry.changedAt), dateFormat)} ${formatTimeWithPrefs(new Date(entry.changedAt), use12h, showSeconds)}`
              : 'Unknown date'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Profile photo picker
// ─────────────────────────────────────────────────────────
function PhotoPicker({ currentPhoto, onSave, uid, user }) {
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('picker') // 'picker' | 'url'

  const AVATAR_OPTIONS = [
    // Simple colored SVG avatars (no external dependency)
    { id: 'red',    src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23e50914'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'blue',   src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%232563eb'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'green',  src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%2316a34a'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'purple', src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%237c3aed'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'orange', src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23ea580c'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'pink',   src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23db2777'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'gray',   src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23374151'/%3E%3Ccircle cx='40' cy='32' r='16' fill='rgba(255,255,255,0.5)'/%3E%3Cellipse cx='40' cy='70' rx='26' ry='18' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E` },
    { id: 'default', src: DEFAULT_AVATAR },
  ]

  // Get linked providers and their photos
  const linkedProviders = user?.providerData?.map(p => p.providerId) || []
  const googlePhoto = user?.providerData?.find(p => p.providerId === 'google.com')?.photoURL || null
  const microsoftPhoto = user?.providerData?.find(p => p.providerId === 'microsoft.com')?.photoURL || null

  async function save(photoURL) {
    setSaving(true)
    await updateProfilePhoto(uid, photoURL)
    await updateProfile(auth.currentUser, { photoURL })
    onSave(photoURL)
    showToast('Profile photo updated!')
    setSaving(false)
  }

  async function saveUrl() {
    if (!url.trim()) return
    await save(url.trim())
    setUrl('')
  }

  return (
    <div className="photo-picker">
      <div className="photo-picker-tabs">
        <button className={`photo-tab${mode === 'picker' ? ' active' : ''}`} onClick={() => setMode('picker')}>Choose avatar</button>
        <button className={`photo-tab${mode === 'url' ? ' active' : ''}`} onClick={() => setMode('url')}>Use image URL</button>
      </div>

      {mode === 'picker' && (
        <>
          {/* Import from linked accounts */}
          {(googlePhoto || microsoftPhoto) && (
            <div className="import-from-account">
              <p className="settings-field-label" style={{ marginBottom: 8 }}>Import from linked account</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {googlePhoto && (
                  <button className="import-account-btn" onClick={() => save(googlePhoto)} disabled={saving}>
                    <span style={{ fontSize: 18 }}>G</span>
                    <span>Google</span>
                  </button>
                )}
                {microsoftPhoto && (
                  <button className="import-account-btn" onClick={() => save(microsoftPhoto)} disabled={saving}>
                    <span style={{ fontSize: 18 }}>M</span>
                    <span>Microsoft</span>
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="avatar-grid">
            {AVATAR_OPTIONS.map(av => (
              <button key={av.id} className={`avatar-option${currentPhoto === av.src ? ' selected' : ''}`}
                onClick={() => save(av.src)} disabled={saving}>
                <img src={av.src} alt={av.id} />
              </button>
            ))}
          </div>
        </>
      )}

      {mode === 'url' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input type="text" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/your-photo.jpg" style={{ flex: 1 }} />
          <button className="action-btn" onClick={saveUrl} disabled={saving || !url.trim()}>
            {saving ? 'Saving…' : 'Set'}
          </button>
        </div>
      )}
      <p className="settings-hint" style={{ marginTop: 8 }}>
        For URL: use a direct link to an image (JPG, PNG, WebP). The image must be publicly accessible.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Main Settings component
// ─────────────────────────────────────────────────────────
function Settings({ user }) {
  const [providers,      setProviders]      = useState([])
  const [showDeleteFlow, setShowDeleteFlow] = useState(false)
  const [deleteStep,     setDeleteStep]     = useState(1)
  const [confirmText,    setConfirmText]    = useState('')
  const [deleting,       setDeleting]       = useState(false)
  const [exporting,      setExporting]      = useState(false)
  const [importing,       setImporting]      = useState(false)
  const [importProgress,  setImportProgress] = useState({ current: 0, total: 0, status: '' })
  const [importedCount,   setImportedCount]   = useState({ watched: 0, watchlist: 0 })
  const [profile,        setProfile]        = useState(null)
  const [username,       setUsername]       = useState('')
  const [displayName,    setDisplayName]    = useState(user.displayName || '')
  const [savingProfile,  setSavingProfile]  = useState(false)
  const [photoURL,       setPhotoURL]       = useState(user.photoURL || DEFAULT_AVATAR)
  const [isPrivate,      setIsPrivate]      = useState(false)
  const [visibleFields,  setVisibleFields]  = useState({ watchHistory: true, ratings: true, watchlist: true, episodeProgress: true })
  const [showHistory,    setShowHistory]    = useState(false)

  // Public profile customization
  const [profileBackground, setProfileBackground] = useState('default')
  const [customBackground, setCustomBackground] = useState(null) // { id, image, label }
  const [socialLinks, setSocialLinks] = useState({ instagram: '', twitter: '', youtube: '', facebook: '' })
  const [showEmail, setShowEmail] = useState(false)
  const [website, setWebsite] = useState('')
  const [showPublicSection, setShowPublicSection] = useState(false)
  const [bgSearchQuery, setBgSearchQuery] = useState('')
  const [bgSearchResults, setBgSearchResults] = useState([])
  const [bgSearchLoading, setBgSearchLoading] = useState(false)

  // Display prefs — read from localStorage on mount
  // Auto-mark show is now always enabled (removed toggle)
  const [use12h,        setUse12h]        = useState(() => localStorage.getItem('traktor_12h')      === 'true')
  const [showSeconds,   setShowSeconds]   = useState(() => localStorage.getItem('traktor_seconds')  === 'true')
  const [dateFormat,    setDateFormat]    = useState(() => localStorage.getItem('traktor_datefmt')  || 'DD.MM.YYYY')
  const [compactCards,  setCompactCards]  = useState(() => localStorage.getItem('traktor_compact')  === 'true')
  const [spoilerMode,   setSpoilerMode]   = useState(() => localStorage.getItem('traktor_spoilers') === 'true')
  const [cardSize,      setCardSize]      = useState(() => localStorage.getItem('traktor_cardsize') || 'medium')

  // Always enable auto-mark show
  useEffect(() => { localStorage.setItem('traktor_automark', 'true') }, [])

  const privacyTimer = useRef(null)
  const navigate     = useNavigate()

  // Apply spoiler mode to DOM immediately on load
  useEffect(() => {
    if (spoilerMode) document.documentElement.classList.add('spoiler-mode')
    else document.documentElement.classList.remove('spoiler-mode')
  }, [spoilerMode])

  useEffect(() => {
    setProviders(user.providerData.map(p => p.providerId))
    getUserProfile(user.uid).then(p => {
      if (!p) return
      setProfile(p)
      setUsername(p.username || '')
      setDisplayName(p.displayName || user.displayName || '')
      setPhotoURL(p.customPhotoURL || p.photoURL || user.photoURL || DEFAULT_AVATAR)
      setIsPrivate(p.isPrivate || false)
      setVisibleFields(p.visibleFields || { watchHistory: true, ratings: true, watchlist: true, episodeProgress: true })
      // Load public profile customization
      setProfileBackground(p.profileBackground || 'default')
      // Load custom background if it's a TMDB backdrop
      if (p.profileBackground?.startsWith('tmdb_')) {
        const parts = p.profileBackground.split('_')
        if (parts.length >= 2) {
          const mediaId = parts[1]
          const mediaType = p.customBgMediaType || 'movie'
          setCustomBackground({
            id: p.profileBackground,
            image: `https://image.tmdb.org/t/p/original${p.customBgPath || ''}`,
            label: p.customBgLabel || 'Custom background'
          })
        }
      } else {
        setCustomBackground(null)
      }
      setSocialLinks(p.socialLinks || { instagram: '', twitter: '', youtube: '', facebook: '' })
      setShowEmail(p.showEmail || false)
      setWebsite(p.website || '')
    })
  }, [user])

  // Auto-save public profile customization
  useEffect(() => {
    if (!profile) return
    clearTimeout(privacyTimer.current)
    privacyTimer.current = setTimeout(() => {
      const updateData = { isPrivate, visibleFields, profileBackground, socialLinks, showEmail, website }
      // Include custom background metadata
      if (customBackground) {
        updateData.customBgPath = customBackground.image?.replace('https://image.tmdb.org/t/p/original', '') || ''
        updateData.customBgLabel = customBackground.label || 'Custom'
        updateData.customBgMediaType = customBackground.mediaType || 'movie'
      } else {
        updateData.customBgPath = null
        updateData.customBgLabel = null
        updateData.customBgMediaType = null
      }
      updateUserProfile(user.uid, updateData)
    }, 800)
    return () => clearTimeout(privacyTimer.current)
  }, [isPrivate, visibleFields, profileBackground, customBackground, socialLinks, showEmail, website])

  function setPref(key, val, setter) {
    setter(val)
    localStorage.setItem(key, String(val))
  }

  // ── Background search ────────────────────────────────────
  async function searchBgMedia(query) {
    if (!query.trim()) { setBgSearchResults([]); return }
    setBgSearchLoading(true)
    try {
      const res = await fetch(
        `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}&page=1&include_adult=false`
      )
      const data = await res.json()
      // Filter to only movies and TV shows with backdrop images
      const results = (data.results || []).filter(r =>
        (r.media_type === 'movie' || r.media_type === 'tv') && r.backdrop_path
      ).slice(0, 12)
      setBgSearchResults(results)
    } catch (e) {
      console.error(e)
      setBgSearchResults([])
    }
    setBgSearchLoading(false)
  }

  function selectBgImage(item) {
    const newCustomBg = {
      id: `tmdb_${item.id}`,
      image: IMAGE_BASE_LARGE + item.backdrop_path,
      label: item.title || item.name,
      mediaType: item.media_type
    }
    setCustomBackground(newCustomBg)
    setProfileBackground(newCustomBg.id)
    setBgSearchQuery('')
    setBgSearchResults([])
    showToast('Background set!')
  }

  function clearCustomBg() {
    setCustomBackground(null)
    setProfileBackground('default')
    showToast('Background cleared')
  }

  // Auto-fix website URL
  function handleWebsiteChange(value) {
    let fixedUrl = value.trim()
    if (fixedUrl && !fixedUrl.match(/^https?:\/\//)) {
      fixedUrl = 'https://' + fixedUrl
    }
    setWebsite(fixedUrl)
  }

  function setSpoilerModePref(val) {
    setPref('traktor_spoilers', val, setSpoilerMode)
    if (val) document.documentElement.classList.add('spoiler-mode')
    else     document.documentElement.classList.remove('spoiler-mode')
  }

  function setCardSizePref(val) {
    setPref('traktor_cardsize', val, setCardSize)
    document.documentElement.setAttribute('data-card-size', val)
  }

  async function saveUsername() {
    const trimmed = username.trim()
    if (trimmed.length < 2)  { showToast('Username must be at least 2 characters.', 'error'); return }
    if (trimmed.length > 24) { showToast('Username must be at most 24 characters.', 'error'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { showToast('Letters, numbers and underscores only.', 'error'); return }
    if (isUsernameBlocked(trimmed)) { showToast('This username is not allowed.', 'error'); return }
    setSavingProfile(true)
    if (trimmed.toLowerCase() !== (profile?.username || '').toLowerCase()) {
      const taken = await isUsernameTaken(trimmed)
      if (taken) { showToast('Username already taken.', 'error'); setSavingProfile(false); return }
    }
    await updateUsername(user.uid, trimmed)
    setProfile(prev => ({
      ...prev,
      username: trimmed,
      usernameHistory: [...(prev?.usernameHistory || []), { value: trimmed, changedAt: new Date().toISOString() }],
    }))
    showToast('Username saved!')
    setSavingProfile(false)
  }

  async function saveDisplayName() {
    const trimmed = displayName.trim()
    if (!trimmed) { showToast('Display name cannot be empty.', 'error'); return }
    setSavingProfile(true)
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed })
      await updateDisplayName(user.uid, trimmed)
      setProfile(prev => ({
        ...prev,
        displayName: trimmed,
        displayNameHistory: [...(prev?.displayNameHistory || []), { value: trimmed, changedAt: new Date().toISOString() }],
      }))
      showToast('Display name saved!')
    } catch { showToast('Something went wrong.', 'error') }
    setSavingProfile(false)
  }

  async function linkProvider(provider, providerId) {
    try {
      await linkWithPopup(auth.currentUser, provider)
      setProviders(prev => [...prev, providerId])
      showToast('Account linked!')
    } catch (err) {
      showToast(err.code === 'auth/credential-already-in-use'
        ? 'That account is linked to a different profile.'
        : 'Linking failed — please try again.', 'error')
    }
  }

  async function unlinkProvider(providerId) {
    if (providers.length === 1) { showToast("Can't unlink your only sign-in method.", 'error'); return }
    try {
      await unlink(auth.currentUser, providerId)
      setProviders(prev => prev.filter(p => p !== providerId))
      showToast('Account unlinked.')
    } catch { showToast('Unlink failed — please try again.', 'error') }
  }

  // ── Export ─────────────────────────────────────────────
  async function handleExport() {
    setExporting(true)
    try {
      const JSZip = (await import('jszip')).default
      const data  = await exportUserData(user)
      const zip   = new JSZip()

      // README
      zip.file('README.md', generateReadme(data))

      // Profile & stats
      zip.file('profile.json', JSON.stringify(data.profile, null, 2))
      zip.file('stats.json',   JSON.stringify(data.stats,   null, 2))

      // History
      zip.file('history/username_history.json',     JSON.stringify(data.profile.usernameHistory || [],     null, 2))
      zip.file('history/displayname_history.json',  JSON.stringify(data.profile.displayNameHistory || [],  null, 2))

      // Watched
      zip.file('watched/movies.json', JSON.stringify(data.watched.movies, null, 2))
      zip.file('watched/shows.json',  JSON.stringify(data.watched.shows,  null, 2))

      // Watchlist
      zip.file('watchlist/movies.json', JSON.stringify(data.watchlist.movies, null, 2))
      zip.file('watchlist/shows.json',  JSON.stringify(data.watchlist.shows,  null, 2))

      // Ratings
      zip.file('ratings.json', JSON.stringify(data.ratings, null, 2))

      // Episodes
      zip.file('episodes/all_episodes.json', JSON.stringify(data.episodes.all, null, 2))
      // Per-show episode files
      const epFolder = zip.folder('episodes/by_show')
      for (const [showId, eps] of Object.entries(data.episodes.byShow)) {
        epFolder.file(`show_${showId}.json`, JSON.stringify(eps.sort((a,b) => a.seasonNum - b.seasonNum || a.episodeNum - b.episodeNum), null, 2))
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `traktor-export-${new Date().toISOString().slice(0,10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export downloaded!')
    } catch (err) {
      console.error(err)
      showToast('Export failed — please try again.', 'error')
    }
    setExporting(false)
  }

  // ── Import from Trakt ─────────────────────────────────────
  // File-based import (supports ZIP and JSON)
  async function handleTraktFileImport(file) {
    if (!file) return
    setImporting(true)
    setImportProgress({ current: 0, total: 0, status: 'Reading file...' })
    setImportedCount({ watched: 0, watchlist: 0 })

    try {
      let watchedMovies = [], watchedShows = [], watchlist = []

      // Handle ZIP files (Trakt default export format)
      if (file.name.endsWith('.zip')) {
        setImportProgress(p => ({ ...p, status: 'Extracting ZIP...' }))
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(file)

        // Trakt ZIP structure: watched-movies.json, watched-shows.json, lists-watchlist.json
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue
          const lower = filename.toLowerCase()

          if (filename === 'watched-movies.json') {
            watchedMovies = JSON.parse(await zipEntry.async('string'))
          } else if (filename === 'watched-shows.json') {
            watchedShows = JSON.parse(await zipEntry.async('string'))
          } else if (filename === 'lists-watchlist.json') {
            watchlist = JSON.parse(await zipEntry.async('string'))
          }
        }
      } else {
        // Plain JSON file
        const text = await file.text()
        const data = JSON.parse(text)
        watchedMovies = data.movies || []
        watchedShows = data.shows || []
        watchlist = data.watchlist || []
      }

      // Get existing items
      const existingWatched = await getCachedCollection(user.uid, 'watched')
      const existingWatchlist = await getCachedCollection(user.uid, 'watchlist')

      // Collect items to add
      const moviesToAdd = [], showsToAdd = [], watchlistMovies = [], watchlistShows = []

      // Process watched movies - format: { movie: { ids: { tmdb: 123 }, title: "..." } }
      for (const item of watchedMovies) {
        const movie = item.movie || item
        const tmdbId = movie.ids?.tmdb || movie.tmdb
        if (tmdbId && !existingWatched.has(`movie-${tmdbId}`)) {
          moviesToAdd.push({ id: tmdbId, media_type: 'movie', title: movie.title, poster_path: null })
        }
      }

      // Process watched shows - format: { show: { ids: { tmdb: 123 }, title: "..." } }
      for (const item of watchedShows) {
        const show = item.show || item
        const tmdbId = show.ids?.tmdb || show.tmdb
        if (tmdbId && !existingWatched.has(`tv-${tmdbId}`)) {
          showsToAdd.push({ id: tmdbId, media_type: 'tv', title: show.title, poster_path: null })
        }
      }

      // Process watchlist - format: { type: "movies"/"shows", movie/show: { ids: { tmdb: 123 } } }
      for (const item of watchlist) {
        const type = item.type || (item.movie ? 'movies' : 'shows')
        const media = item.movie || item.show || item
        const tmdbId = media?.ids?.tmdb || media?.tmdb
        if (!tmdbId) continue

        if (type === 'movies' || item.movie) {
          if (!existingWatchlist.has(`movie-${tmdbId}`)) {
            watchlistMovies.push({ id: tmdbId, media_type: 'movie', title: media.title, poster_path: null })
          }
        } else {
          if (!existingWatchlist.has(`tv-${tmdbId}`)) {
            watchlistShows.push({ id: tmdbId, media_type: 'tv', title: media.title, poster_path: null })
          }
        }
      }

      const totalToImport = moviesToAdd.length + showsToAdd.length + watchlistMovies.length + watchlistShows.length
      setImportProgress({ current: 0, total: totalToImport, status: `Found ${totalToImport} items to import` })

      if (totalToImport === 0) {
        showToast('Your watch history is already up to date!')
        setImporting(false)
        return
      }

      // Import all items
      let imported = 0
      const BATCH_SIZE = 100
      const importBatch = async (items, collection, isWatchlist) => {
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = writeBatch(db)
          items.slice(i, i + BATCH_SIZE).forEach(item => {
            const itemData = isWatchlist ? { ...item, addedAt: new Date().toISOString() } : item
            batch.set(doc(db, 'users', user.uid, collection, `${item.media_type}-${item.id}`), itemData)
          })
          await batch.commit()
          imported += Math.min(BATCH_SIZE, items.length - i)
          setImportProgress({ current: imported, total: totalToImport, status: `Importing... ${imported}/${totalToImport}` })
        }
      }

      await importBatch(moviesToAdd, 'watched', false)
      await importBatch(showsToAdd, 'watched', false)
      await importBatch(watchlistMovies, 'watchlist', true)
      await importBatch(watchlistShows, 'watchlist', true)

      setImportProgress({ current: totalToImport, total: totalToImport, status: 'Done!' })
      setImportedCount({
        watched: moviesToAdd.length + showsToAdd.length,
        watchlist: watchlistMovies.length + watchlistShows.length,
      })
      showToast(`Imported ${moviesToAdd.length + showsToAdd.length} watched and ${watchlistMovies.length + watchlistShows.length} watchlist items!`)
      invalidateUserCache(user.uid)
    } catch (err) {
      console.error('Trakt import error:', err)
      showToast('Import failed. Check the file format.', 'error')
    }
    setImporting(false)
  }

  // Legacy: API-based import (requires OAuth - not working)
  async function handleTraktImport(username) {
    if (!username || !username.trim()) {
      showToast('Please enter your Trakt username.', 'error')
      return
    }
    const cleanUsername = username.trim()
    setImporting(true)
    setImportProgress({ current: 0, total: 0, status: 'Connecting to Trakt...' })
    setImportedCount({ watched: 0, watchlist: 0 })

    try {
      // Step 1: Fetch watch history (movies + shows)
      setImportProgress(p => ({ ...p, status: 'Fetching watch history...' }))
      const historyRes = await fetch(
        `https://api.trakt.tv/users/${encodeURIComponent(cleanUsername)}/watched?extended=full`,
        { headers: { 'trakt-api-version': '2', 'trakt-api-key': 'e273ec3d96d04a75a5d63d3c5c6b83395530be6d67a2f5e64d56afd1b8f0c9c6' } }
      )
      if (!historyRes.ok) {
        const errMsg = historyRes.status === 404
          ? 'Username not found on Trakt.'
          : historyRes.status === 401 || historyRes.status === 412
            ? 'Trakt requires authentication. Please use a different import method.'
            : `Trakt error (${historyRes.status}).`
        showToast(errMsg, 'error')
        setImporting(false)
        return
      }
      const historyData = await historyRes.json()

      // Step 2: Fetch watchlist
      setImportProgress(p => ({ ...p, status: 'Fetching watchlist...' }))
      const watchlistRes = await fetch(
        `https://api.trakt.tv/users/${encodeURIComponent(cleanUsername)}/watchlist?extended=full`,
        { headers: { 'trakt-api-version': '2', 'trakt-api-key': 'e273ec3d96d04a75a5d63d3c5c6b83395530be6d67a2f5e64d56afd1b8f0c9c6' } }
      )
      const watchlistData = watchlistRes.ok ? await watchlistRes.json() : []

      // Collect all TMDB IDs
      const moviesToAdd = new Map()   // tmdbId -> item
      const showsToAdd  = new Map()   // tmdbId -> item
      const watchlistMovies = new Map()
      const watchlistShows  = new Map()

      // Get existing watched to avoid duplicates
      const existingWatched = await getCachedCollection(user.uid, 'watched')
      const existingWatchlist = await getCachedCollection(user.uid, 'watchlist')

      // Process history
      let movieCount = 0, showCount = 0
      for (const section of historyData) {
        if (section.movie) {
          const tmdbId = section.movie.ids?.tmdb
          if (tmdbId && !existingWatched.has(`movie-${tmdbId}`)) {
            moviesToAdd.set(tmdbId, {
              id: tmdbId,
              media_type: 'movie',
              title: section.movie.title,
              poster_path: null,
            })
            movieCount++
          }
        } else if (section.show) {
          const tmdbId = section.show.ids?.tmdb
          if (tmdbId && !existingWatched.has(`tv-${tmdbId}`)) {
            showsToAdd.set(tmdbId, {
              id: tmdbId,
              media_type: 'tv',
              title: section.show.title,
              poster_path: null,
            })
            showCount++
          }
        }
      }

      // Process watchlist
      for (const item of watchlistData) {
        if (item.type === 'movie' && item.movie?.ids?.tmdb) {
          const tmdbId = item.movie.ids.tmdb
          if (!existingWatchlist.has(`movie-${tmdbId}`)) {
            watchlistMovies.set(tmdbId, {
              id: tmdbId,
              media_type: 'movie',
              title: item.movie.title,
              poster_path: null,
            })
          }
        } else if (item.type === 'show' && item.show?.ids?.tmdb) {
          const tmdbId = item.show.ids.tmdb
          if (!existingWatchlist.has(`tv-${tmdbId}`)) {
            watchlistShows.set(tmdbId, {
              id: tmdbId,
              media_type: 'tv',
              title: item.show.title,
              poster_path: null,
            })
          }
        }
      }

      const totalToImport = moviesToAdd.size + showsToAdd.size + watchlistMovies.size + watchlistShows.size
      setImportProgress({ current: 0, total: totalToImport, status: `Found ${totalToImport} items to import` })

      if (totalToImport === 0) {
        showToast('Your watch history and watchlist are already up to date!')
        setImporting(false)
        return
      }

      // Import movies (watched)
      let imported = 0
      const BATCH_SIZE = 100
      const allMovies = Array.from(moviesToAdd.values())
      for (let i = 0; i < allMovies.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        allMovies.slice(i, i + BATCH_SIZE).forEach(item => {
          batch.set(doc(db, 'users', user.uid, 'watched', `movie-${item.id}`), item)
        })
        await batch.commit()
        imported += Math.min(BATCH_SIZE, allMovies.length - i)
        setImportProgress({ current: imported, total: totalToImport, status: `Importing movies... ${imported}/${allMovies.length}` })
      }

      // Import shows (watched)
      const allShows = Array.from(showsToAdd.values())
      for (let i = 0; i < allShows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        allShows.slice(i, i + BATCH_SIZE).forEach(item => {
          batch.set(doc(db, 'users', user.uid, 'watched', `tv-${item.id}`), item)
        })
        await batch.commit()
        imported += Math.min(BATCH_SIZE, allShows.length - i)
        setImportProgress({ current: imported, total: totalToImport, status: `Importing shows... ${imported}/${allShows.length}` })
      }

      // Import watchlist movies
      const allWlMovies = Array.from(watchlistMovies.values())
      for (let i = 0; i < allWlMovies.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        allWlMovies.slice(i, i + BATCH_SIZE).forEach(item => {
          batch.set(doc(db, 'users', user.uid, 'watchlist', `movie-${item.id}`), {
            ...item,
            addedAt: new Date().toISOString(),
          })
        })
        await batch.commit()
        imported += Math.min(BATCH_SIZE, allWlMovies.length - i)
        setImportProgress({ current: imported, total: totalToImport, status: `Importing watchlist... ${imported}/${totalToImport}` })
      }

      // Import watchlist shows
      const allWlShows = Array.from(watchlistShows.values())
      for (let i = 0; i < allWlShows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        allWlShows.slice(i, i + BATCH_SIZE).forEach(item => {
          batch.set(doc(db, 'users', user.uid, 'watchlist', `tv-${item.id}`), {
            ...item,
            addedAt: new Date().toISOString(),
          })
        })
        await batch.commit()
        imported += Math.min(BATCH_SIZE, allWlShows.length - i)
        setImportProgress({ current: imported, total: totalToImport, status: `Importing watchlist... ${imported}/${totalToImport}` })
      }

      setImportProgress({ current: totalToImport, total: totalToImport, status: 'Done!' })
      setImportedCount({
        watched: moviesToAdd.size + showsToAdd.size,
        watchlist: watchlistMovies.size + watchlistShows.size,
      })
      showToast(`Imported ${moviesToAdd.size + showsToAdd.size} watched and ${watchlistMovies.size + watchlistShows.size} watchlist items!`)
      invalidateUserCache(user.uid)
    } catch (err) {
      console.error('Trakt import error:', err)
      showToast('Import failed — check your connection and try again.', 'error')
    }
    setImporting(false)
  }

  function generateReadme(data) {
    return `# Traktor Data Export
Generated: ${new Date().toISOString()}
User: ${data.profile.displayName || 'Unknown'} (@${data.profile.username || 'no username'})

## Summary
- Movies watched:   ${data.stats.totalMoviesWatched}
- Shows watched:    ${data.stats.totalShowsWatched}
- Episodes watched: ${data.stats.totalEpisodesWatched}
- Total ratings:    ${data.stats.totalRatings}
- Average rating:   ${data.stats.averageRating ?? 'N/A'}/10
- Watchlist items:  ${data.stats.watchlistSize}

## File Structure

\`\`\`
traktor-export/
├── README.md                         This file
├── profile.json                      Your account profile data
├── stats.json                        Summary statistics
├── ratings.json                      All your ratings, sorted highest first
│
├── history/
│   ├── username_history.json         All usernames you've used, with timestamps
│   └── displayname_history.json      All display names you've used, with timestamps
│
├── watched/
│   ├── movies.json                   Movies you've marked as watched
│   └── shows.json                    TV shows you've marked as fully watched
│
├── watchlist/
│   ├── movies.json                   Movies on your watchlist
│   └── shows.json                    TV shows on your watchlist
│
└── episodes/
    ├── all_episodes.json             Every episode you've watched (sorted by date)
    └── by_show/
        └── show_{id}.json            Episodes per show (sorted by season/episode)
\`\`\`

## Field Reference

### profile.json
- uid: Firebase user ID
- username / displayName / email / photoURL: Account info
- isPrivate: Whether your profile is private
- createdAt: Account creation date (ISO 8601)
- usernameHistory: Array of { value, changedAt } — username change log
- displayNameHistory: Array of { value, changedAt } — display name change log
- profileBackground: Background ID ('default' or 'tmdb_{id}' for custom)
- customBgPath: TMDB backdrop path for custom backgrounds
- customBgLabel: Label for custom background (movie/show name)
- customBgMediaType: 'movie' or 'tv' for custom backgrounds
- socialLinks: Object with social media usernames { instagram, twitter, youtube, facebook }
- showEmail: Whether email is shown on public profile
- website: Your website URL

### watched/movies.json & watched/shows.json
- id: TMDB ID
- media_type: "movie" or "tv"
- title: Title of the movie/show
- rating: Your rating (1–10) or null
- watchedAt: ISO 8601 timestamp or null
- watchedAtUnknown: true if you marked it without a date

### episodes/all_episodes.json
- showId: TMDB show ID (matches the id in watched/shows.json)
- seasonNum / episodeNum: Season and episode numbers
- watchedAt: ISO 8601 timestamp
- rating: Your episode rating (1–5 stars) or null

### ratings.json
All items you've rated, sorted highest to lowest.

## Notes
- TMDB IDs can be used to look up metadata at https://www.themoviedb.org
- All timestamps are in ISO 8601 format (UTC)
- This export does not include images — use poster_path with https://image.tmdb.org/t/p/w300{poster_path}
- Custom profile backgrounds: Use customBgPath with https://image.tmdb.org/t/p/original{customBgPath}
`
  }

  // ── Delete account (correct order: Firestore first, Auth last) ──
  async function handleDeleteAccount() {
    if (confirmText !== 'DELETE') return
    setDeleting(true)
    const uid = user.uid
    const currentUser = auth.currentUser
    try {
      // 1. Delete Firestore subcollections while still authenticated
      for (const sub of ['watched', 'watchlist', 'episodes']) {
        const snap = await getDocs(collection(db, 'users', uid, sub))
        const chunks = []
        let batch = writeBatch(db)
        let count = 0
        for (const d of snap.docs) {
          batch.delete(d.ref)
          if (++count === 500) { chunks.push(batch.commit()); batch = writeBatch(db); count = 0 }
        }
        if (count > 0) chunks.push(batch.commit())
        await Promise.all(chunks)
      }
      // 2. Delete user document
      await deleteDoc(doc(db, 'users', uid))
      // 3. Delete Firebase Auth account (LAST — invalidates session)
      try {
        await deleteUser(currentUser)
      } catch (authErr) {
        if (authErr.code === 'auth/requires-recent-login') {
          const provider = providers.includes('google.com') ? googleProvider : microsoftProvider
          await reauthenticateWithPopup(currentUser, provider)
          await deleteUser(currentUser)
        } else throw authErr
      }
      navigate('/')
    } catch (err) {
      console.error('Delete error:', err)
      showToast(err.code === 'auth/requires-recent-login'
        ? 'Sign out and sign back in immediately, then try again.'
        : `Deletion failed: ${err.message}`, 'error')
      setShowDeleteFlow(false); setDeleteStep(1); setConfirmText(''); setDeleting(false)
    }
  }

  const googleLinked    = providers.includes('google.com')
  const microsoftLinked = providers.includes('microsoft.com')
  const nowEx = new Date()
  const previewDate = formatDateWithPattern(nowEx, dateFormat)
  const previewTime = formatTimeWithPrefs(nowEx, use12h, showSeconds)

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="settings-page">
          <h1>Settings</h1>

          {/* ── Profile ── */}
          <SettingsSection title="Profile"
            description={profile?.username ? `Public profile: /user/${profile.username}` : 'Set a username so others can find you.'}>

            {/* Photo */}
            <div className="settings-photo-row">
              <img
                src={photoURL || DEFAULT_AVATAR}
                alt="Profile"
                className="settings-avatar"
                onError={e => { e.target.src = DEFAULT_AVATAR }}
              />
              <div style={{ flex: 1 }}>
                <p className="pref-label" style={{ marginBottom: 10 }}>Profile photo</p>
                <PhotoPicker currentPhoto={photoURL} uid={user.uid} onSave={url => setPhotoURL(url)} user={user} />
              </div>
            </div>

            <div className="settings-divider" />

            <div className="settings-fields">
              <div className="settings-field">
                <label className="settings-field-label">Username</label>
                <div className="username-row">
                  <span className="username-at">@</span>
                  <input type="text" value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username" maxLength={24} style={{ flex: 1 }} />
                  <button className="action-btn" onClick={saveUsername} disabled={savingProfile || username.length < 2}>
                    {savingProfile ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <p className="settings-hint">2–24 chars. Letters, numbers and underscores only.</p>
              </div>

              <div className="settings-field">
                <label className="settings-field-label">Display name</label>
                <div className="username-row">
                  <input type="text" value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your display name" maxLength={40} style={{ flex: 1 }} />
                  <button className="action-btn" onClick={saveDisplayName} disabled={savingProfile}>Save</button>
                </div>
              </div>
            </div>

            {/* History */}
            <button className="settings-history-toggle" onClick={() => setShowHistory(h => !h)}>
              {showHistory ? '▲' : '▼'} Name history
            </button>
            {showHistory && (
              <div className="settings-history">
                <div>
                  <p className="settings-field-label" style={{ marginBottom: 8 }}>Username history</p>
                  <HistoryList items={profile?.usernameHistory} dateFormat={dateFormat} use12h={use12h} showSeconds={showSeconds} />
                </div>
                <div>
                  <p className="settings-field-label" style={{ marginBottom: 8 }}>Display name history</p>
                  <HistoryList items={profile?.displayNameHistory} dateFormat={dateFormat} use12h={use12h} showSeconds={showSeconds} />
                </div>
              </div>
            )}
          </SettingsSection>

          {/* ── Public Profile ── */}
          <SettingsSection title="Public profile" description="Customize how your public profile looks. Changes save automatically.">
            {profile?.username ? (
              <div className="public-profile-link-box">
                <p style={{ marginBottom: 8, color: 'var(--text3)' }}>Your public profile URL:</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <a href={`/user/${profile.username}`} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--primary)', fontFamily: 'monospace', fontSize: 14, wordBreak: 'break-all' }}>
                    {window.location.origin}/user/{profile.username}
                  </a>
                  <button className="action-btn" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/user/${profile.username}`)
                    showToast('Link copied!')
                  }}>Copy</button>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="action-btn" onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: `${profile.displayName || profile.username}'s Profile`,
                        url: `${window.location.origin}/user/${profile.username}` })
                    } else {
                      navigator.clipboard.writeText(`${window.location.origin}/user/${profile.username}`)
                      showToast('Link copied!')
                    }
                  }}>Share profile</button>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text3)', fontSize: 13 }}>Set a username above to enable your public profile.</p>
            )}

            <div className="settings-divider" />

            {/* Profile background */}
            <div className="public-profile-field">
              <label className="settings-field-label">Profile background</label>

              {/* Custom background preview */}
              {customBackground && (
                <div className="custom-bg-preview">
                  <img src={customBackground.image} alt={customBackground.label} />
                  <div className="custom-bg-info">
                    <span>{customBackground.label}</span>
                    <button className="clear-bg-btn" onClick={clearCustomBg}>Clear</button>
                  </div>
                </div>
              )}

              {/* Preset backgrounds */}
              <label className="settings-sub-label">Quick picks</label>
              <div className="background-picker">
                {MOVIE_BACKGROUNDS.map(bg => (
                  <button key={bg.id}
                    className={`background-option${profileBackground === bg.id && !customBackground ? ' selected' : ''}`}
                    onClick={() => { setCustomBackground(null); setProfileBackground(bg.id); showToast('Background set!') }}
                    title={bg.label}>
                    {bg.image ? (
                      <img src={bg.image} alt={bg.label} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ background: bg.gradient, width: 40, height: 40, borderRadius: 4 }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Search for custom background */}
              <label className="settings-sub-label" style={{ marginTop: 12 }}>Search for a movie or show</label>
              <div className="bg-search-container">
                <input
                  type="text"
                  value={bgSearchQuery}
                  onChange={e => { setBgSearchQuery(e.target.value); searchBgMedia(e.target.value) }}
                  placeholder="Search movies or TV shows..."
                  className="bg-search-input"
                />
                {bgSearchLoading && <span className="bg-search-loading">Searching...</span>}
              </div>

              {/* Search results */}
              {bgSearchResults.length > 0 && (
                <div className="bg-search-results">
                  {bgSearchResults.map(item => (
                    <button key={`${item.media_type}-${item.id}`} className="bg-search-result" onClick={() => selectBgImage(item)}>
                      <img src={`https://image.tmdb.org/t/p/w300${item.backdrop_path}`} alt={item.title || item.name} />
                      <div className="bg-result-info">
                        <span className="bg-result-title">{item.title || item.name}</span>
                        <span className="bg-result-type">{item.media_type === 'movie' ? 'Movie' : 'TV Show'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Social links */}
            <div className="settings-field" style={{ marginTop: 16 }}>
              <label className="settings-field-label">Social media links</label>
              <div className="social-links-grid">
                {SOCIAL_PRESETS.map(s => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="social-icon" style={{ color: s.color }} dangerouslySetInnerHTML={{ __html: s.icon }} />
                    <input type="text"
                      value={socialLinks[s.key] || ''}
                      onChange={e => setSocialLinks(prev => ({ ...prev, [s.key]: e.target.value }))}
                      placeholder={s.placeholder}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Show email */}
            <div style={{ marginTop: 16 }}>
              <PrefRow label="Show email on profile" desc="Display your email on your public profile">
                <Toggle checked={showEmail} onChange={setShowEmail} />
              </PrefRow>
            </div>

            {/* Website */}
            <div className="settings-field" style={{ marginTop: 16 }}>
              <label className="settings-field-label">Website</label>
              <input type="text"
                value={website}
                onChange={e => handleWebsiteChange(e.target.value)}
                placeholder="yoursite.com (https:// added automatically)"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13 }} />
            </div>
          </SettingsSection>

          {/* ── Display ── */}
          <SettingsSection title="Display"
            description={`Preview: ${previewDate} at ${previewTime}`}>
            <div className="pref-grid">

              <PrefRow label="12-hour clock" desc={use12h ? 'e.g. 4:30 PM' : 'e.g. 16:30'}>
                <Toggle checked={use12h} onChange={v => setPref('traktor_12h', v, setUse12h)} />
              </PrefRow>

              <PrefRow label="Show seconds" desc={showSeconds ? 'e.g. 4:30:22 PM' : 'e.g. 4:30 PM'}>
                <Toggle checked={showSeconds} onChange={v => setPref('traktor_seconds', v, setShowSeconds)} />
              </PrefRow>

              <PrefRow label="Date format" desc="How dates appear throughout the app" column>
                <div className="date-format-grid">
                  {DATE_FORMAT_PRESETS.map(fmt => (
                    <button key={fmt.value}
                      className={`date-fmt-btn${dateFormat === fmt.value ? ' active' : ''}`}
                      onClick={() => setPref('traktor_datefmt', fmt.value, setDateFormat)}>
                      <span className="date-fmt-pattern">{fmt.label}</span>
                      <span className="date-fmt-example">{formatDateWithPattern(nowEx, fmt.value)}</span>
                    </button>
                  ))}
                </div>
              </PrefRow>

              <PrefRow label="Card size" desc="Size of poster cards in rows">
                <div className="card-size-picker">
                  {['small','medium','large'].map(size => (
                    <button key={size}
                      className={`card-size-btn${cardSize === size ? ' active' : ''}`}
                      onClick={() => setCardSizePref(size)}>
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                  ))}
                </div>
              </PrefRow>

              <PrefRow label="Spoiler mode" desc="Blur episode names and overviews until hovered">
                <Toggle checked={spoilerMode} onChange={setSpoilerModePref} />
              </PrefRow>

              <PrefRow label="Auto-mark show as watched" desc="When all episodes are done, automatically mark the show itself as watched (always enabled)">
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>Always on</span>
              </PrefRow>

            </div>
          </SettingsSection>
          <SettingsSection title="Privacy" description="Control who can see your profile. Changes save automatically.">
            <div className="pref-grid">
              <PrefRow label="Private profile" desc="Only you can see your profile page">
                <Toggle checked={isPrivate} onChange={setIsPrivate} />
              </PrefRow>
              {!isPrivate && <>
                <div className="pref-section-label">What others can see</div>
                {[
                  { key: 'watchHistory',    label: 'Watch history',    desc: 'Movies and shows you\'ve watched' },
                  { key: 'ratings',         label: 'Ratings',          desc: 'Your star ratings' },
                  { key: 'watchlist',       label: 'Watchlist',        desc: 'Your to-watch list' },
                  { key: 'episodeProgress', label: 'Episode progress', desc: 'Progress through each show' },
                ].map(f => (
                  <PrefRow key={f.key} label={f.label} desc={f.desc}>
                    <Toggle checked={visibleFields[f.key] ?? true}
                      onChange={v => setVisibleFields(p => ({ ...p, [f.key]: v }))} />
                  </PrefRow>
                ))}
              </>}
            </div>
          </SettingsSection>

          {/* ── Linked accounts ── */}
          <SettingsSection title="Linked accounts" description="Link multiple sign-in methods to your account.">
            <div className="linked-accounts">
              {[
                { id: 'google.com',    label: 'Google',    icon: 'G', linked: googleLinked,    provider: googleProvider },
                { id: 'microsoft.com', label: 'Microsoft', icon: 'M', linked: microsoftLinked, provider: microsoftProvider },
              ].map(acc => (
                <div className="linked-account-row" key={acc.id}>
                  <div className="linked-account-info">
                    <span className="linked-account-icon">{acc.icon}</span>
                    <div>
                      <span className="linked-account-name">{acc.label}</span>
                      {acc.linked && <span className="linked-badge">Connected</span>}
                    </div>
                  </div>
                  {acc.linked
                    ? <button className="unlink-btn" onClick={() => unlinkProvider(acc.id)}>Unlink</button>
                    : <button className="action-btn" onClick={() => linkProvider(acc.provider, acc.id)}>Connect</button>}
                </div>
              ))}
            </div>
          </SettingsSection>

          {/* ── Export ── */}
          <SettingsSection title="Export your data"
            description="Download a complete ZIP of all your Traktor data including watch history, ratings, episode progress, and name history.">
            <button className="action-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Preparing…' : '↓ Export my data'}
            </button>
          </SettingsSection>

          {/* ── Import from Trakt ── */}
          <SettingsSection title="Import from Trakt"
            description="Import your watch history and watchlist from Trakt.tv using a data export file.">
            <div className="trakt-import-section">
              <p className="settings-desc" style={{ marginBottom: 12, color: 'var(--text2)', fontSize: 13 }}>
                Export your data from Trakt.tv (Settings → Export Data → JSON), then upload it here to import your watch history and watchlist.
              </p>
              <label className="action-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                Upload Trakt Export
                <input
                  type="file"
                  accept=".zip,.json"
                  style={{ display: 'none' }}
                  onChange={e => handleTraktFileImport(e.target.files[0])}
                />
              </label>

              {/* Progress indicator */}
              {importing && importProgress.total > 0 && (
                <div className="trakt-import-progress">
                  <div className="trakt-progress-bar">
                    <div
                      className="trakt-progress-fill"
                      style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="trakt-progress-status">{importProgress.status}</p>
                  <p className="trakt-progress-count">{importProgress.current} / {importProgress.total}</p>
                </div>
              )}

              {importing && importProgress.total === 0 && importProgress.status && (
                <div className="trakt-import-progress">
                  <div className="trakt-progress-bar indeterminate">
                    <div className="trakt-progress-fill" />
                  </div>
                  <p className="trakt-progress-status">{importProgress.status}</p>
                </div>
              )}
            </div>
          </SettingsSection>

          {/* ── Delete ── */}
          <SettingsSection title="Delete account"
            description="Permanently and immediately delete your account and all data. This cannot be undone." danger>
            {!showDeleteFlow ? (
              <button className="danger-btn" onClick={() => setShowDeleteFlow(true)}>Delete my account</button>
            ) : (
              <div className="delete-flow">
                {deleteStep === 1 && (
                  <div className="delete-warning">
                    <div className="delete-warning-icon">⚠️</div>
                    <h3>This will permanently delete:</h3>
                    <ul className="delete-list">
                      <li>Your entire watch history and ratings</li>
                      <li>Your watchlist and episode progress</li>
                      <li>Your username, profile and account login</li>
                    </ul>
                    <p className="delete-warning-strong">No grace period. No recovery. Immediate.</p>
                    <div className="delete-flow-buttons">
                      <button className="danger-btn" onClick={() => setDeleteStep(2)}>I understand, continue</button>
                      <button className="unlink-btn" onClick={() => { setShowDeleteFlow(false); setDeleteStep(1) }}>Cancel</button>
                    </div>
                  </div>
                )}
                {deleteStep === 2 && (
                  <div className="delete-confirm">
                    <h3>Type DELETE to confirm</h3>
                    <p className="settings-desc">Type <strong>DELETE</strong> in all caps to confirm permanent deletion.</p>
                    <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                      placeholder="DELETE" className="delete-confirm-input" autoComplete="off" />
                    <div className="delete-flow-buttons">
                      <button className="danger-btn" onClick={handleDeleteAccount}
                        disabled={confirmText !== 'DELETE' || deleting}>
                        {deleting ? 'Deleting…' : 'Permanently delete my account'}
                      </button>
                      <button className="unlink-btn" onClick={() => { setShowDeleteFlow(false); setDeleteStep(1); setConfirmText('') }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SettingsSection>

        </div>
      </div>
    </PageWrapper>
  )
}

export default Settings