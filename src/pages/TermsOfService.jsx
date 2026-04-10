import PageWrapper from '../components/PageWrapper'
import { Link } from 'react-router-dom'

function TermsOfService() {
  return (
    <PageWrapper>
      <div style={{ padding: '40px 32px 64px' }}>
        <div className="legal-page">
          <Link to="/" className="back-btn" style={{ marginBottom: 32, display: 'inline-flex' }}>← Back</Link>

          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontSize: 36, marginBottom: 8 }}>Terms of Service</h1>
            <p className="legal-date">Last updated: April 2026</p>
            <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.7, marginTop: 12 }}>
              Please read these terms carefully before using Traktor. By creating an account or using the
              service, you agree to be bound by these terms.
            </p>
          </div>

          <div className="legal-section">
            <h2>1. Acceptance of terms</h2>
            <p>
              By accessing or using Traktor, you confirm that you have read, understood, and agree to these
              Terms of Service and our <Link to="/privacy-policy" className="tos-link">Privacy Policy</Link>.
              If you do not agree, you must not use Traktor.
            </p>
          </div>

          <div className="legal-section">
            <h2>2. Eligibility</h2>
            <p>
              You must be at least 13 years old to use Traktor. By creating an account, you confirm that you
              meet this requirement. If you are under 18, you should have parental or guardian consent before
              using the service.
            </p>
          </div>

          <div className="legal-section">
            <h2>3. Your account</h2>
            <p>
              You are responsible for maintaining the security of your account. You must not share your
              account credentials with others or allow others to access your account. You are responsible for
              all activity that occurs under your account.
            </p>
            <p>
              You agree to notify us immediately at{' '}
              <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a> if you
              suspect any unauthorised use of your account.
            </p>
            <p>
              We reserve the right to suspend or terminate accounts that violate these terms, without prior notice.
            </p>
          </div>

          <div className="legal-section">
            <h2>4. Acceptable use</h2>
            <p>You agree to use Traktor only for lawful purposes. You must not:</p>
            <ul>
              <li>Attempt to gain unauthorised access to other users' accounts or data</li>
              <li>Use automated scripts, bots, or scraping tools to access the service</li>
              <li>Abuse, disrupt, or degrade the performance of the service for other users</li>
              <li>Impersonate another person or create a username that is misleading or deceptive</li>
              <li>Use the service to harass, threaten, or harm other users</li>
              <li>Attempt to reverse-engineer, decompile, or extract the source code of Traktor</li>
              <li>Use the service in any way that violates applicable laws or regulations</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>5. Content and data</h2>
            <p>
              Movie and TV show data displayed on Traktor is sourced from The Movie Database (TMDB), OMDb,
              and potentially other third-party APIs. This content is owned by its respective providers and
              is subject to their terms. Traktor is a tracking service only — we do not host, stream, or
              provide access to any media content.
            </p>
            <p>
              The data you create on Traktor (your watch history, ratings, watchlist, etc.) belongs to you.
              You can export it at any time from Settings. See our{' '}
              <Link to="/privacy-policy" className="tos-link">Privacy Policy</Link> for full details on
              how your data is stored and handled.
            </p>
          </div>

          <div className="legal-section">
            <h2>6. Third-party services</h2>
            <p>
              Traktor integrates with the following third-party services to provide its features:
            </p>
            <ul>
              <li><strong>TMDB</strong> — movie and TV show metadata, posters, episode information</li>
              <li><strong>OMDb</strong> — supplemental episode data for shows with limited TMDB coverage</li>
              <li><strong>Firebase (Google)</strong> — authentication and data storage</li>
            </ul>
            <p>
              Your use of Traktor is subject to the terms of these third-party services where applicable.
              We are not responsible for the availability, accuracy, or content of third-party services.
            </p>
          </div>

          <div className="legal-section">
            <h2>7. Intellectual property</h2>
            <p>
              The Traktor name, logo, and original application code are the property of the Traktor project.
              Movie posters, episode stills, show artwork, and all associated media data displayed in Traktor
              belong to their respective copyright holders and are used under TMDB's and OMDb's API terms.
            </p>
          </div>

          <div className="legal-section">
            <h2>8. Service availability</h2>
            <p>
              Traktor is provided as-is, without any guarantees of uptime, availability, or feature
              completeness. We may at any time and without notice modify, suspend, or discontinue any part
              of the service. We are not liable for any loss resulting from interruptions to the service.
            </p>
          </div>

          <div className="legal-section">
            <h2>9. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Traktor and its operators are not liable for any
              indirect, incidental, special, consequential, or punitive damages arising from your use of
              the service, including but not limited to loss of data, loss of profits, or service
              interruptions.
            </p>
            <p>
              Our total liability to you for any claim arising from your use of Traktor shall not exceed the
              amount you have paid to use the service in the past 12 months. As Traktor is currently free,
              this amount is zero.
            </p>
          </div>

          <div className="legal-section">
            <h2>10. Account deletion and data</h2>
            <p>
              You can delete your account at any time from Settings → Delete account. Upon deletion, all
              your personal data and watch history will be permanently removed from our systems. This action
              is irreversible.
            </p>
          </div>

          <div className="legal-section">
            <h2>11. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. We will update the "last updated" date at the top
              of this page when we do. Continued use of Traktor after changes are made constitutes acceptance
              of the revised terms. If you disagree with any changes, you should delete your account.
            </p>
          </div>

          <div className="legal-section">
            <h2>12. Governing law</h2>
            <p>
              These terms are governed by and construed in accordance with applicable law. Any disputes
              arising from these terms shall be subject to the exclusive jurisdiction of the relevant courts.
            </p>
          </div>

          <div className="legal-section">
            <h2>13. Contact</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at{' '}
              <a href="mailto:traktorapp@gmail.com" className="tos-link">traktorapp@gmail.com</a>.
            </p>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default TermsOfService