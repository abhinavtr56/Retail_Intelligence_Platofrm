import { Icon } from '../../icons'
import { InfoPopover, Table, Th, Td } from '../ui'
import type { SimulationKpi, SimulationKpiKey, SimulationRunResponse } from '../../types/simulation'

/** The order the seven figures are read in: what was invested, what it moved,
 *  what it returned, what it cost elsewhere. */
const KPI_ORDER: SimulationKpiKey[] = [
  'trade_spend',
  'incremental_units',
  'incremental_sales',
  'roi_percent',
  'margin_percent',
  'cannibalization',
  'pei',
]

/** Projected Business Impact, Phase A: the scope's MEASURED performance.
 *
 *  Every row is a value the validated KPI engine produced — the same number
 *  the Command Center's card shows for the same selection. A KPI the selection
 *  cannot support renders its reason, never a zero.
 *
 *  There is one column because there is one result. A second column would have
 *  to differ from the first, and nothing in Phase A can make it differ
 *  honestly: the levers are not modelled yet, so two scenarios over the same
 *  scope are the same measurement twice.
 */
export function KpiTable({ kpis, targetRoiPct }: { kpis: Record<SimulationKpiKey, SimulationKpi>; targetRoiPct: number }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Metric</Th>
          <Th className="text-right">Measured</Th>
        </tr>
      </thead>
      <tbody>
        {KPI_ORDER.map((key) => {
          const kpi = kpis[key]
          if (!kpi) return null
          return (
            <tr key={key}>
              <Td>
                <div className="flex items-center gap-1.5">
                  <span>{kpi.label}</span>
                  <InfoPopover label={`About ${kpi.label}`} title={kpi.label}>
                    <div className="text-[12.5px] leading-[1.55] text-ink-secondary">
                      <div className="font-semibold text-ink-primary">Formula</div>
                      <div className="mt-0.5">{kpi.formula}</div>
                      {key === 'roi_percent' && (
                        <div className="mt-2 text-ink-muted">Target: {targetRoiPct.toFixed(0)}%</div>
                      )}
                    </div>
                  </InfoPopover>
                </div>
              </Td>
              <Td className="text-right">
                {kpi.available ? (
                  <span className="text-[15px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
                    {kpi.display_value}
                  </span>
                ) : (
                  <span
                    className="cursor-help text-sm text-ink-muted"
                    title={kpi.unavailable_reason ?? undefined}
                  >
                    —
                  </span>
                )}
                {!kpi.available && kpi.unavailable_reason && (
                  <div className="mt-0.5 max-w-[320px] text-[11px] leading-[1.45] text-ink-muted">
                    {kpi.unavailable_reason}
                  </div>
                )}
              </Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

/** What was actually measured — the scope the numbers above describe.
 *
 *  Replaces the promotion/period dropdowns, which were hardcoded strings that
 *  changed nothing when selected. Scope comes from the Command Center's filter
 *  selection, and this panel reports what the backend resolved it to.
 */
export function ScopeSummary({ scope }: { scope: SimulationRunResponse['scope'] }) {
  const applied = Object.entries(scope.filters_applied).filter(([key]) => key !== 'year' && key !== 'month')

  return (
    <div className="flex flex-col gap-2.5">
      <Row label="Period" value={scope.period} />
      <Row label="Rows in scope" value={scope.row_count.toLocaleString()} />
      <Row label="Promoted rows" value={scope.promoted_row_count.toLocaleString()} />
      <Row label="Weeks with promotions" value={String(scope.promoted_weeks)} />
      <div className="border-t border-border-subtle pt-2.5">
        <div className="text-[11px] font-semibold text-ink-muted">Filters applied</div>
        {applied.length === 0 ? (
          <div className="mt-1 text-[12px] text-ink-secondary">None — the full dataset for this period.</div>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {applied.map(([key, value]) => (
              <span
                key={key}
                className="rounded-[var(--r-pill)] bg-surface-muted px-2 py-1 text-[11px] font-medium text-ink-secondary"
              >
                {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-semibold text-ink-muted">{label}</span>
      <span className="text-[13px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">{value}</span>
    </div>
  )
}

/** The empty-scope case: a real state, not a permanent spinner and not a
 *  screen full of zeroes. */
export function NoDataPanel() {
  return (
    <div className="grid min-h-[220px] place-items-center px-6 py-10 text-center">
      <div>
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-muted [&_svg]:h-5 [&_svg]:w-5">
          <Icon name="info" />
        </div>
        <div className="text-sm font-bold text-ink-primary">No rows in this scope</div>
        <div className="mt-1 text-[12.5px] text-ink-secondary">
          The current filter selection matches no sales rows, so there is nothing to measure. Widen the
          selection in the Command Center.
        </div>
      </div>
    </div>
  )
}
