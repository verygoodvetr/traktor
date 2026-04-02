import { Link } from 'react-router-dom'

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand-section">
            <span className="footer-brand">Traktor</span>
            <p className="footer-tagline">Track what you watch.</p>
          </div>
          <div className="footer-nav">
            <div className="footer-nav-group">
              <p className="footer-nav-title">Legal</p>
              <Link to="/terms-of-service">Terms of Service</Link>
              <Link to="/privacy-policy">Privacy Policy</Link>
            </div>
            <div className="footer-nav-group">
              <p className="footer-nav-title">Contact</p>
              <a href="mailto:traktorapp@gmail.com">traktorapp@gmail.com</a>
            </div>
            <div className="footer-nav-group">
              <p className="footer-nav-title">Data sources</p>
              <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
                TMDB
              </a>
              <a href="https://www.omdbapi.com" target="_blank" rel="noopener noreferrer">
                OMDb
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copy">© {new Date().getFullYear()} Traktor. All rights reserved.</span>
          <span className="footer-copy">
            Movie and TV data provided by{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)' }}>
              The Movie Database (TMDB)
            </a>
            {' '}and{' '}
            <a href="https://www.omdbapi.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text3)' }}>
              OMDb
            </a>
            . Not affiliated with or endorsed by these services.
          </span>
        </div>
      </div>
    </footer>
  )
}

export default Footer