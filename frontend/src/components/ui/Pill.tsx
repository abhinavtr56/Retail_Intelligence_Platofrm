import type { ReactNode } from 'react'

// Ported from css/components.css .pill / .pill-* — colors are literal hexes in the
// original (not all reuse a token), kept verbatim for exact fidelity.
export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet'

const tones: Record<PillTone, string> = {
  success: 'bg-status-success-bg text-[#047857]',
  warning: 'bg-status-warning-bg text-[#B45309]',
  danger: 'bg-status-danger-bg text-[#B91C1C]',
  info: 'bg-status-info-bg text-[#1D4ED8]',
  neutral: 'bg-surface-muted text-ink-secondary',
  violet: 'bg-brand-violet-50 text-brand-violet',
}

export interface PillProps {
  tone?: PillTone
  dot?: boolean
  pulse?: boolean
  children: ReactNode
  className?: string
}

export function Pill({ tone = 'neutral', dot, pulse, children, className = '' }: PillProps) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-[var(--r-pill)] px-2.5 text-[11px] font-semibold tracking-[0.01em] ${tones[tone]} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? 'animate-[pulseDot_1.4s_ease-in-out_infinite]' : ''}`}
        />
      )}
      {children}
    </span>
  )
}
