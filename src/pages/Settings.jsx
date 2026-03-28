import { useState, useEffect } from 'react'
import { linkWithPopup, unlink, deleteUser, updateProfile } from 'firebase/auth'
import { auth, googleProvider, microsoftProvider } from '../firebase'
import { db } from '../firebase'
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { getUserProfile, updateUserProfile, isUsernameTaken, exportUserData } from '../firestore'
import PageWrapper from '../components/PageWrapper'
import { showToast } from '../components/Toast'

function Settings({ user }) {
  const [providers, setProviders] = useState([])
  const [showDeleteFlow, setShowDeleteFlow] = useState(false)
  const [deleteStep, setDeleteStep] = useState(1)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [profile, setProfile] = useState(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState(user.displayName || '')
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [visibleFields, setVisibleFields] = useState({
    watchHistory: true,
    ratings: true,
    watchlist: true,
    episodeProgress: true
  })
  const navigate = useNavigate()

  useEffect(() => {
    setProviders(user.providerData.map(p => p.providerId))
    getUserProfile(user.uid).then(p => {
      if (p) {
        setProfile(p)
        setUsername(p.username || '')
        setDisplayName(p.displayName || user.displayName || '')
        setIsPrivate(p.isPrivate || false)
        setVisibleFields(p.visibleFields || {
          watchHistory: true,
          ratings: true,
          watchlist: true,
          episodeProgress: true
        })
      }
    })
  }, [user])

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
      showToast("You can't unlink your only sign in method!", 'error')
      return
    }
    try {
      await unlink(auth.currentUser, providerId)
      setProviders(prev => prev.filter(p => p !== providerId))
      showToast('Account unlinked.')
    } catch (err) {
      showToast('Something went wrong, please try again.', 'error')
    }
  }

  async function saveUsername() {
    const trimmed = username.trim()
    if (trimmed.length < 3) {
      showToast('Username must be at least 3 characters.', 'error')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      showToast('Username can only contain letters, numbers and underscores.', 'error')
      return
    }
    setUsernameLoading(true)
    if (trimmed !== profile?.username) {
      const taken = await isUsernameTaken(trimmed)
      if (taken) {
        showToast('This username is already taken.', 'error')
        setUsernameLoading(false)
        return
      }
    }
    await updateUserProfile(user.uid, { username: trimmed })
    setProfile(prev => ({ ...prev, username: trimmed }))
    showToast('Username saved!')
    setUsernameLoading(false)
  }

  async function saveDisplayName() {
    const trimmed = displayName.trim()
    if (!trimmed) {
      showToast('Display name cannot be empty.', 'error')
      return
    }
    setUsernameLoading(true)
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed })
      await updateUserProfile(user.uid, { displayName: trimmed })
      showToast('Display name saved!')
    } catch (err) {
      showToast('Something went wrong.', 'error')
    }
    setUsernameLoading(false)
  }

  async function savePrivacySettings() {
    await updateUserProfile(user.uid, { isPrivate, visibleFields })
    showToast('Privacy settings saved!')
  }

  function toggleVisibleField(field) {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }))
  }

  async function handleExport() {
    setExporting(true)
    try {
      const JSZip = (await import('jszip')).default
      const data = await exportUserData(user)
      const zip = new JSZip()

      zip.file('profile.json', JSON.stringify(data.profile, null, 2))

      const watchedMovies = data.watched.filter(i => i.media_type === 'movie')
      const watchedShows = data.watched.filter(i => i.media_type === 'tv')
      zip.file('watched-movies.json', JSON.stringify(watchedMovies, null, 2))
      zip.file('watched-shows.json', JSON.stringify(watchedShows, null, 2))

      const watchlistMovies = data.watchlist.filter(i => i.media_type === 'movie')
      const watchlistShows = data.watchlist.filter(i => i.media_type === 'tv')
      zip.file('watchlist-movies.json', JSON.stringify(watchlistMovies, null, 2))
      zip.file('watchlist-shows.json', JSON.stringify(watchlistShows, null, 2))

      zip.file('episodes.json', JSON.stringify(data.episodes, null, 2))

      const ratings = data.watched
        .filter(i => i.rating !== null && i.rating !== undefined)
        .map(i => ({
          title: i.title,
          media_type: i.media_type,
          id: i.id,
          rating: i.rating
        }))
      zip.file('ratings.json', JSON.stringify(ratings, null, 2))

      zip.file('README.txt', `Traktor Data Export
===================
Exported: ${new Date().toLocaleString()}
Account: ${data.profile.displayName} (${data.profile.email})

Files included:
- profile.json          Your account info and settings
- watched-movies.json   Movies you have marked as watched
- watched-shows.json    TV shows you have marked as watched
- watchlist-movies.json Movies on your watchlist
- watchlist-shows.json  TV shows on your watchlist
- episodes.json         Individual episode watch history
- ratings.json          All your ratings in one place

This export contains all personal data Traktor holds about you.
For questions contact traktorapp@gmail.com`)

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
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

  async function handleDeleteAccount() {
    if (confirmText !== 'DELETE') return
    setDeleting(true)
    try {
      const uid = user.uid

      // Delete Firestore data FIRST while still authenticated
      const subcollections = ['watched', 'watchlist', 'episodes']
      for (const sub of subcollections) {
        const snap = await getDocs(collection(db, 'users', uid, sub))
        for (const d of snap.docs) {
          await deleteDoc(doc(db, 'users', uid, sub, d.id))
        }
      }
      await deleteDoc(doc(db, 'users', uid))

      // Then delete the Auth account
      await deleteUser(auth.currentUser)

      navigate('/')
      showToast('Your account has been deleted.')
    } catch (err) {
      console.log('Delete error code:', err.code)
      console.log('Delete error message:', err.message)

      if (err.code === 'auth/requires-recent-login') {
        showToast('Please sign out and sign back in, then try again immediately.', 'error')
        setShowDeleteFlow(false)
        setDeleteStep(1)
        setConfirmText('')
      } else if (err.code === 'permission-denied') {
        showToast('Permission error — please sign out and sign back in, then try again.', 'error')
        setShowDeleteFlow(false)
        setDeleteStep(1)
        setConfirmText('')
      } else {
        showToast(`Deletion failed: ${err.message}`, 'error')
      }
      setDeleting(false)
    }
  }

  const googleLinked = providers.includes('google.com')
  const microsoftLinked = providers.includes('microsoft.com')

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="settings-page">
          <h1>Settings</h1>

          <div className="settings-section">
            <h2>Profile</h2>
            <p className="settings-desc">
              Your username is how others find you on Traktor.
              {profile?.username && ` Your public profile is at /user/${profile.username}`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', opacity: 0.6, marginBottom: '6px', display: 'block' }}>
                  Username
                </label>
                <div className="username-row">
                  <span className="username-at">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username"
                    maxLength={20}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="action-btn"
                    onClick={saveUsername}
                    disabled={usernameLoading || username.length < 3}
                  >
                    {usernameLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', opacity: 0.6, marginBottom: '6px', display: 'block' }}>
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
                    disabled={usernameLoading}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h2>Privacy</h2>
            <p className="settings-desc">Control who can see your profile and what they can see.</p>

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
                <p className="settings-desc" style={{ marginTop: '16px' }}>
                  Choose what others can see on your public profile:
                </p>
                {[
                  { key: 'watchHistory', label: 'Watch history' },
                  { key: 'ratings', label: 'Ratings' },
                  { key: 'watchlist', label: 'Watchlist' },
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

            <button
              className="action-btn"
              onClick={savePrivacySettings}
              style={{ marginTop: '16px' }}
            >
              Save privacy settings
            </button>
          </div>

          <div className="settings-section">
            <h2>Linked accounts</h2>
            <p className="settings-desc">
              Link multiple accounts so you can sign in with either one.
            </p>

            <div className="provider-row">
              <span>Google</span>
              {googleLinked ? (
                <button className="unlink-btn" onClick={() => unlinkProvider('google.com')}>Unlink</button>
              ) : (
                <button className="action-btn" onClick={() => linkProvider(googleProvider, 'google.com')}>Link Google</button>
              )}
            </div>

            <div className="provider-row">
              <span>Microsoft</span>
              {microsoftLinked ? (
                <button className="unlink-btn" onClick={() => unlinkProvider('microsoft.com')}>Unlink</button>
              ) : (
                <button className="action-btn" onClick={() => linkProvider(microsoftProvider, 'microsoft.com')}>Link Microsoft</button>
              )}
            </div>
          </div>

          <div className="settings-section">
            <h2>Export your data</h2>
            <p className="settings-desc">
              Download a copy of all your Traktor data including your watch history, ratings, watchlist and episode progress as a ZIP file.
            </p>
            <button
              className="action-btn"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Preparing export...' : 'Export my data'}
            </button>
          </div>

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
                      This is <strong>permanent and irreversible.</strong> There is no grace period, no backup, and no way to recover your data once deleted.
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
                      Type <strong>DELETE</strong> in all caps to permanently delete your account and all your data.
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
                        {deleting ? 'Deleting...' : 'Permanently delete my account'}
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