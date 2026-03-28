import PageWrapper from '../components/PageWrapper'
import { Link } from 'react-router-dom'

function TermsOfService() {
  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="legal-page">
          <Link to="/" className="back-btn">← Back</Link>
          <h1>Terms of Service</h1>
          <p className="legal-date">Last updated: March 2026</p>

          <div className="legal-section">
            <h2>Acceptance of terms</h2>
            <p>By using Traktor you agree to these terms. If you do not agree, please do not use the service.</p>
          </div>

          <div className="legal-section">
            <h2>Eligibility</h2>
            <p>You must be at least 13 years old to use Traktor. By using the service you confirm that you meet this requirement.</p>
          </div>

          <div className="legal-section">
            <h2>Your account</h2>
            <p>You are responsible for maintaining the security of your account. You must not share your account with others or use another person's account. We reserve the right to terminate accounts that violate these terms.</p>
          </div>

          <div className="legal-section">
            <h2>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the service for any unlawful purpose</li>
              <li>Attempt to gain unauthorised access to other users' data</li>
              <li>Abuse or disrupt the service in any way</li>
              <li>Use automated tools to scrape or abuse the service</li>
              <li>Impersonate other users or create misleading usernames</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>Content</h2>
            <p>Movie and TV show data is provided by TMDB and is subject to their terms. Traktor does not host or provide any media content — it is a tracking service only.</p>
          </div>

          <div className="legal-section">
            <h2>Service availability</h2>
            <p>Traktor is provided as-is with no guarantees of uptime or availability. We may modify, suspend or discontinue the service at any time without notice.</p>
          </div>

          <div className="legal-section">
            <h2>Data and privacy</h2>
            <p>Your use of Traktor is also governed by our <Link to="/privacy" className="tos-link">Privacy Policy</Link>, which is incorporated into these terms.</p>
          </div>

          <div className="legal-section">
            <h2>Limitation of liability</h2>
            <p>Traktor is not liable for any loss of data, interruption of service or any other damages arising from your use of the service.</p>
          </div>

          <div className="legal-section">
            <h2>Changes to terms</h2>
            <p>We may update these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.</p>
          </div>

          <div className="legal-section">
            <h2>Contact</h2>
            <p>If you have any questions about these terms, please contact us at <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a>.</p>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default TermsOfService