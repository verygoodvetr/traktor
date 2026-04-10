import { useState, useEffect, useRef } from 'react'
import { linkWithPopup, unlink, deleteUser, updateProfile, reauthenticateWithPopup } from 'firebase/auth'
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

function SettingsSection({ title, description, children, danger }) {
  return (
    <div className={`settings-section ${danger ? 'danger-section' : ''}`}>
      <h2>{title}</h2>
      {description && <p className="settings-desc">{description}</p>}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  )
}

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
  const [isPrivate,      setIsPrivate]      = useState(false)
  const [visibleFields,  setVisibleFields]  = useState({
    watchHistory: true, ratings: true, watchlist: true, episodeProgress: true,
  })

  // Display preferences
  const [use12hClock,  setUse12hClock]  = useState(() => { try { return localStorage.getItem('traktor_12h') === 'true' } catch { return false } })
  const [useDMY,       setUseDMY]       = useState(() => { try { return localStorage.getItem('traktor_dmy') !== 'false' } catch { return true } })
  const [language,     setLanguage]     = useState(() => { try { return localStorage.getItem('traktor_lang') || 'en-US' } catch { return 'en-US' } })
  const [compactMode,  setCompactMode]  = useState(() => { try { return localStorage.getItem('traktor_compact') === 'true' } catch { return false } })
  const [autoplay,     setAutoplay]     = useState(() => { try { return localStorage.getItem('traktor_autoplay') !== 'false' } catch { return true } })

  const privacyTimer = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    setProviders(user.providerData.map(p => p.providerId))
    getUserProfile(user.uid).then(p => {
      if (!p) return
      setProfile(p)
      setUsername(p.username || '')
      setDisplayName(p.displayName || user.displayName || '')
      setIsPrivate(p.isPrivate || false)
      setVisibleFields(p.visibleFields || { watchHistory: true, ratings: true, watchlist: true, episodeProgress: true })
    })
  }, [user])

  useEffect(() => {
    if (!profile) return
    clearTimeout(privacyTimer.current)
    privacyTimer.current = setTimeout(async () => {
      await updateUserProfile(user.uid, { isPrivate, visibleFields })
    }, 800)
    return () => clearTimeout(privacyTimer.current)
  }, [isPrivate, visibleFields]) // eslint-disable-line

  function setPref(key, val, setter) {
    setter(val)
    try { localStorage.setItem(key, String(val)) } catch {}
  }

  async function linkProvider(provider, providerId) {
    try {
      await linkWithPopup(auth.currentUser, provider)
      setProviders(prev => [...prev, providerId])
      showToast('Account linked successfully!')
    } catch (err) {
      if (err.code === 'auth/credential-already-in-use') showToast('This account is already linked to another profile.', 'error')
      else showToast('Something went wrong, please try again.', 'error')
    }
  }

  async function unlinkProvider(providerId) {
    if (providers.length === 1) { showToast("You can't unlink your only sign-in method!", 'error'); return }
    try {
      await unlink(auth.currentUser, providerId)
      setProviders(prev => prev.filter(p => p !== providerId))
      showToast('Account unlinked.')
    } catch { showToast('Something went wrong, please try again.', 'error') }
  }

  async function saveUsername() {
    const trimmed = username.trim()
    if (trimmed.length < 2)  { showToast('Username must be at least 2 characters.', 'error'); return }
    if (trimmed.length > 24) { showToast('Username must be at most 24 characters.', 'error'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { showToast('Username can only contain letters, numbers and underscores.', 'error'); return }
    if (BLOCKED_USERNAMES.includes(trimmed.toLowerCase())) { showToast('This username is not allowed.', 'error'); return }
    setSavingProfile(true)
    if (trimmed !== profile?.username) {
      const taken = await isUsernameTaken(trimmed)
      if (taken) { showToast('This username is already taken.', 'error'); setSavingProfile(false); return }
    }
    await updateUserProfile(user.uid, { username: trimmed })
    setProfile(prev => ({ ...prev, username: trimmed }))
    showToast('Username saved!')
    setSavingProfile(false)
  }

  async function saveDisplayName() {
    const trimmed = displayName.trim()
    if (!trimmed) { showToast('Display name cannot be empty.', 'error'); return }
    setSavingProfile(true)
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed })
      await updateUserProfile(user.uid, { displayName: trimmed })
      showToast('Display name saved!')
    } catch { showToast('Something went wrong.', 'error') }
    setSavingProfile(false)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const JSZip = (await import('jszip')).default
      const data = await exportUserData(user)
      const zip = new JSZip()
      zip.file('profile.json', JSON.stringify(data.profile, null, 2))
      zip.file('watched-movies.json', JSON.stringify(data.watched.filter(i => i.media_type === 'movie'), null, 2))
      zip.file('watched-shows.json', JSON.stringify(data.watched.filter(i => i.media_type === 'tv'), null, 2))
      zip.file('watchlist-movies.json', JSON.stringify(data.watchlist.filter(i => i.media_type === 'movie'), null, 2))
      zip.file('watchlist-shows.json', JSON.stringify(data.watchlist.filter(i => i.media_type === 'tv'), null, 2))
      zip.file('episodes.json', JSON.stringify(data.episodes, null, 2))
      zip.file('ratings.json', JSON.stringify(data.watched.filter(i => i.rating != null).map(i => ({ title: i.title, media_type: i.media_type, id: i.id, rating: i.rating })), null, 2))
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `traktor-export-${new Date().toISOString().slice(0,10)}.zip`
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
      const currentUser = auth.currentUser

      // Step 1: Try to delete Auth account FIRST (most likely to fail due to recent-login)
      // This way if it fails, we haven't touched any data
      try {
        await deleteUser(currentUser)
      } catch (authErr) {
        if (authErr.code === 'auth/requires-recent-login') {
          // Re-authenticate then try again
          const provider = providers.includes('google.com') ? googleProvider : microsoftProvider
          await reauthenticateWithPopup(currentUser, provider)
          await deleteUser(currentUser)
        } else {
          throw authErr
        }
      }

      // Step 2: Auth deleted successfully — now delete Firestore data
      for (const sub of ['watched', 'watchlist', 'episodes']) {
        const snap = await getDocs(collection(db, 'users', uid, sub))
        for (const d of snap.docs) await deleteDoc(doc(db, 'users', uid, sub, d.id))
      }
      await deleteDoc(doc(db, 'users', uid))

      navigate('/')
      showToast('Your account has been permanently deleted.')
    } catch (err) {
      console.error('Delete error:', err)
      showToast(`Deletion failed: ${err.message}`, 'error')
      setShowDeleteFlow(false)
      setDeleteStep(1)
      setConfirmText('')
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

          {/* ── Profile ── */}
          <SettingsSection title="Profile" description={profile?.username ? `Your public profile is at /user/${profile.username}` : 'Set a username so others can find you.'}>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label className="settings-field-label">Username</label>
                <div className="username-row">
                  <span className="username-at">@</span>
                  <input type="text" value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username" maxLength={24} style={{ flex:1 }} />
                  <button className="action-btn" onClick={saveUsername} disabled={savingProfile || username.length < 2}>
                    {savingProfile ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <p className="settings-hint">2–24 characters. Letters, numbers and underscores only.</p>
              </div>
              <div>
                <label className="settings-field-label">Display name</label>
                <div className="username-row">
                  <input type="text" value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your display name" maxLength={40} style={{ flex:1 }} />
                  <button className="action-btn" onClick={saveDisplayName} disabled={savingProfile}>Save</button>
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* ── Display ── */}
          <SettingsSection title="Display" description="Customise how information is shown across the app.">
            <div className="settings-prefs-grid">
              <div className="pref-row">
                <div className="pref-label-block">
                  <span className="pref-label">Time format</span>
                  <span className="pref-desc">{use12hClock ? '12-hour · 4:30 PM' : '24-hour · 16:30'}</span>
                </div>
                <Toggle checked={use12hClock} onChange={v => setPref('traktor_12h', v, setUse12hClock)} />
              </div>

              <div className="pref-row">
                <div className="pref-label-block">
                  <span className="pref-label">Date format</span>
                  <span className="pref-desc">{useDMY ? 'DD.MM.YYYY · 31.12.2025' : 'MM/DD/YYYY · 12/31/2025'}</span>
                </div>
                <Toggle checked={useDMY} onChange={v => setPref('traktor_dmy', v, setUseDMY)} />
              </div>

              <div className="pref-row">
                <div className="pref-label-block">
                  <span className="pref-label">Compact cards</span>
                  <span className="pref-desc">Smaller poster cards on the home feed</span>
                </div>
                <Toggle checked={compactMode} onChange={v => setPref('traktor_compact', v, setCompactMode)} />
              </div>

              <div className="pref-row">
                <div className="pref-label-block">
                  <span className="pref-label">Language / Region</span>
                  <span className="pref-desc">Affects date and number formatting</span>
                </div>
                <select className="settings-select" value={language} onChange={e => setPref('traktor_lang', e.target.value, setLanguage)}>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="de-DE">Deutsch</option>
                  <option value="fr-FR">Français</option>
                  <option value="sk-SK">Slovenčina</option>
                  <option value="cs-CZ">Čeština</option>
                  <option value="pl-PL">Polski</option>
                  <option value="es-ES">Español</option>
                  <option value="it-IT">Italiano</option>
                  <option value="ja-JP">日本語</option>
                </select>
              </div>
            </div>
          </SettingsSection>

          {/* ── Privacy ── */}
          <SettingsSection title="Privacy" description="Control who can see your profile and data. Changes save automatically.">
            <div className="settings-prefs-grid">
              <div className="pref-row">
                <div className="pref-label-block">
                  <span className="pref-label">Private profile</span>
                  <span className="pref-desc">Only you can see your profile page</span>
                </div>
                <Toggle checked={isPrivate} onChange={setIsPrivate} />
              </div>

              {!isPrivate && <>
                <div className="pref-section-label">What others can see on your profile</div>
                {[
                  { key:'watchHistory', label:'Watch history', desc:'Movies and shows you\'ve watched' },
                  { key:'ratings', label:'Your ratings', desc:'Star ratings you\'ve given' },
                  { key:'watchlist', label:'Watchlist', desc:'Items on your to-watch list' },
                  { key:'episodeProgress', label:'Episode progress', desc:'How far through each show' },
                ].map(f => (
                  <div className="pref-row" key={f.key}>
                    <div className="pref-label-block">
                      <span className="pref-label">{f.label}</span>
                      <span className="pref-desc">{f.desc}</span>
                    </div>
                    <Toggle checked={visibleFields[f.key] ?? true} onChange={v => setVisibleFields(p => ({ ...p, [f.key]: v }))} />
                  </div>
                ))}
              </>}
            </div>
          </SettingsSection>

          {/* ── Linked accounts ── */}
          <SettingsSection title="Linked accounts" description="Link multiple sign-in methods to your account.">
            <div className="linked-accounts">
              <div className="linked-account-row">
                <div className="linked-account-info">
                  <span className="linked-account-icon">G</span>
                  <div>
                    <span className="linked-account-name">Google</span>
                    {googleLinked && <span className="linked-badge">Connected</span>}
                  </div>
                </div>
                {googleLinked
                  ? <button className="unlink-btn" onClick={() => unlinkProvider('google.com')}>Unlink</button>
                  : <button className="action-btn" onClick={() => linkProvider(googleProvider, 'google.com')}>Connect</button>}
              </div>
              <div className="linked-account-row">
                <div className="linked-account-info">
                  <span className="linked-account-icon">M</span>
                  <div>
                    <span className="linked-account-name">Microsoft</span>
                    {microsoftLinked && <span className="linked-badge">Connected</span>}
                  </div>
                </div>
                {microsoftLinked
                  ? <button className="unlink-btn" onClick={() => unlinkProvider('microsoft.com')}>Unlink</button>
                  : <button className="action-btn" onClick={() => linkProvider(microsoftProvider, 'microsoft.com')}>Connect</button>}
              </div>
            </div>
          </SettingsSection>

          {/* ── Export ── */}
          <SettingsSection title="Export your data" description="Download a complete copy of your Traktor data as a ZIP file containing JSON exports of your watch history, watchlist, ratings, and episode progress.">
            <button className="action-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Preparing export…' : '↓ Export my data'}
            </button>
          </SettingsSection>

          {/* ── Delete ── */}
          <SettingsSection title="Delete account" description="Permanently and instantly delete your account and all associated data. This cannot be undone." danger>
            {!showDeleteFlow ? (
              <button className="danger-btn" onClick={() => setShowDeleteFlow(true)}>Delete my account</button>
            ) : (
              <div className="delete-flow">
                {deleteStep === 1 && (
                  <div className="delete-warning">
                    <div className="delete-warning-icon">⚠️</div>
                    <h3>Are you absolutely sure?</h3>
                    <p>This will <strong>immediately and permanently</strong> delete:</p>
                    <ul className="delete-list">
                      <li>Your entire watch history</li>
                      <li>All your ratings</li>
                      <li>Your watchlist</li>
                      <li>Your episode progress for all shows</li>
                      <li>Your account and login credentials</li>
                    </ul>
                    <p className="delete-warning-strong">
                      There is <strong>no grace period</strong> and <strong>no way to recover</strong> your data after deletion.
                    </p>
                    <div className="delete-flow-buttons">
                      <button className="danger-btn" onClick={() => setDeleteStep(2)}>I understand, continue</button>
                      <button className="unlink-btn" onClick={() => { setShowDeleteFlow(false); setDeleteStep(1) }}>Cancel</button>
                    </div>
                  </div>
                )}
                {deleteStep === 2 && (
                  <div className="delete-confirm">
                    <h3>Type DELETE to confirm</h3>
                    <p className="settings-desc">Type <strong>DELETE</strong> in all caps to permanently delete your account.</p>
                    <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                      placeholder="Type DELETE here" className="delete-confirm-input" autoComplete="off" />
                    <div className="delete-flow-buttons">
                      <button className="danger-btn" onClick={handleDeleteAccount} disabled={confirmText !== 'DELETE' || deleting}>
                        {deleting ? 'Deleting…' : 'Permanently delete my account'}
                      </button>
                      <button className="unlink-btn" onClick={() => { setShowDeleteFlow(false); setDeleteStep(1); setConfirmText('') }}>Cancel</button>
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