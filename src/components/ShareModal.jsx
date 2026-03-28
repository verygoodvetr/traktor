import { useState } from 'react'
import { showToast } from './Toast'

function ShareModal({ title, url, onClose }) {
  const [showEmbed, setShowEmbed] = useState(false)
  const embedCode = `<iframe src="${url}?embed=1" width="400" height="200" frameborder="0" style="border-radius:8px;"></iframe>`

  function copy(text) {
    navigator.clipboard.writeText(text)
    showToast('Copied to clipboard!')
  }

  function shareNative() {
    if (navigator.share) {
      navigator.share({ title, url })
    } else {
      copy(url)
    }
  }

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <h3>Share "{title}"</h3>

        <div className="share-link-row">
          <input className="share-link-input" value={url} readOnly />
          <button className="action-btn" onClick={() => copy(url)}>Copy</button>
        </div>

        <div className="share-options">
          <button className="share-option-btn" onClick={shareNative}>
            📤 Share
          </button>
          <button
            className="share-option-btn"
            onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${title} on Traktor`)}&url=${encodeURIComponent(url)}`, '_blank')}
          >
            𝕏 Twitter/X
          </button>
          <button
            className="share-option-btn"
            onClick={() => window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank')}
          >
            Reddit
          </button>
          <button
            className="share-option-btn"
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, '_blank')}
          >
            WhatsApp
          </button>
          <button className="share-option-btn" onClick={() => setShowEmbed(p => !p)}>
            {'</>'} Embed
          </button>
        </div>

        {showEmbed && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Embed on your website:</p>
            <div className="share-embed" onClick={() => copy(embedCode)}>
              {embedCode}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text4)', marginTop: 4 }}>Click to copy</p>
          </div>
        )}

        <button className="share-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

export default ShareModal