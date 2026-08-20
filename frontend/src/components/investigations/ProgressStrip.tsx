import { Link } from 'react-router-dom'
import { Card } from '../ui'
import { Icon } from '../../icons'

// Ported from js/pages/investigations.js's `.inv-progress-strip` block.
export function ProgressStrip({
  pct,
  sub,
  insights,
  sources,
}: {
  pct: number
  sub: string
  insights: number
  sources: number
}) {
  return (
    // B9 removed the "Confidence Score" tile that stood here. It printed a
    // percentage — 82%, "↑ +6 pp vs last run" — that nothing in this project
    // computes. The remaining tiles count accelerators and sources, which are
    // properties of the run itself.
    <Card className="fade-in mt-4 grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-6 p-[18px_22px] max-[1000px]:grid-cols-1 max-[1000px]:gap-4">
      <div>
        <div className="mb-1.5 text-[13px] font-bold text-ink-primary">Investigation Progress</div>
        <div className="flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded [background:var(--surface-muted)]">
            <div
              className="h-full rounded bg-[linear-gradient(90deg,var(--brand-violet),var(--brand-blue))] transition-[width] duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">{pct}%</span>
        </div>
        <div className="mt-1 text-[11px] text-ink-muted">{sub}</div>
      </div>

      <Stat label="Insights Identified" value={String(insights)} />
      <Stat label="Data Sources Connected" value={String(sources)} />
      <Link
        to="/intelligence"
        className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[var(--r-md)] border border-border-default bg-surface-card px-4 text-[13px] font-semibold text-ink-primary hover:bg-surface-hover hover:border-border-strong [&_svg]:h-4 [&_svg]:w-4"
      >
        <Icon name="file" /> View Insights Summary
      </Link>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-ink-muted">{label}</div>
      <div className="mt-0.5 text-[22px] font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">{value}</div>
    </div>
  )
}
