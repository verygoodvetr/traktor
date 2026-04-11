import { useState, useEffect, useRef } from 'react'
import { linkWithPopup, unlink, deleteUser, updateProfile, reauthenticateWithPopup } from 'firebase/auth'
import { auth, googleProvider, microsoftProvider } from '../firebase'
import { db } from '../firebase'
import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  getUserProfile, updateUserProfile, updateUsername, updateDisplayName,
  updateProfilePhoto, isUsernameTaken, exportUserData,
} from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

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
    reducedMotion:localStorage.getItem('traktor_reduced')  === 'true',
    spoilerMode:  localStorage.getItem('traktor_spoilers') === 'true',
    autoMarkShow: localStorage.getItem('traktor_automark') === 'true',
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
function PhotoPicker({ currentPhoto, onSave, uid }) {
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('url') // 'url' | 'picker'

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
        <div className="avatar-grid">
          {AVATAR_OPTIONS.map(av => (
            <button key={av.id} className={`avatar-option${currentPhoto === av.src ? ' selected' : ''}`}
              onClick={() => save(av.src)} disabled={saving}>
              <img src={av.src} alt={av.id} />
            </button>
          ))}
        </div>
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
  const [profile,        setProfile]        = useState(null)
  const [username,       setUsername]       = useState('')
  const [displayName,    setDisplayName]    = useState(user.displayName || '')
  const [savingProfile,  setSavingProfile]  = useState(false)
  const [photoURL,       setPhotoURL]       = useState(user.photoURL || DEFAULT_AVATAR)
  const [isPrivate,      setIsPrivate]      = useState(false)
  const [visibleFields,  setVisibleFields]  = useState({ watchHistory: true, ratings: true, watchlist: true, episodeProgress: true })
  const [showHistory,    setShowHistory]    = useState(false)

  // Display prefs — read from localStorage on mount
  const [use12h,        setUse12h]        = useState(() => localStorage.getItem('traktor_12h')      === 'true')
  const [showSeconds,   setShowSeconds]   = useState(() => localStorage.getItem('traktor_seconds')  === 'true')
  const [dateFormat,    setDateFormat]    = useState(() => localStorage.getItem('traktor_datefmt')  || 'DD.MM.YYYY')
  const [compactCards,  setCompactCards]  = useState(() => localStorage.getItem('traktor_compact')  === 'true')
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('traktor_reduced')  === 'true')
  const [spoilerMode,   setSpoilerMode]   = useState(() => localStorage.getItem('traktor_spoilers') === 'true')
  const [autoMarkShow,  setAutoMarkShow]  = useState(() => localStorage.getItem('traktor_automark') === 'true')
  const [cardSize,      setCardSize]      = useState(() => localStorage.getItem('traktor_cardsize') || 'medium')

  const privacyTimer = useRef(null)
  const navigate     = useNavigate()

  // Apply preferences to DOM immediately on load
  useEffect(() => {
    if (reducedMotion) document.documentElement.classList.add('reduced-motion')
    else document.documentElement.classList.remove('reduced-motion')
  }, [reducedMotion])

  useEffect(() => {
    document.documentElement.setAttribute('data-card-size', cardSize)
  }, [cardSize])

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
    })
  }, [user])

  // Auto-save privacy settings
  useEffect(() => {
    if (!profile) return
    clearTimeout(privacyTimer.current)
    privacyTimer.current = setTimeout(() => {
      updateUserProfile(user.uid, { isPrivate, visibleFields })
    }, 800)
    return () => clearTimeout(privacyTimer.current)
  }, [isPrivate, visibleFields]) // eslint-disable-line

  function setPref(key, val, setter) {
    setter(val)
    localStorage.setItem(key, String(val))
  }

  function setReducedMotionPref(val) {
    setPref('traktor_reduced', val, setReducedMotion)
    if (val) document.documentElement.classList.add('reduced-motion')
    else     document.documentElement.classList.remove('reduced-motion')
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
                <PhotoPicker currentPhoto={photoURL} uid={user.uid} onSave={url => setPhotoURL(url)} />
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

              <PrefRow label="Reduce motion" desc="Minimise animations across the site">
                <Toggle checked={reducedMotion} onChange={setReducedMotionPref} />
              </PrefRow>

              <PrefRow label="Spoiler mode" desc="Blur episode names and overviews until hovered">
                <Toggle checked={spoilerMode} onChange={setSpoilerModePref} />
              </PrefRow>

              <PrefRow label="Auto-mark show as watched" desc="When all episodes are done, automatically mark the show itself as watched">
                <Toggle checked={autoMarkShow} onChange={v => setPref('traktor_automark', v, setAutoMarkShow)} />
              </PrefRow>

            </div>
          </SettingsSection>

          {/* ── Privacy ── */}
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