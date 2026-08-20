import { Icon } from '../../icons'
import { InfoPopover, Table, Th, Td } from '../ui'
import type { SimulateResponse, SimulationKpiKey } from '../../types/simulation'

const KPI_ORDER: SimulationKpiKey[] = [
  'trade_spend',
  'incremental_units',
  'incremental_sales',
  'roi_percent',
  'margin_percent',
  'cannibalization',
  'pei',
]

/** A simulated scenario's result — the APPROVED UPLIFT RANGE.
 *
 *  Two columns, low and high, because the approved rule for a treatment is a
 *  band and not a point. NOTHING HERE COLLAPSES THEM INTO A MIDPOINT: PR002 is
 *  approved for 25–35% uplift, not 30%, and printing a single ROI would
 *  manufacture a precision the rule does not grant.
 *
 *  The range is NOT a confidence or prediction interval. The bands are the
 *  project's approved promotion rules — generator design parameters verified
 *  against the dataset — not uncertainty estimated from variation. The header
 *  says so and the provenance popover repeats it.
 */
export function ScenarioResultPanel({ simulation }: { simulation: SimulateResponse }) {
  const { low, high } = simulation.result

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-[4px] bg-status-success-bg px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-status-success">
            Simulated
          </span>
          <span className="text-[12px] text-ink-secondary">
            {simulation.treatment} · {simulation.discount_pct}% discount
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11.5px] text-ink-muted">
          <span>
            {simulation.range_label}: {(simulation.uplift.low * 100).toFixed(0)}–
            {(simulation.uplift.high * 100).toFixed(0)}% uplift
          </span>
          <ProvenancePopover simulation={simulation} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Metric</Th>
              <Th className="text-right">
                Low
                <div className="text-[10px] font-normal normal-case text-ink-muted">
                  {(low.uplift * 100).toFixed(0)}% uplift
                </div>
              </Th>
              <Th className="text-right">
                High
                <div className="text-[10px] font-normal normal-case text-ink-muted">
                  {(high.uplift * 100).toFixed(0)}% uplift
                </div>
              </Th>
            </tr>
          </thead>
          <tbody>
            {KPI_ORDER.map((key) => {
              const l = low.kpis[key]
              const h = high.kpis[key]
              if (!l) return null
              return (
                <tr key={key}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span>{l.label}</span>
                      <InfoPopover label={`About ${l.label}`} title={l.label} width={280}>
                        <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
                          <div className="font-semibold text-ink-primary">Formula</div>
                          <div className="mt-0.5">{l.formula}</div>
                          {l.note && <div className="mt-2 text-ink-muted">{l.note}</div>}
                        </div>
                      </InfoPopover>
                    </div>
                  </Td>
                  <Value kpi={l} />
                  <Value kpi={h} />
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>

      {simulation.scope.excluded_rows > 0 && (
        <div className="border-t border-border-subtle px-5 py-2.5 text-[11px] leading-[1.45] text-ink-muted">
          {simulation.scope.excluded_rows.toLocaleString()} rows excluded — {simulation.scope.excluded_reason}
        </div>
      )}
    </div>
  )
}

function Value({ kpi }: { kpi: SimulateResponse['result']['low']['kpis'][SimulationKpiKey] }) {
  return (
    <Td className="text-right align-top">
      {kpi.available ? (
        <span className="text-[14px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
          {kpi.display_value}
        </span>
      ) : (
        <>
          <span className="text-sm text-ink-muted">—</span>
          {kpi.unavailable_reason && (
            <div className="mt-0.5 max-w-[260px] text-[10.5px] leading-[1.4] text-ink-muted">
              {kpi.unavailable_reason}
            </div>
          )}
        </>
      )}
    </Td>
  )
}

/** Where the numbers came from. A popover rather than a panel — the detail
 *  matters, but not enough to sit permanently on the page. */
function ProvenancePopover({ simulation }: { simulation: SimulateResponse }) {
  const p = simulation.provenance
  return (
    <InfoPopover label="Where this result came from" title="Result provenance" width={300}>
      <div className="mt-1 space-y-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
        <div>
          <span className="font-semibold text-ink-primary">Rule:</span> {p.response_rule}
        </div>
        <div>
          <span className="font-semibold text-ink-primary">Treatment:</span> {p.treatment} at{' '}
          {p.discount_pct}%, approved uplift {(p.uplift_low * 100).toFixed(0)}–
          {(p.uplift_high * 100).toFixed(0)}%
        </div>
        <div>
          <span className="font-semibold text-ink-primary">KPI engine:</span> {p.kpi_engine}
        </div>
        <div className="text-ink-muted">{p.method}</div>
        <div className="text-ink-muted">
          Break-even uplift {(simulation.breakeven_uplift * 100).toFixed(1)}% — the approved band clears it
          by {(simulation.headroom.low * 100).toFixed(1)}pp at its floor.
        </div>
      </div>
    </InfoPopover>
  )
}

/** What a scenario shows before it has been run: the reason it has no result,
 *  never a zeroed KPI table. */
export function NotSimulatedPanel({ reason, error }: { reason: string | null; error: string | null }) {
  return (
    <div className="grid min-h-[260px] place-items-center px-6 py-10 text-center">
      <div className="max-w-[440px]">
        <div
          className={`mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full [&_svg]:h-5 [&_svg]:w-5 ${
            error ? 'bg-status-danger-bg text-status-danger' : 'bg-surface-muted text-ink-muted'
          }`}
        >
          <Icon name={error ? 'warning' : 'flow'} />
        </div>
        {error ? (
          <>
            <div className="text-sm font-bold text-ink-primary">Simulation failed</div>
            <div className="mt-1.5 break-words text-[12.5px] leading-[1.55] text-ink-secondary">{error}</div>
            <div className="mt-3 text-[11.5px] text-ink-muted">
              The scenario is unchanged. Adjust the treatment and run again.
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold text-ink-primary">Not simulated</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-secondary">{reason}</div>
            <div className="mt-3 text-[11.5px] text-ink-muted">
              Pick an approved treatment and run the scenario to see its result.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
