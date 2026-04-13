// src/pages/TraktCallback.jsx
// This page handles the redirect back from Trakt after OAuth authorization.
// Add this route to App.jsx:
//   import TraktCallback from './pages/TraktCallback'
//   <Route path="/trakt-callback" element={<TraktCallback user={user} />} />

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFunctions, httpsCallable } from 'firebase/functions'
import PageWrapper from '../components/PageWrapper'

function TraktCallback({ user }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('connecting') // 'connecting' | 'importing' | 'done' | 'error'
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code  = params.get('code')
    const state = params.get('state')

    // Basic CSRF check — state must match what we stored before redirecting
    const savedState = sessionStorage.getItem('trakt_oauth_state')
    sessionStorage.removeItem('trakt_oauth_state')

    if (!code) {
      setError('No authorization code returned from Trakt. Did you cancel?')
      setStatus('error')
      return
    }

    if (state !== savedState) {
      setError('OAuth state mismatch — possible CSRF. Please try again.')
      setStatus('error')
      return
    }

    if (!user) {
      // Wait for auth to load — shouldn't normally happen
      setError('You must be signed in to Traktor to import from Trakt.')
      setStatus('error')
      return
    }

    async function doImport() {
      setStatus('importing')
      try {
        const functions   = getFunctions()
        const traktImport = httpsCallable(functions, 'traktImport')
        const result      = await traktImport({ code })
        setStats(result.data.stats)
        setStatus('done')
      } catch (err) {
        console.error(err)
        setError(err.message || 'Import failed — please try again.')
        setStatus('error')
      }
    }

    doImport()
  }, [user])

  function goToSettings() {
    navigate('/settings')
  }

  return (
    <PageWrapper>
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-xl)',
          padding: '48px 40px',
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* Trakt logo-ish */}
          <div style={{ fontSize: 48 }}>📺</div>

          {status === 'connecting' && (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Connecting to Trakt…</h2>
              <p style={{ color: 'var(--text3)', fontSize: 14 }}>Authorizing your account.</p>
              <Spinner />
            </>
          )}

          {status === 'importing' && (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Importing your data…</h2>
              <p style={{ color: 'var(--text3)', fontSize: 14 }}>
                This may take a moment — fetching your watch history, episode progress, ratings and watchlist.
              </p>
              <Spinner />
            </>
          )}

          {status === 'done' && (
            <>
              <div style={{ fontSize: 52 }}>✅</div>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Import complete!</h2>
              {stats && (
                <div style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  textAlign: 'left',
                }}>
                  <StatRow label="Movies imported"    value={stats.movies}    />
                  <StatRow label="Shows imported"     value={stats.shows}     />
                  <StatRow label="Watchlist imported" value={stats.watchlist} />
                  <StatRow label="Already existed"    value={stats.skipped}   dim />
                </div>
              )}
              <p style={{ color: 'var(--text3)', fontSize: 13, lineHeight: 1.6 }}>
                Episode progress and ratings have also been imported where available.
                Poster images will load as you browse.
              </p>
              <button className="action-btn active" onClick={goToSettings} style={{ marginTop: 4 }}>
                Back to Settings
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ fontSize: 52 }}>❌</div>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Something went wrong</h2>
              <p style={{ color: 'var(--red)', fontSize: 14, lineHeight: 1.6 }}>{error}</p>
              <button className="action-btn" onClick={goToSettings}>
                Back to Settings
              </button>
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}

function StatRow({ label, value, dim }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: dim ? 'var(--text4)' : 'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: dim ? 'var(--text4)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <div style={{
        width: 36, height: 36,
        border: '3px solid var(--bg4)',
        borderTop: '3px solid var(--red)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default TraktCallback