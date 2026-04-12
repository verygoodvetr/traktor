import { useState } from 'react'

function WatchedDatePicker({ onSelect, onCancel }) {
  // Auto-fill with current date/time
  const now = new Date()
  const defaultDate = now.toISOString().slice(0, 10)
  const defaultTime = now.toTimeString().slice(0, 8)

  const [customDate, setCustomDate] = useState(defaultDate)
  const [customTime, setCustomTime] = useState(defaultTime)

  return (
    <div className="date-picker-box">
      <p className="date-picker-label">When did you watch it?</p>
      <div className="date-picker-options">
        <button className="action-btn" onClick={() => onSelect('now')}>
          Now
        </button>
        <button className="action-btn-secondary" onClick={() => onSelect('unknown')}>
          Unknown date
        </button>
      </div>
      <div className="date-picker-divider">or pick a date</div>
      <div className="date-picker-row">
        <input
          type="date"
          value={customDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => setCustomDate(e.target.value)}
        />
        <input
          type="time"
          value={customTime}
          step="1"
          onChange={e => setCustomTime(e.target.value)}
        />
      </div>
      <div className="date-picker-row">
        <button
          className="action-btn"
          disabled={!customDate}
          onClick={() => {
            const dt = customDate + (customTime ? `T${customTime}` : 'T00:00:00')
            onSelect(new Date(dt).toISOString())
          }}
        >
          Save with this date
        </button>
        <button className="action-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export default WatchedDatePicker