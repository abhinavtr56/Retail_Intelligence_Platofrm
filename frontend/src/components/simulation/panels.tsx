import { useEffect, useState } from 'react'
import { Icon } from '../../icons'
import { Pill, Table, Th, Td } from '../ui'
import { Donut } from '../charts'
import type { Scenario } from '../../types/simulation'

const IMPACT_FMT: Record<string, (v: number) => string> = {
  revenue: (v) => `₹${Math.round(v)} Cr`,
  roi: (v) => v.toFixed(2),
  margin: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pts`,
  prob: (v) => `${Math.round(v)}%`,
  sellthrough: (v) => `${v.toFixed(2)} Cr`,
}
const IMPACT_ROWS: { label: string; key: keyof Scenario['impact'] }[] = [
  { label: 'Incremental Revenue (₹ Cr)', key: 'revenue' },
  { label: 'Promotion ROI', key: 'roi' },
  { label: 'Margin Impact (pts)', key: 'margin' },
  { label: 'Target Achievement Probability', key: 'prob' },
  { label: 'Sell-through Forecast (Units Cr)', key: 'sellthrough' },
]

// Ported from js/pages/simulation.js's `renderImpactTable`.
export function ImpactTable({ visible, baseline, compareMode }: { visible: Scenario[]; baseline: Scenario; compareMode: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th />
          {visible.map((s) => (
            <Th key={s.key} className={s.recommended ? '!bg-status-success-bg' : ''}>
              {s.recommended && (
                <div className="mb-1 flex items-center gap-1 text-[9px] font-extrabold text-status-success [&_svg]:h-2.5 [&_svg]:w-2.5">
                  <Icon name="sparkles" /> RECOMMENDED
                </div>
              )}
              <div className="normal-case leading-[1.3] text-ink-primary">
                {s.recommended ? <strong>{s.name}</strong> : s.name}
                <br />
                <span className="text-xs font-normal text-ink-muted">{s.sub}</span>
              </div>
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {IMPACT_ROWS.map((r) => (
          <tr key={r.key}>
            <Td>{r.label}</Td>
            {visible.map((s) => {
              const v = s.impact[r.key]
              const baseV = baseline.impact[r.key]
              let delta = ''
              if (compareMode && s.key !== 's1') {
                if (r.key === 'margin') delta = `${v - baseV >= 0 ? '+' : ''}${(v - baseV).toFixed(1)} pts`
                else if (r.key === 'prob') delta = `${v - baseV >= 0 ? '+' : ''}${Math.round(v - baseV)} pts`
                else delta = `${(v / baseV - 1) * 100 >= 0 ? '+' : ''}${((v / baseV - 1) * 100).toFixed(1)}%`
              }
              const isDown = delta.startsWith('-')
              return (
                <Td key={s.key} className={s.recommended ? 'bg-[rgba(16,185,129,0.06)] font-bold' : ''}>
                  <div>{IMPACT_FMT[r.key](v)}</div>
                  {delta && (
                    <div className={`mt-0.5 text-[11px] font-bold ${isDown ? 'text-status-danger' : 'text-status-success'}`}>
                      {isDown ? '↓' : '↑'} {delta.replace(/^-/, '')}
                    </div>
                  )}
                </Td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

// Ported from `renderRiskList` + css/tpo.css .sim-risk-*.
export function SimRiskList({ risk }: { risk: Scenario['risk'] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60)
    return () => window.clearTimeout(t)
  }, [risk])

  const toneColor = { success: 'var(--status-success)', warning: 'var(--status-warning)', danger: 'var(--status-danger)' }
  const toneBg = { success: 'var(--status-success-bg)', warning: 'var(--status-warning-bg)', danger: 'var(--status-danger-bg)' }

  return (
    <div className="flex flex-col">
      {risk.map((r) => (
        <div key={r.key} className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg [&_svg]:h-4 [&_svg]:w-4"
            style={{ background: toneBg[r.tone], color: toneColor[r.tone] }}
          >
            <Icon name={r.icon as Parameters<typeof Icon>[0]['name']} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold text-ink-primary">{r.label}</div>
            <div className="mb-1 text-[11px] text-ink-muted">{r.sub}</div>
            <div className="h-1 overflow-hidden rounded bg-surface-muted">
              <div
                className="h-full rounded transition-[width] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: mounted ? `${r.pct}%` : '0%', background: r.tone === 'danger' ? toneColor.danger : toneColor[r.tone] }}
              />
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-bold" style={{ color: toneColor[r.tone] }}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  )
}

// Ported from `renderConfidence`.
export function ConfidenceRow({ visible, activeKey }: { visible: Scenario[]; activeKey: string }) {
  return (
    <div className="flex items-center justify-around">
      {visible.map((s) => (
        <div key={s.key} className="flex flex-col items-center gap-1">
          <div className="relative">
            <Donut value={s.confidence} size={72} stroke={8} fill={s.dotColor} track="#E5E7EB" />
            <div className="absolute inset-0 grid place-items-center text-sm font-extrabold text-ink-primary">{s.confidence}%</div>
          </div>
          <div className="text-[11px] font-semibold text-ink-secondary">{s.name}</div>
          {s.key === activeKey && (
            <Pill tone="success" className="mt-1">
              Active
            </Pill>
          )}
        </div>
      ))}
    </div>
  )
}

// Ported from `renderReco`.
export function RecoCard({ rec }: { rec: Scenario }) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-violet [&_svg]:h-3 [&_svg]:w-3">
        <Icon name="sparkles" /> TIQ Recommends
      </div>
      <div className="mt-1.5 text-sm font-bold text-ink-primary">{rec.name}</div>
      <div className="mt-1 text-[12.5px] leading-[1.5] text-ink-secondary">
        Best balance of ROI uplift ({rec.impact.roi.toFixed(2)}), margin safety ({rec.impact.margin >= 0 ? '+' : ''}
        {rec.impact.margin.toFixed(1)} pts) and {Math.round(rec.impact.prob)}% target achievement probability.
      </div>
    </div>
  )
}

// Ported from `renderStats`.
export function StatsRow({ visible }: { visible: Scenario[] }) {
  return (
    <div className="p-[18px]">
      <div className="flex flex-col border-b border-border-subtle py-2.5">
        <div className="text-[11px] font-semibold text-ink-muted">Break-even Week</div>
        <div className="mt-1 flex gap-3.5">
          {visible.map((s) => (
            <span key={s.key} className="text-base font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">
              {s.breakeven}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col py-2.5">
        <div className="text-[11px] font-semibold text-ink-muted">Peak ROI</div>
        <div className="mt-1 flex gap-3.5">
          {visible.map((s) => (
            <span key={s.key} className="text-base font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">
              {s.peakROI}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Ported from `renderComparison`.
export function ComparisonTable({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Scenario</Th>
          <Th>
            Incremental Revenue
            <br />
            <span className="text-xs font-normal normal-case text-ink-muted">(₹ Cr)</span>
          </Th>
          <Th>Promotion ROI</Th>
          <Th>
            Margin Impact
            <br />
            <span className="text-xs font-normal normal-case text-ink-muted">(pts)</span>
          </Th>
          <Th>Trade Spend (₹ Cr)</Th>
          <Th>
            Cannibalization Impact
            <br />
            <span className="text-xs font-normal normal-case text-ink-muted">(₹ Cr)</span>
          </Th>
          <Th>Target Achievement Probability</Th>
        </tr>
      </thead>
      <tbody>
        {scenarios.map((s) => (
          <tr key={s.key} className={s.recommended ? 'bg-status-success-bg [&_td]:font-bold' : ''}>
            <Td>
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: s.dotColor }} />
              {s.name}
              {s.recommended && (
                <Pill tone="success" className="ml-2">
                  Recommended
                </Pill>
              )}
            </Td>
            <Td>{Math.round(s.impact.revenue)}</Td>
            <Td>{s.impact.roi.toFixed(2)}</Td>
            <Td>
              {s.impact.margin >= 0 ? '+' : ''}
              {s.impact.margin.toFixed(1)}
            </Td>
            <Td>{s.levers.spend.toFixed(1)}</Td>
            <Td>{s.impact.cannib.toFixed(1)}</Td>
            <Td>{Math.round(s.impact.prob)}%</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
