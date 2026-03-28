import { useEffect, useState } from 'react'

let toastFn = null

export function showToast(message, type = 'success') {
  if (toastFn) toastFn(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    toastFn = (message, type) => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 3000)
    }
    return () => { toastFn = null }
  }, [])

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <span className="toast-icon">✓</span>}
          {toast.type === 'error' && <span className="toast-icon">✕</span>}
          {toast.type === 'info' && <span className="toast-icon">●</span>}
          {toast.message}
        </div>
      ))}
    </div>
  )
}