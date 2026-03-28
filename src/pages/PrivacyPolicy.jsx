import PageWrapper from '../components/PageWrapper'
import { Link } from 'react-router-dom'

function PrivacyPolicy() {
  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="legal-page">
          <Link to="/" className="back-btn">← Back</Link>
          <h1>Privacy Policy</h1>
          <p className="legal-date">Last updated: March 2026</p>

          <div className="legal-section">
            <h2>Who we are</h2>
            <p>Traktor is a personal movie and TV show tracking service. This privacy policy explains how we collect, use and protect your data.</p>
          </div>

          <div className="legal-section">
            <h2>What data we collect</h2>
            <p>When you sign in with Google or Microsoft, we receive your name, email address and profile picture from those services. We store this alongside the data you create while using Traktor:</p>
            <ul>
              <li>Your watch history, ratings and watchlist</li>
              <li>Your episode progress for TV shows</li>
              <li>Your username and profile settings</li>
              <li>The dates and times you marked things as watched</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>How we use your data</h2>
            <p>Your data is used solely to provide the Traktor service — showing you your watch history, recommendations and profile. We do not sell your data, share it with advertisers or use it for any purpose other than running the service.</p>
          </div>

          <div className="legal-section">
            <h2>Third party services</h2>
            <p>Traktor uses the following third party services:</p>
            <ul>
              <li><strong>Firebase (Google)</strong> — for authentication and data storage. Subject to Google's privacy policy.</li>
              <li><strong>TMDB</strong> — for movie and TV show data. No personal data is sent to TMDB.</li>
              <li><strong>Google / Microsoft OAuth</strong> — for sign in. Subject to their respective privacy policies.</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>Your rights (GDPR)</h2>
            <p>If you are in the European Economic Area you have the right to:</p>
            <ul>
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data at any time (via Settings → Delete account)</li>
              <li>Export your data (via Settings → Export my data)</li>
              <li>Object to processing of your data</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>Data retention</h2>
            <p>Your data is kept until you delete your account. When you delete your account, all your personal data and watch history is permanently and immediately deleted from our systems.</p>
          </div>

          <div className="legal-section">
            <h2>Security</h2>
            <p>Your data is stored securely using Firebase with strict access rules — only you can read or write your own data. We never store passwords as authentication is handled entirely by Google and Microsoft.</p>
          </div>

          <div className="legal-section">
            <h2>Contact</h2>
            <p>If you have any questions about this privacy policy or your data, please contact us at <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a>.</p>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default PrivacyPolicy