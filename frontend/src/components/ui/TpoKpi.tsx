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
}

export function TpoKpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-5 gap-4 max-[1400px]:grid-cols-3 max-[900px]:grid-cols-2">{children}</div>
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
}: {
  label: string
  value: string
  delta: string
  deltaSub: string
  trend: 'up' | 'down'
  icon: IconName
  tint: string
  delayMs?: number
}) {
  const t = TINTS[tint] ?? { bg: 'var(--brand-violet-50)', fg: 'var(--brand-violet)' }
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
        <div className="text-xs font-medium leading-tight text-ink-muted">{label}</div>
        <div className="mt-2.5 text-[21px] font-bold leading-[1.15] tracking-[-0.015em] text-ink-primary [font-variant-numeric:tabular-nums]">
          {value}
        </div>
        <div
          className={`mt-2.5 inline-flex items-center gap-1 text-[11.5px] text-ink-muted [&_svg]:h-3 [&_svg]:w-3 ${
            trend === 'up' ? '[&_svg]:text-status-success' : '[&_svg]:text-status-danger'
          }`}
        >
          <Icon name={trend === 'up' ? 'arrowUp' : 'arrowDown'} />
          <span>
            <strong className={`font-bold ${trend === 'up' ? 'text-status-success' : 'text-status-danger'}`}>
              {delta}
            </strong>{' '}
            {deltaSub}
          </span>
        </div>
      </div>
    </div>
  )
}
