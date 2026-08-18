import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../../icons'

// Ported from css/tpo.css .tpo-kpi-grid / .tpo-kpi* — the icon-leading KPI tile used
// across the 5 main pages (Command Center, Investigations, Intelligence, Simulation,
// Decision), distinct from the generic `.kpi` tile (see ui/Kpi.tsx) used elsewhere
// (e.g. the simulate-recommendation modal).
const TINTS: Record<string, { bg: string; fg: string }> = {
  lavender: { bg: '#ECE6FF', fg: '#7C5CFF' },
  sky: { bg: '#E1ECFF', fg: '#4F7CFF' },
  violet: { bg: '#ECE6FF', fg: '#6B47FF' },
  amber: { bg: '#FEF1D7', fg: '#F59E0B' },
  mint: { bg: '#D8F3E6', fg: '#10B981' },
  rose: { bg: '#FFE4E6', fg: '#F43F5E' },
}

// Six columns, not five: the Command Center carries six KPI cards (Cannibalization
// Rate joined the original five). Only the column count changed — the tile itself,
// its spacing and its breakpoints are untouched.
export function TpoKpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-6 gap-4 max-[1500px]:grid-cols-3 max-[900px]:grid-cols-2">{children}</div>
  )
}

export interface KpiInfo {
  name: string
  formula: string
  meaning: string
}

/** The ⓘ beside a KPI title: what it is, how it is computed, why it matters.
 *
 *  Opens on hover and on click (click so it is reachable by keyboard and on
 *  touch). Deliberately a popover rather than permanent card text — the card
 *  layout is unchanged and the formula only appears when asked for. */
function InfoDot({ info, unit }: { info: KpiInfo; unit?: string }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [coords, setCoords] = useState({ left: 0, top: 0, above: false })
  const ref = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const WIDTH = 268

  // Position against the viewport, not the card. A tooltip anchored inside the
  // tile gets clipped by the KPI grid at the row edges, and the right-hand
  // cards would push it off-screen entirely.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const height = panelRef.current?.offsetHeight ?? 200
    const above = r.bottom + height + 12 > window.innerHeight && r.top > height + 12
    setCoords({
      left: Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8)),
      top: above ? r.top - height - 8 : r.bottom + 8,
      above,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setPinned(false)
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false)
        setOpen(false)
        ref.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unitLabel =
    unit === 'currency' ? 'Currency (base INR; converted for display only)'
    : unit === 'percent' ? 'Percent (never currency-converted)'
    : unit === 'score' ? 'Index, 0-100 (never currency-converted)'
    : undefined

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`About ${info.name}`}
        aria-expanded={open}
        className="grid h-3.5 w-3.5 cursor-pointer place-items-center rounded-full text-ink-muted opacity-60 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-brand-violet [&_svg]:h-3.5 [&_svg]:w-3.5"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setPinned((p) => !p)
          setOpen(true)
        }}
      >
        <Icon name="info" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            className="dd-enter fixed z-[9999] rounded-[var(--r-md)] border border-border-default bg-surface-card p-3 text-left shadow-[var(--shadow-lg)]"
            style={{ left: coords.left, top: coords.top, width: WIDTH }}
          >
            <div className="text-[12.5px] font-bold text-ink-primary">{info.name}</div>

            <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">Measures</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-secondary">{info.meaning}</div>

            <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">Formula</div>
            <div className="mt-0.5 rounded-[var(--r-sm)] bg-ink-primary/[0.04] px-2 py-1.5 text-[11.5px] leading-snug text-ink-secondary [font-variant-numeric:tabular-nums]">
              {info.formula}
            </div>

            {unitLabel && (
              <>
                <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-muted">Unit</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-ink-secondary">{unitLabel}</div>
              </>
            )}
          </div>,
          document.body,
        )}
    </span>
  )
}

export function TpoKpiTile({
  label,
  value,
  delta,
  deltaSub,
  trend,
  icon,
  tint,
  delayMs = 0,
  info,
  unit,
  lowerIsBetter = false,
}: {
  label: string
  value: string
  delta: string
  deltaSub: string
  /** null when there is no comparison period — the arrow is then omitted
   *  entirely rather than defaulting to a direction the data cannot support. */
  trend: 'up' | 'down' | null
  icon: IconName
  tint: string
  delayMs?: number
  info?: KpiInfo
  /** currency | percent | score — drives the tooltip's Unit line. */
  unit?: string
  /** Trade Spend and Cannibalization improve as they fall, so a rise is not
   *  good news. Direction and desirability are separate facts. */
  lowerIsBetter?: boolean
}) {
  const t = TINTS[tint] ?? { bg: 'var(--brand-violet-50)', fg: 'var(--brand-violet)' }
  const isGood = trend === null ? null : (trend === 'up') !== lowerIsBetter
  const tone = isGood === null ? 'text-ink-muted' : isGood ? 'text-status-success' : 'text-status-danger'

  return (
    <div
      className="fade-in-up flex items-center gap-3 rounded-[var(--r-lg)] border border-border-subtle bg-surface-card p-[16px_18px] shadow-[var(--shadow-card-soft)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl [&_svg]:h-5 [&_svg]:w-5"
        style={{ background: t.bg, color: t.fg }}
      >
        <Icon name={icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-medium leading-tight text-ink-muted">
          <span className="truncate">{label}</span>
          {info && <InfoDot info={info} unit={unit} />}
        </div>
        <div className="mt-2.5 text-[21px] font-bold leading-[1.15] tracking-[-0.015em] text-ink-primary [font-variant-numeric:tabular-nums]">
          {value}
        </div>
        <div className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] text-ink-muted [&_svg]:h-3 [&_svg]:w-3">
          {trend && <Icon name={trend === 'up' ? 'arrowUp' : 'arrowDown'} className={tone} />}
          <span>
            <strong className={`font-bold ${tone}`}>{delta}</strong> {deltaSub}
          </span>
        </div>
      </div>
    </div>
  )
}
