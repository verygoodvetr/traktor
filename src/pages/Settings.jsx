import { useState, useEffect, useRef } from 'react'
import { linkWithPopup, unlink, deleteUser, updateProfile } from 'firebase/auth'
import { auth, googleProvider, microsoftProvider } from '../firebase'
import { db } from '../firebase'
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { getUserProfile, updateUserProfile, isUsernameTaken, exportUserData } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

const BLOCKED_USERNAMES = [
  'me','user','username','admin','administrator','moderator','staff',
  'support','help','null','undefined','root','system','traktor','operator',
  'fuck','shit','ass','bitch','bastard','cunt','dick','pussy','cock',
  'nigger','nigga','faggot','retard',
]

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
  const [savingUsername, setSavingUsername] = useState(false)
  const [isPrivate,      setIsPrivate]      = useState(false)
  const [visibleFields,  setVisibleFields]  = useState({
    watchHistory:    true,
    ratings:         true,
    watchlist:       true,
    episodeProgress: true,
  })

  const privacyTimer = useRef(null)
  const navigate = useNavigate()

  /* ── Load profile ── */
  useEffect(() => {
    setProviders(user.providerData.map(p => p.providerId))
    getUserProfile(user.uid).then(p => {
      if (!p) return
      setProfile(p)
      setUsername(p.username || '')
      setDisplayName(p.displayName || user.displayName || '')
      setIsPrivate(p.isPrivate || false)
      setVisibleFields(p.visibleFields || {
        watchHistory: true, ratings: true,
        watchlist: true, episodeProgress: true,
      })
    })
  }, [user])

  /* ── Auto-save privacy settings ── */
  useEffect(() => {
    if (!profile) return               // don't fire on first load
    clearTimeout(privacyTimer.current)
    privacyTimer.current = setTimeout(async () => {
      await updateUserProfile(user.uid, { isPrivate, visibleFields })
    }, 800)
    return () => clearTimeout(privacyTimer.current)
  }, [isPrivate, visibleFields]) // eslint-disable-line

  /* ── Linked accounts ── */
  async function linkProvider(provider, providerId) {
    try {
      await linkWithPopup(auth.currentUser, provider)
      setProviders(prev => [...prev, providerId])
      showToast('Account linked successfully!')
    } catch (err) {
      if (err.code === 'auth/credential-already-in-use') {
        showToast('This account is already linked to another profile.', 'error')
      } else {
        showToast('Something went wrong, please try again.', 'error')
      }
    }
  }

  async function unlinkProvider(providerId) {
    if (providers.length === 1) {
      showToast("You can't unlink your only sign-in method!", 'error')
      return
    }
    try {
      await unlink(auth.currentUser, providerId)
      setProviders(prev => prev.filter(p => p !== providerId))
      showToast('Account unlinked.')
    } catch {
      showToast('Something went wrong, please try again.', 'error')
    }
  }

  /* ── Save username ── */
  async function saveUsername() {
    const trimmed = username.trim()
    if (trimmed.length < 2) {
      showToast('Username must be at least 2 characters.', 'error'); return
    }
    if (trimmed.length > 24) {
      showToast('Username must be at most 24 characters.', 'error'); return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      showToast('Username can only contain letters, numbers and underscores.', 'error'); return
    }
    if (BLOCKED_USERNAMES.includes(trimmed.toLowerCase())) {
      showToast('This username is not allowed.', 'error'); return
    }
    setSavingUsername(true)
    if (trimmed !== profile?.username) {
      const taken = await isUsernameTaken(trimmed)
      if (taken) {
        showToast('This username is already taken.', 'error')
        setSavingUsername(false); return
      }
    }
    await updateUserProfile(user.uid, { username: trimmed })
    setProfile(prev => ({ ...prev, username: trimmed }))
    showToast('Username saved!')
    setSavingUsername(false)
  }

  /* ── Save display name ── */
  async function saveDisplayName() {
    const trimmed = displayName.trim()
    if (!trimmed) { showToast('Display name cannot be empty.', 'error'); return }
    setSavingUsername(true)
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed })
      await updateUserProfile(user.uid, { displayName: trimmed })
      showToast('Display name saved!')
    } catch {
      showToast('Something went wrong.', 'error')
    }
    setSavingUsername(false)
  }

  /* ── Toggle visible field ── */
  function toggleVisibleField(field) {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }))
  }

  /* ── Export data ── */
  async function handleExport() {
    setExporting(true)
    try {
      const JSZip = (await import('jszip')).default
      const data  = await exportUserData(user)
      const zip   = new JSZip()

      zip.file('profile.json',         JSON.stringify(data.profile,   null, 2))
      zip.file('watched-movies.json',  JSON.stringify(data.watched.filter(i => i.media_type === 'movie'), null, 2))
      zip.file('watched-shows.json',   JSON.stringify(data.watched.filter(i => i.media_type === 'tv'),    null, 2))
      zip.file('watchlist-movies.json',JSON.stringify(data.watchlist.filter(i => i.media_type === 'movie'),null,2))
      zip.file('watchlist-shows.json', JSON.stringify(data.watchlist.filter(i => i.media_type === 'tv'),   null,2))
      zip.file('episodes.json',        JSON.stringify(data.episodes,  null, 2))
      zip.file('ratings.json',         JSON.stringify(
        data.watched.filter(i => i.rating != null).map(i => ({
          title: i.title, media_type: i.media_type, id: i.id, rating: i.rating,
        })), null, 2
      ))
      zip.file('README.txt', `Traktor Data Export
===================
Exported: ${new Date().toLocaleString()}
Account:  ${data.profile.displayName} (${data.profile.email})

Files included:
- profile.json           Your account info and settings
- watched-movies.json    Movies you have marked as watched
- watched-shows.json     TV shows you have marked as watched
- watchlist-movies.json  Movies on your watchlist
- watchlist-shows.json   TV shows on your watchlist
- episodes.json          Individual episode watch history
- ratings.json           All your ratings in one place

For questions: traktorapp@gmail.com`)

      const blob = await zip.generateAsync({ type: 'blob' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `traktor-export-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export downloaded!')
    } catch (err) {
      console.error(err)
      showToast('Export failed, please try again.', 'error')
    }
    setExporting(false)
  }

  /* ── Delete account ── */
  async function handleDeleteAccount() {
    if (confirmText !== 'DELETE') return
    setDeleting(true)
    try {
      const uid = user.uid
      for (const sub of ['watched', 'watchlist', 'episodes']) {
        const snap = await getDocs(collection(db, 'users', uid, sub))
        for (const d of snap.docs) await deleteDoc(doc(db, 'users', uid, sub, d.id))
      }
      await deleteDoc(doc(db, 'users', uid))
      await deleteUser(auth.currentUser)
      navigate('/')
      showToast('Your account has been deleted.')
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        showToast('Please sign out and sign back in, then try again immediately.', 'error')
      } else {
        showToast(`Deletion failed: ${err.message}`, 'error')
      }
      setShowDeleteFlow(false)
      setDeleteStep(1)
      setConfirmText('')
      setDeleting(false)
    }
  }

  const googleLinked    = providers.includes('google.com')
  const microsoftLinked = providers.includes('microsoft.com')

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="settings-page">
          <h1>Settings</h1>

          {/* ── Profile ── */}
          <div className="settings-section">
            <h2>Profile</h2>
            <p className="settings-desc">
              Your username is how others find you on Traktor.
              {profile?.username && ` Your public profile is at /user/${profile.username}`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Username */}
              <div>
                <label style={{ fontSize: 13, opacity: 0.6, marginBottom: 6, display: 'block' }}>
                  Username
                </label>
                <div className="username-row">
                  <span className="username-at">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={e =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    placeholder="username"
                    maxLength={24}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="action-btn"
                    onClick={saveUsername}
                    disabled={savingUsername || username.length < 2}
                  >
                    {savingUsername ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text4)', marginTop: 4 }}>
                  2–24 characters. Letters, numbers and underscores only.
                </p>
              </div>

              {/* Display name */}
              <div>
                <label style={{ fontSize: 13, opacity: 0.6, marginBottom: 6, display: 'block' }}>
                  Display name
                </label>
                <div className="username-row">
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    maxLength={40}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="action-btn"
                    onClick={saveDisplayName}
                    disabled={savingUsername}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Privacy ── */}
          <div className="settings-section">
            <h2>Privacy</h2>
            <p className="settings-desc">
              Control who can see your profile and what they can see.
              Settings save automatically.
            </p>

            <div className="privacy-row">
              <div>
                <p className="privacy-label">Private profile</p>
                <p className="privacy-desc">Only you can see your profile</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {!isPrivate && (
              <>
                <p className="settings-desc" style={{ marginTop: 16 }}>
                  Choose what others can see on your public profile:
                </p>
                {[
                  { key: 'watchHistory',    label: 'Watch history' },
                  { key: 'ratings',         label: 'Ratings' },
                  { key: 'watchlist',       label: 'Watchlist' },
                  { key: 'episodeProgress', label: 'Episode progress' },
                ].map(field => (
                  <div className="privacy-row" key={field.key}>
                    <p className="privacy-label">{field.label}</p>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={visibleFields[field.key] ?? true}
                        onChange={() => toggleVisibleField(field.key)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ── Linked accounts ── */}
          <div className="settings-section">
            <h2>Linked accounts</h2>
            <p className="settings-desc">
              Link multiple accounts so you can sign in with either one.
            </p>

            <div className="provider-row">
              <span>Google</span>
              {googleLinked
                ? <button className="unlink-btn" onClick={() => unlinkProvider('google.com')}>Unlink</button>
                : <button className="action-btn" onClick={() => linkProvider(googleProvider, 'google.com')}>Link Google</button>
              }
            </div>

            <div className="provider-row">
              <span>Microsoft</span>
              {microsoftLinked
                ? <button className="unlink-btn" onClick={() => unlinkProvider('microsoft.com')}>Unlink</button>
                : <button className="action-btn" onClick={() => linkProvider(microsoftProvider, 'microsoft.com')}>Link Microsoft</button>
              }
            </div>
          </div>

          {/* ── Export ── */}
          <div className="settings-section">
            <h2>Export your data</h2>
            <p className="settings-desc">
              Download a copy of all your Traktor data as a ZIP file.
            </p>
            <button className="action-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Preparing export…' : 'Export my data'}
            </button>
          </div>

          {/* ── Delete ── */}
          <div className="settings-section danger-section">
            <h2>Delete account</h2>
            <p className="settings-desc">
              Permanently delete your account and all your data. This cannot be undone.
            </p>

            {!showDeleteFlow ? (
              <button className="danger-btn" onClick={() => setShowDeleteFlow(true)}>
                Delete my account
              </button>
            ) : (
              <div className="delete-flow">
                {deleteStep === 1 && (
                  <div className="delete-warning">
                    <div className="delete-warning-icon">⚠️</div>
                    <h3>Are you absolutely sure?</h3>
                    <p>Deleting your account will permanently remove:</p>
                    <ul className="delete-list">
                      <li>Your entire watch history</li>
                      <li>All your ratings</li>
                      <li>Your watchlist</li>
                      <li>Your episode progress for all shows</li>
                      <li>Your account login</li>
                    </ul>
                    <p className="delete-warning-strong">
                      This is <strong>permanent and irreversible.</strong> There is no grace period,
                      no backup, and no way to recover your data once deleted.
                    </p>
                    <div className="delete-flow-buttons">
                      <button className="danger-btn" onClick={() => setDeleteStep(2)}>
                        I understand, continue
                      </button>
                      <button
                        className="unlink-btn"
                        onClick={() => { setShowDeleteFlow(false); setDeleteStep(1) }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {deleteStep === 2 && (
                  <div className="delete-confirm">
                    <h3>Type DELETE to confirm</h3>
                    <p className="settings-desc">
                      Type <strong>DELETE</strong> in all caps to permanently delete your account.
                    </p>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={e => setConfirmText(e.target.value)}
                      placeholder="Type DELETE here"
                      className="delete-confirm-input"
                      autoComplete="off"
                    />
                    <div className="delete-flow-buttons">
                      <button
                        className="danger-btn"
                        onClick={handleDeleteAccount}
                        disabled={confirmText !== 'DELETE' || deleting}
                      >
                        {deleting ? 'Deleting…' : 'Permanently delete my account'}
                      </button>
                      <button
                        className="unlink-btn"
                        onClick={() => {
                          setShowDeleteFlow(false)
                          setDeleteStep(1)
                          setConfirmText('')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </PageWrapper>
  )
}

export default Settings