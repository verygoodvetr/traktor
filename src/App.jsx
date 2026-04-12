import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { AnimatePresence } from 'framer-motion'
import { auth, googleProvider, microsoftProvider } from './firebase'
import { ToastContainer, showToast } from './components/Toast'
import { getUserProfile, calculateStreak } from './firestore'
import FirstLoginModal from './components/FirstLoginModal'
import SearchOverlay from './components/SearchOverlay'
import Home, { subscribeToRefresh } from './pages/Home'
import Search from './pages/Search'
import Profile from './pages/Profile'
import MovieDetail from './pages/MovieDetail'
import Settings from './pages/Settings'
import SeasonDetail from './pages/SeasonDetail'
import EpisodeDetail from './pages/EpisodeDetail'
import PersonDetail from './pages/PersonDetail'
import PublicProfile from './pages/PublicProfile'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import Discovery from './pages/Discovery'
import Footer from './components/Footer'
import { DEFAULT_AVATAR } from './pages/Settings'

// ── Streak widget ─────────────────────────────────────────
function StreakWidget({ streak }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  return (
    <div className="streak-widget" ref={ref}>
      <button
        className={`streak-btn ${streak.activatedToday ? 'active' : 'inactive'}`}
        onClick={() => setOpen(p => !p)}
      >
        <span>🔥</span>
        <span>{streak.streak}</span>
      </button>
      {open && (
        <div className="streak-dropdown">
          <div className="streak-big">
            <span className="streak-big-num">{streak.streak}</span>
            <div>
              <p className="streak-big-label">day streak</p>
              {!streak.activatedToday && (
                <p style={{ fontSize: 11, color: '#ff6b00', marginTop: 2 }}>
                  Watch something today to keep it!
                </p>
              )}
            </div>
          </div>
          <div className="streak-stats">
            <div className="streak-stat-row">
              <span className="streak-stat-label">Longest streak</span>
              <span className="streak-stat-val">{streak.longest} days</span>
            </div>
            <div className="streak-stat-row">
              <span className="streak-stat-label">Today</span>
              <span className="streak-stat-val">
                {streak.activatedToday ? '✓ Active' : '✗ Not yet'}
              </span>
            </div>
          </div>
          <p className="streak-tip">
            Watch at least one episode or movie per day to maintain your streak.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Animated routes ───────────────────────────────────────
function AnimatedRoutes({ user, onSignIn, onStreakRefresh }) {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/"          element={<Home user={user} onSignIn={onSignIn} onStreakRefresh={onStreakRefresh} />} />
        <Route path="/search"    element={<Search />} />
        <Route path="/discovery" element={<Discovery user={user} />} />
        <Route path="/profile"   element={user ? <Profile user={user} /> : <Navigate to="/" />} />
        <Route path="/settings"  element={user ? <Settings user={user} /> : <Navigate to="/" />} />
        <Route path="/movie/:type/:id"                                    element={<MovieDetail user={user} />} />
        <Route path="/tv/:showId/season/:seasonNum"                       element={<SeasonDetail user={user} />} />
        <Route path="/tv/:showId/season/:seasonNum/episode/:episodeNum"   element={<EpisodeDetail user={user} />} />
        <Route path="/person/:personId"  element={<PersonDetail />} />
        <Route path="/user/:username"    element={<PublicProfile />} />
        <Route path="/privacy-policy"    element={<PrivacyPolicy />} />
        <Route path="/terms-of-service"  element={<TermsOfService />} />
      </Routes>
    </AnimatePresence>
  )
}

// ── Nav with search button ────────────────────────────────
function NavBar({ user, streak, showProviders, setShowProviders, onShowSearch, login, logout }) {
  return (
    <nav>
      <div className="nav-links">
        <Link to="/" className="nav-brand">Traktor</Link>
        {user && <Link to="/discovery">Discovery</Link>}
      </div>

      <div className="nav-auth">
        {/* Search button — always visible */}
        <button className="nav-search-btn" onClick={onShowSearch} title="Search (/)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <span>Search</span>
        </button>

        {user && streak && <StreakWidget streak={streak} />}

        {user ? (
          <div className="profile-dropdown">
            <div className="profile-trigger" onClick={() => setShowProviders(p => !p)}>
              <img
                className="nav-avatar"
                src={user.photoURL || DEFAULT_AVATAR}
                alt={user.displayName}
                onError={e => { e.target.src = DEFAULT_AVATAR }}
              />
              <span className="nav-username">{user.displayName}</span>
              <span className="dropdown-arrow">▾</span>
            </div>
            {showProviders && (
              <div className="login-options">
                <Link to="/profile"  onClick={() => setShowProviders(false)}>My Profile</Link>
                <Link to="/settings" onClick={() => setShowProviders(false)}>Settings</Link>
                <hr className="dropdown-divider" />
                <button onClick={logout}>Log out</button>
              </div>
            )}
          </div>
        ) : (
          <div className="login-dropdown">
            <button className="landing-btn-primary" style={{ padding: '8px 20px', fontSize: '14px' }}
              onClick={() => setShowProviders(p => !p)}>
              Sign in
            </button>
            {showProviders && (
              <div className="login-options">
                <button onClick={() => login(googleProvider)}>Sign in with Google</button>
                <button onClick={() => login(microsoftProvider)}>Sign in with Microsoft</button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

// ── App ───────────────────────────────────────────────────
function App() {
  const [user,           setUser]           = useState(undefined)
  const [showProviders,  setShowProviders]  = useState(false)
  const [showFirstLogin, setShowFirstLogin] = useState(false)
  const [streak,         setStreak]         = useState(null)
  const [showSearch,     setShowSearch]     = useState(false)

  const refreshStreak = useCallback(async (u) => {
    const target = u || auth.currentUser
    if (!target) return
    const streakData = await calculateStreak(target)
    setStreak(streakData)
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u)
      if (u) {
        const profile = await getUserProfile(u.uid)
        if (!profile || !profile.acceptedTos) setShowFirstLogin(true)
        refreshStreak(u)
      } else {
        setStreak(null)
      }
    })
    return unsub
  }, [refreshStreak])

  useEffect(() => {
    const unsub = subscribeToRefresh(() => refreshStreak())
    return unsub
  }, [refreshStreak])

  // Keyboard shortcut: / to open search
  useEffect(() => {
    function handler(e) {
      if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest('.profile-dropdown') && !e.target.closest('.login-dropdown'))
        setShowProviders(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  async function login(provider) {
    setShowProviders(false)
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      console.error(err)
      // Handle specific Firebase Auth errors
      const errorMessages = {
        'auth/user-disabled': 'This account has been disabled. If you believe this is a mistake, please email traktorapp@gmail.com',
        'auth/operation-not-allowed': 'Sign-in failed. Please try again.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
        'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method. Try signing in with the original method.',
        'auth/popup-closed-by-user': 'Sign-in was cancelled.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
      }
      const message = errorMessages[err.code] || 'Sign-in failed. Please try again.'
      showToast(message, 'error')
    }
  }

  function logout() {
    signOut(auth)
    setShowProviders(false)
    setStreak(null)
  }

  if (user === undefined) return null

  return (
    <BrowserRouter>
      <ToastContainer />

      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}

      {showFirstLogin && user && (
        <FirstLoginModal user={user} onComplete={() => setShowFirstLogin(false)} />
      )}

      <NavBar
        user={user}
        streak={streak}
        showProviders={showProviders}
        setShowProviders={setShowProviders}
        onShowSearch={() => setShowSearch(true)}
        login={login}
        logout={logout}
      />

      <main>
        <AnimatedRoutes user={user} onSignIn={() => setShowProviders(true)} onStreakRefresh={refreshStreak} />
      </main>

      <Footer />
    </BrowserRouter>
  )
}

export default App