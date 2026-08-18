import { useEffect } from 'react'
import type { ReactNode } from 'react'

// Ported from css/components.css .modal-backdrop / .modal
export function Modal({
  open,
  onClose,
  children,
  maxWidthClassName = 'max-w-[480px]',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxWidthClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fade-in fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,22,41,0.4)] backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`fade-in-up w-[90%] rounded-[var(--r-xl)] bg-surface-card shadow-[var(--shadow-lg)] ${maxWidthClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
