import PageWrapper from '../components/PageWrapper'
import { Link } from 'react-router-dom'

function PrivacyPolicy() {
  return (
    <PageWrapper>
      <div style={{ padding: '40px 32px 64px' }}>
        <div className="legal-page">
          <Link to="/" className="back-btn" style={{ marginBottom: 32, display: 'inline-flex' }}>← Back</Link>

          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontSize: 36, marginBottom: 8 }}>Privacy Policy</h1>
            <p className="legal-date">Last updated: April 2026</p>
            <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.7, marginTop: 12 }}>
              Your privacy matters to us. This policy explains in plain language exactly what data Traktor collects,
              why we collect it, how it's stored, and what rights you have over it.
            </p>
          </div>

          <div className="legal-section">
            <h2>1. Who we are</h2>
            <p>
              Traktor is a personal movie and TV show tracking service. We are not a company — Traktor is an
              independently run project. If you have any questions, you can reach us at{' '}
              <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a>.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. What data we collect and why</h2>
            <p>We collect only what we need to provide the service. Here's a breakdown:</p>

            <div className="legal-subsection">
              <h3>Account information</h3>
              <p>
                When you sign in with Google or Microsoft, we receive your name, email address, and profile
                picture from those providers. We store this to identify your account and display your profile.
                We never receive or store your password — authentication is handled entirely by Google and Microsoft.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>Watch data</h3>
              <p>
                When you mark something as watched, add to your watchlist, or rate a title, we store that
                information in your account. This includes the date and time you marked it as watched (if you
                choose to provide it), your star rating, and the TMDB ID of the movie or show.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>Episode progress</h3>
              <p>
                We store which individual episodes you have marked as watched, along with the date. This is
                used to power Continue Watching, streak tracking, and your profile stats.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>Profile settings</h3>
              <p>
                We store your chosen username, display name, privacy preferences, and visibility settings.
                Your display preferences (time/date format) are stored locally in your browser only and never
                sent to our servers.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>What we do NOT collect</h3>
              <ul>
                <li>We do not collect browsing behaviour or analytics</li>
                <li>We do not use advertising trackers or cookies for ads</li>
                <li>We do not collect your IP address beyond what Firebase requires for authentication</li>
                <li>We do not sell any data to any third party, ever</li>
              </ul>
            </div>
          </div>

          <div className="legal-section">
            <h2>3. Third-party services we use</h2>
            <p>Traktor is powered by a small number of third-party services:</p>

            <div className="legal-subsection">
              <h3>Firebase (Google)</h3>
              <p>
                We use Firebase for user authentication and Firestore for data storage. Your watch data,
                watchlist, ratings, and profile information are stored in Firestore. Firebase is subject to
                Google's privacy policy. Data is stored in Google's Cloud infrastructure.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>The Movie Database (TMDB)</h3>
              <p>
                Movie and TV show metadata — titles, posters, episode information, ratings — is sourced from
                TMDB's API. When you search or view a title, your request is sent to TMDB. No personal data
                about you is sent to TMDB.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>OMDb API (optional fallback)</h3>
              <p>
                For TV shows and episodes where TMDB has limited data, we may query the Open Movie Database
                (OMDb) as a fallback to fill in missing episode titles or descriptions. As with TMDB, no
                personal data is sent in these requests.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>Google / Microsoft OAuth</h3>
              <p>
                Sign-in is handled by Google and Microsoft's OAuth systems. We only receive the basic profile
                information they provide (name, email, profile picture) after you explicitly authorise access.
              </p>
            </div>

            <div className="legal-subsection">
              <h3>Resend (email)</h3>
              <p>
                If you request account deletion, we send a confirmation email via Resend. Your email address
                is used only to send that specific email and is not stored by Resend beyond what's required
                for delivery.
              </p>
            </div>
          </div>

          <div className="legal-section">
            <h2>4. How long we keep your data</h2>
            <p>
              We keep your data for as long as your account exists. When you delete your account — either
              immediately via Settings or after the 7-day grace period — all your personal data is permanently
              and irreversibly deleted from Firestore and Firebase Authentication. There are no backups that
              retain your data after deletion.
            </p>
          </div>

          <div className="legal-section">
            <h2>5. Your rights (GDPR &amp; general)</h2>
            <p>You have the following rights regarding your data:</p>
            <ul>
              <li><strong>Access</strong> — You can export all your data at any time from Settings → Export my data.</li>
              <li><strong>Correction</strong> — You can update your username and display name in Settings.</li>
              <li><strong>Deletion</strong> — You can delete your account and all data permanently from Settings → Delete account.</li>
              <li><strong>Portability</strong> — Your exported data is provided in JSON format, which is machine-readable and portable.</li>
              <li><strong>Restriction</strong> — You can set your profile to private to prevent others from seeing your data.</li>
              <li><strong>Objection</strong> — Contact us at <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a> for any data concerns.</li>
            </ul>
            <p>
              If you are in the European Economic Area, you have additional rights under the GDPR.
              You also have the right to lodge a complaint with your local data protection authority.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Data security</h2>
            <p>
              Your data is stored in Google Firebase with strict Firestore security rules — only you can read
              or write your own data. All data in transit is encrypted using HTTPS/TLS. We never store
              passwords. Authentication tokens are managed securely by Firebase.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Children's privacy</h2>
            <p>
              Traktor requires users to be at least 13 years old. We do not knowingly collect data from
              children under 13. If you believe a child under 13 has created an account, please contact us
              and we will delete it promptly.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Changes to this policy</h2>
            <p>
              If we make significant changes to this privacy policy, we will update the "last updated" date
              at the top of this page. Continued use of Traktor after any changes means you accept the
              updated policy.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Contact</h2>
            <p>
              For any privacy-related questions, data requests, or concerns, contact us at{' '}
              <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a>.
              We aim to respond within 7 days.
            </p>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default PrivacyPolicy