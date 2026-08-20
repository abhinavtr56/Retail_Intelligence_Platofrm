import { useState } from 'react'
import { Icon } from '../../icons'
import { InfoPopover } from '../ui'
import { useChartWidth } from '../charts/useChartWidth'
import type { WeeklyMetricKey, WeeklyResponse, WeeklyWeek } from '../../types/weekly'

/** Weekly impact — B5.
 *
 *  Shows WHEN a simulated scenario's impact lands, by rendering the backend's
 *  decomposition of the same counterfactual the aggregate used.
 *
 *  A DECOMPOSITION, NOT A FORECAST. Every week drawn is a week the data has
 *  rows for. Nothing here projects, fits or estimates, and nothing here
 *  computes a KPI — no uplift, no ROI, no promotion cost, no baseline logic
 *  lives in React.
 *
 *  THE BAND IS DRAWN AS A BAND. Low and high are two boundary lines with the
 *  space between them shaded. There is deliberately NO middle line: the
 *  approved uplift range has no expected value, and drawing one would invent a
 *  precision the approved rules do not grant.
 *
 *  NO GREEN AND RED. The chart is descriptive. Colouring a movement encodes
 *  better/worse, and the project's metric preference is explicitly undefined
 *  outside the recommendation policy.
 */
export function WeeklyImpactPanel({
  weekly,
  isRecommended,
}: {
  weekly: WeeklyResponse
  /** Set only when this scenario is the one the recommendation engine chose.
   *  The label is repeated, never recomputed or reinterpreted. */
  isRecommended: boolean
}) {
  const [metricKey, setMetricKey] = useState<WeeklyMetricKey>('incremental_sales')
  const metric = weekly.metrics.find((m) => m.key === metricKey) ?? weekly.metrics[0]
  const reconciliation = weekly.reconciliation.additive[metric.key]
  const nonAdditive = weekly.reconciliation.non_additive[metric.key]

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold">Weekly Impact</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-muted">
            <span>
              {weekly.treatment} · {weekly.discount_pct}% · {weekly.range_label}{' '}
              {(weekly.uplift.low * 100).toFixed(0)}–{(weekly.uplift.high * 100).toFixed(0)}%
            </span>
            {isRecommended && (
              <span className="rounded-[4px] bg-status-success-bg px-1.5 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-status-success">
                Recommended under the current decision policy
              </span>
            )}
          </div>
        </div>
        <MethodPopover weekly={weekly} />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border-subtle px-5 py-2.5">
        {weekly.metrics.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetricKey(m.key)}
            className={`rounded-[var(--r-pill)] px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
              m.key === metric.key
                ? 'bg-surface-muted text-ink-primary'
                : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-4">
        <RangeChart weeks={weekly.weeks} metricKey={metric.key} label={metric.label} />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm bg-brand-violet/20" /> Approved uplift range
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded-sm bg-brand-violet" /> Low and high boundaries
          </span>
          <span>No middle line — the range has no expected value.</span>
        </div>

        {metric.additive && reconciliation ? (
          <Reconciled metric={metric.label} entry={reconciliation} />
        ) : (
          nonAdditive && (
            <div className="mt-3 rounded-[var(--r-md)] border border-border-subtle bg-surface-muted p-3 text-[11.5px] leading-[1.5] text-ink-secondary">
              <span className="font-semibold text-ink-primary">{metric.label} is not additive.</span>{' '}
              {nonAdditive.reason} For the whole scope it is{' '}
              <span className="font-bold [font-variant-numeric:tabular-nums]">
                {nonAdditive.aggregate_display_low} – {nonAdditive.aggregate_display_high}
              </span>
              .
            </div>
          )
        )}

        <WeeklyTable weeks={weekly.weeks} metricKey={metric.key} label={metric.label} />

        {weekly.scope.weeks_without_promotion > 0 && (
          <div className="mt-3 text-[11px] leading-[1.45] text-ink-muted">
            {weekly.scope.weeks_without_promotion} of {weekly.scope.weeks_in_scope} weeks in scope
            carried no promotion and are not shown. {weekly.scope.omitted_note}
          </div>
        )}
      </div>
    </div>
  )
}

/** Does the decomposition add up? Reported, not assumed. */
function Reconciled({
  metric,
  entry,
}: {
  metric: string
  entry: NonNullable<WeeklyResponse['reconciliation']['additive'][string]>
}) {
  const ok = entry.low.within_tolerance && entry.high.within_tolerance
  return (
    <div className="mt-3 flex items-start gap-1.5 rounded-[var(--r-md)] border border-border-subtle bg-surface-muted p-3 text-[11.5px] leading-[1.5] [&_svg]:mt-px [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0">
      <Icon name={ok ? 'checkCircle' : 'warning'} />
      <span className="text-ink-secondary">
        {ok ? (
          <>
            The {entry.week_count} weekly {metric} values add back up to the scenario total, within the
            KPI engine&apos;s own rounding.
          </>
        ) : (
          <>
            The weekly {metric} values do not add up to the scenario total (difference{' '}
            {entry.low.difference?.toFixed(2)}). This is reported rather than hidden.
          </>
        )}
      </span>
    </div>
  )
}

/** Low and high as two boundary lines with a shaded band between them.
 *
 *  Hand-rolled SVG, matching the project's other charts. The y-axis starts at
 *  zero so week-to-week magnitude reads honestly rather than being exaggerated
 *  by a clipped baseline.
 */
function RangeChart({
  weeks,
  metricKey,
  label,
}: {
  weeks: WeeklyWeek[]
  metricKey: WeeklyMetricKey
  label: string
}) {
  const { ref, width } = useChartWidth(720)
  const height = 220
  const padL = 8
  const padR = 8
  const padT = 12
  const padB = 26

  const lows = weeks.map((w) => w.low[metricKey]?.value)
  const highs = weeks.map((w) => w.high[metricKey]?.value)
  const usable = weeks.length > 0 && lows.some((v) => v !== null) && highs.some((v) => v !== null)

  if (!usable) {
    return (
      <div ref={ref} className="grid h-[220px] place-items-center text-[12px] text-ink-muted">
        {label} is not available for these weeks.
      </div>
    )
  }

  const values = [...lows, ...highs].filter((v): v is number => v !== null)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const innerW = Math.max(1, width - padL - padR)
  const innerH = Math.max(1, height - padT - padB)
  const step = weeks.length > 1 ? innerW / (weeks.length - 1) : 0
  const x = (i: number) => padL + (weeks.length > 1 ? i * step : innerW / 2)
  const y = (v: number) => padT + innerH * (1 - (v - min) / span)

  const path = (series: (number | null)[]) =>
    series
      .map((v, i) => (v === null ? '' : `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`))
      .filter(Boolean)
      .join(' ')

  const band =
    `${path(lows)} ` +
    highs
      .map((v, i) => (v === null ? '' : `L ${x(highs.length - 1 - i)} ${y(highs[highs.length - 1 - i]!)}`))
      .filter(Boolean)
      .join(' ') +
    ' Z'

  const zeroY = min < 0 && max > 0 ? y(0) : null

  return (
    <div ref={ref}>
      <div className="mb-1.5 text-xs text-ink-muted">{label} by business week</div>
      <svg width={width} height={height} role="img" aria-label={`${label} range by week`}>
        {zeroY !== null && (
          <line x1={padL} x2={width - padR} y1={zeroY} y2={zeroY} stroke="var(--border-default)" strokeWidth={1} />
        )}
        {/* The band. Shaded, with no line through the middle. */}
        <path d={band} fill="var(--brand-violet)" opacity={0.16} />
        <path d={path(lows)} fill="none" stroke="var(--brand-violet)" strokeWidth={1.5} />
        <path d={path(highs)} fill="none" stroke="var(--brand-violet)" strokeWidth={1.5} />
        {weeks.map((week, i) => {
          const low = week.low[metricKey]?.value
          const high = week.high[metricKey]?.value
          if (low === null || low === undefined || high === null || high === undefined) return null
          return (
            <g key={week.week_id}>
              <circle cx={x(i)} cy={y(low)} r={2} fill="var(--brand-violet)" />
              <circle cx={x(i)} cy={y(high)} r={2} fill="var(--brand-violet)" />
              <title>
                {week.week_label}: {week.low[metricKey].display_value} –{' '}
                {week.high[metricKey].display_value}
              </title>
            </g>
          )
        })}
        {weeks.map((week, i) =>
          i % Math.ceil(weeks.length / 12) === 0 ? (
            <text
              key={`label-${week.week_id}`}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[var(--ink-muted)] text-[9px]"
            >
              {week.week_id.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

/** The same numbers as text, for reading exact values and for accessibility. */
function WeeklyTable({
  weeks,
  metricKey,
  label,
}: {
  weeks: WeeklyWeek[]
  metricKey: WeeklyMetricKey
  label: string
}) {
  return (
    <div className="mt-3 max-h-[240px] overflow-y-auto rounded-[var(--r-md)] border border-border-subtle">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-surface-muted">
          <tr>
            <th className="p-[8px_12px] text-left text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
              Week
            </th>
            <th className="p-[8px_12px] text-right text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
              {label} · low
            </th>
            <th className="p-[8px_12px] text-right text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
              high
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const low = week.low[metricKey]
            const high = week.high[metricKey]
            return (
              <tr key={week.week_id} className="border-t border-border-subtle">
                <td className="p-[7px_12px] text-[11.5px] text-ink-secondary">
                  {week.week_label}
                  {week.week_start && (
                    <span className="ml-1.5 text-[10px] text-ink-muted">from {week.week_start}</span>
                  )}
                </td>
                <td className="p-[7px_12px] text-right text-[11.5px] text-ink-primary [font-variant-numeric:tabular-nums]">
                  {low?.available ? low.display_value : <Absent reason={low?.unavailable_reason} />}
                </td>
                <td className="p-[7px_12px] text-right text-[11.5px] text-ink-primary [font-variant-numeric:tabular-nums]">
                  {high?.available ? high.display_value : <Absent reason={high?.unavailable_reason} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Absent({ reason }: { reason?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      —
      {reason && (
        <InfoPopover label="Why this week has no value" title="Not available" width={264}>
          <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{reason}</div>
        </InfoPopover>
      )}
    </span>
  )
}

function MethodPopover({ weekly }: { weekly: WeeklyResponse }) {
  const p = weekly.provenance
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
      <Icon name="info" className="h-3 w-3" />
      How this is built
      <InfoPopover label="How the weekly view is built" title="Weekly decomposition" width={320}>
        <div className="mt-1 space-y-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
          <div>{p.method}</div>
          <div>
            <span className="font-semibold text-ink-primary">Weeks:</span> {p.week_source}
          </div>
          <div>
            <span className="font-semibold text-ink-primary">Treatment:</span> {p.treatment} at{' '}
            {p.discount_pct}%, approved uplift {(p.uplift_low * 100).toFixed(0)}–
            {(p.uplift_high * 100).toFixed(0)}%
          </div>
          <div>
            <span className="font-semibold text-ink-primary">KPI engine:</span> {p.kpi_engine}
          </div>
          <div className="text-ink-muted">{weekly.reconciliation.note}</div>
        </div>
      </InfoPopover>
    </span>
  )
}
