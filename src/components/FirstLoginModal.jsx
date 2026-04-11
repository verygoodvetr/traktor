import { useState } from 'react'
import { createUserProfile, isUsernameTaken } from '../firestore'
import { Link } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase'

const BLOCKED_USERNAMES = [
  'me','user','username','admin','administrator','moderator','staff',
  'support','help','null','undefined','root','system','traktor','operator',
  'fuck','shit','ass','bitch','bastard','cunt','dick','pussy','cock',
  'nigger','nigga','faggot','retard',
]

function FirstLoginModal({ user, onComplete }) {
  const [username,    setUsername]    = useState('')
  const [displayName, setDisplayName] = useState(user.displayName || '')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [tosAccepted, setTosAccepted] = useState(false)
  const [step,        setStep]        = useState(1)

  function handleContinue() {
    if (!tosAccepted) {
      setError('You must accept the Terms of Service to use Traktor.')
      return
    }
    setStep(2)
    setError('')
  }

  async function handleFinish() {
    if (!tosAccepted) return
    setLoading(true)
    setError('')

    const trimmedUsername    = username.trim()
    const trimmedDisplayName = displayName.trim()

    /* Length */
    if (trimmedUsername.length < 2) {
      setError('Username must be at least 2 characters.')
      setLoading(false); return
    }
    if (trimmedUsername.length > 24) {
      setError('Username must be at most 24 characters.')
      setLoading(false); return
    }

    /* Characters */
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      setError('Username can only contain letters, numbers and underscores.')
      setLoading(false); return
    }

    /* Blocked list */
    if (BLOCKED_USERNAMES.includes(trimmedUsername.toLowerCase())) {
      setError('This username is not allowed.')
      setLoading(false); return
    }

    /* Availability */
    const taken = await isUsernameTaken(trimmedUsername)
    if (taken) {
      setError('This username is already taken.')
      setLoading(false); return
    }

    /* Update display name if changed */
    if (trimmedDisplayName && trimmedDisplayName !== user.displayName) {
      await updateProfile(auth.currentUser, { displayName: trimmedDisplayName })
    }

    await createUserProfile(
      { ...user, displayName: trimmedDisplayName || user.displayName },
      trimmedUsername,
      new Date().toISOString()
    )
    setLoading(false)
    onComplete()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h1 className="modal-brand">Traktor</h1>

        {/* ── Step 1 – TOS ── */}
        {step === 1 && (
          <>
            <h2>Welcome to Traktor!</h2>
            <p className="modal-desc">
              Before you start tracking, please read and accept our Terms of Service and Privacy Policy.
            </p>

            <div className="tos-box">
              <p>By using Traktor you agree that:</p>
              <ul className="tos-list">
                <li>You are at least 13 years old</li>
                <li>You will not abuse or misuse the service</li>
                <li>Your data is stored securely and only used to provide the service</li>
                <li>You can delete your account and all data at any time from Settings</li>
                <li>We do not sell your data to third parties</li>
                <li>The service is provided as-is with no guarantees</li>
              </ul>
              <p>
                For full details read our{' '}
                <Link to="/terms-of-service" target="_blank" className="tos-link">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy-policy" target="_blank" className="tos-link">Privacy Policy</Link>.
              </p>
            </div>

            <label className="tos-checkbox">
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={e => setTosAccepted(e.target.checked)}
              />
              I have read and accept the Terms of Service and Privacy Policy
            </label>

            {error && <p className="modal-error">{error}</p>}

            <button
              className="action-btn primary-action"
              onClick={handleContinue}
              disabled={!tosAccepted}
            >
              Continue
            </button>
          </>
        )}

        {/* ── Step 2 – Profile ── */}
        {step === 2 && (
          <>
            <h2>Set up your profile</h2>
            <p className="modal-desc">
              Pick a username so others can find you. Your display name is what shows on your profile.
            </p>

            <div className="modal-profile-preview">
              {user.photoURL && (
                <img
                  src={user.photoURL || DEFAULT_AVATAR}
                  className="modal-avatar"
                  alt=""
                  onError={e => { e.target.src = DEFAULT_AVATAR }}
                />
              )}
              <div>
                <p className="modal-preview-display">
                  {displayName || user.displayName || 'Your name'}
                </p>
                <p className="modal-preview-username">
                  @{username || 'username'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Username */}
              <div>
                <label className="modal-label">
                  Username <span style={{ color: '#e50914' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ opacity: 0.5, fontSize: 18 }}>@</span>
                  <input
                    type="text"
                    placeholder="username"
                    value={username}
                    onChange={e =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    className="modal-input"
                    maxLength={24}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                </div>
                <p className="modal-hint">
                  Letters, numbers and underscores only. 2–24 characters.
                </p>
              </div>

              {/* Display name */}
              <div>
                <label className="modal-label">
                  Display name{' '}
                  <span style={{ opacity: 0.4, fontSize: 12 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder={user.displayName || 'Your display name'}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="modal-input"
                  maxLength={40}
                />
                <p className="modal-hint">
                  Shown on your profile. Defaults to your Google / Microsoft name.
                </p>
              </div>
            </div>

            {error && <p className="modal-error">{error}</p>}

            <button
              className="action-btn primary-action"
              onClick={handleFinish}
              disabled={loading || username.length < 2}
            >
              {loading ? 'Setting up…' : 'Create profile'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default FirstLoginModal