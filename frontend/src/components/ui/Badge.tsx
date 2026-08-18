import type { ReactNode } from 'react'

// Ported from css/components.css .badge
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--r-sm)] bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-secondary ${className}`}
    >
      {children}
    </span>
  )
}
