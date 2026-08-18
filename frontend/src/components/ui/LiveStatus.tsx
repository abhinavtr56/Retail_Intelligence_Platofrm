import { useEffect, useRef, useState } from 'react'

// Ported from js/components/ui.js UI.mountLiveStatus + css/tpo.css .live-status/.live-dot.
// `reset()` is called after a refresh/filter change to restart the "just now" clock.
export function useLiveStatus() {
  const [elapsed, setElapsed] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    timer.current = window.setInterval(() => setElapsed((e) => e + 4), 4000)
    return () => window.clearInterval(timer.current)
  }, [])

  const reset = () => setElapsed(0)
  const label = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)} min ago`
  return { label, reset }
}

export function LiveStatus({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border border-border-subtle bg-surface-card px-3 py-1 text-xs text-ink-secondary">
      <span className="inline-block h-[7px] w-[7px] animate-[liveDot_1.4s_infinite] rounded-full bg-status-success" />
      <span>
        <strong className="font-bold text-status-success">Live</strong> · refreshed {label}
      </span>
    </span>
  )
}
