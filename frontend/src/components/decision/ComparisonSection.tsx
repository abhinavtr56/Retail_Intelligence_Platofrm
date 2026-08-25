import { CardBody } from '../ui'
import { InfoPopover } from '../ui/InfoPopover'
import type { DecisionComparison, DecisionComparisonScenario } from '../../types/decision'
import type { ComparisonMetric, MetricSide } from '../../types/comparison'

/** The scenarios, side by side — B4.1's comparison, carried whole.
 *
 *  NOTHING IS RE-RUN AND NOTHING IS RE-RANKED. Every value, every band and every
 *  exclusion reason below is the one `/api/simulation/compare` produced. This
 *  component picks cells out of a payload; it computes nothing.
 *
 *  MEASURED AND SIMULATED ARE DIFFERENT COLUMNS, AND LABELLED AS SUCH. The
 *  Current column is measured from the rows in scope. Every scenario column is
 *  simulated at BOTH ends of the approved uplift range — never a midpoint, and
 *  never presented as a historical actual.
 *
 *  A SCENARIO NOBODY RAN IS EXCLUDED, NOT ZERO. Excluded entries are listed
 *  under the grid with the reason they carry, because a zero in the table would
 *  read as "we evaluated this and it came to nothing", which is a different and
 *  false claim.
 */
export function ComparisonSection({ comparison }: { comparison: DecisionComparison }) {
  if (!comparison.available) {
    return (
      <>
        <Header />
        <CardBody>
          <div className="text-[12.5px] leading-[1.6] text-ink-muted">{comparison.reason}</div>
        </CardBody>
      </>
    )
  }

  const shown = comparison.scenarios.filter((s) => s.status !== 'excluded')
  const excluded = comparison.scenarios.filter((s) => s.status === 'excluded')

  return (
    <>
      <Header rangeLabel={comparison.range_label} />
      <CardBody>
        {shown.length === 0 || comparison.metrics.length === 0 ? (
          <div className="text-[12.5px] leading-[1.6] text-ink-muted">
            No scenario in this comparison has a result to show.
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="pb-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
                    Metric
                  </th>
                  <th className="pb-2 pl-3 text-right text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
                    Current
                    <span className="ml-1 font-normal normal-case tracking-normal">measured</span>
                  </th>
                  {shown.map((scenario) => (
                    <ScenarioHead key={scenario.scenario_id} scenario={scenario} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.metrics.map((metric) => (
                  <MetricRow key={metric.key} metric={metric} shown={shown} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {excluded.length > 0 && (
          <div className="mt-3 border-t border-border-subtle pt-2.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
              Not compared
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {excluded.map((scenario) => (
                <li key={scenario.scenario_id} className="text-[11.5px] leading-[1.5] text-ink-muted">
                  <span className="font-semibold text-ink-secondary">{scenario.name}</span> —{' '}
                  {scenario.exclusion_reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 border-t border-border-subtle pt-2.5 text-[11px] leading-[1.5] text-ink-muted">
          {comparison.measured_note}
          {comparison.recommendation_reason && (
            <div className="mt-1">{comparison.recommendation_reason}</div>
          )}
        </div>
      </CardBody>
    </>
  )
}

function Header({ rangeLabel }: { rangeLabel?: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
      <h3 className="text-[15px] font-bold">Scenario Comparison</h3>
      {rangeLabel && <span className="text-[11px] text-ink-muted">{rangeLabel} · low – high</span>}
    </div>
  )
}

function ScenarioHead({ scenario }: { scenario: DecisionComparisonScenario }) {
  return (
    <th className="pb-2 pl-3 text-right align-bottom">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {scenario.name}
      </div>
      <div className="mt-0.5 flex flex-wrap justify-end gap-1">
        {scenario.is_selected && (
          <span className="rounded-[4px] bg-surface-muted px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-brand-violet">
            Selected
          </span>
        )}
        {scenario.is_recommended && (
          <span className="rounded-[4px] bg-status-success-bg px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-status-success">
            Recommended
          </span>
        )}
      </div>
      {/* A measured baseline carries no approved treatment — its depth is a
          revenue-weighted blend of whatever actually traded — so the column
          says what it is rather than showing an empty sub-label. */}
      <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-ink-muted">
        {scenario.discount_pct !== null
          ? `${scenario.discount_pct}% · ${scenario.treatment}`
          : scenario.is_baseline
            ? 'measured plan'
            : 'no treatment recorded'}
      </div>
    </th>
  )
}

function MetricRow({
  metric,
  shown,
}: {
  metric: ComparisonMetric
  shown: DecisionComparisonScenario[]
}) {
  const byId = new Map(metric.scenarios.map((s) => [s.scenario_id, s]))
  return (
    <tr className="border-b border-border-subtle last:border-b-0">
      <td className="py-2.5 pr-3 align-top text-[12.5px] text-ink-secondary">{metric.label}</td>
      <td className="py-2.5 pl-3 text-right align-top">
        <Side side={metric.baseline} label={`${metric.label} — measured`} />
      </td>
      {shown.map((scenario) => {
        const cell = byId.get(scenario.scenario_id)
        return (
          <td key={scenario.scenario_id} className="py-2.5 pl-3 text-right align-top">
            {cell ? (
              <Band low={cell.low} high={cell.high} label={metric.label} selected={scenario.is_selected} />
            ) : (
              <span className="text-[12px] text-ink-muted">Not compared</span>
            )}
          </td>
        )
      })}
    </tr>
  )
}

/** One measured value, or the engine's own reason it has none. Never a zero. */
function Side({ side, label }: { side: MetricSide | null; label: string }) {
  if (!side || !side.available) {
    return (
      <span className="inline-flex items-baseline gap-1 text-[12px] text-ink-muted">
        Not available
        {side?.unavailable_reason && (
          <InfoPopover label={`Why ${label} is unavailable`} title={label} width={288}>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
              {side.unavailable_reason}
            </div>
          </InfoPopover>
        )}
      </span>
    )
  }
  return (
    <span className="text-[13px] font-bold text-ink-secondary [font-variant-numeric:tabular-nums]">
      {side.display_value}
    </span>
  )
}

/** BOTH ENDS OF THE APPROVED RANGE. There is no midpoint field to render and
 *  none is derived here. */
function Band({
  low,
  high,
  label,
  selected,
}: {
  low: MetricSide
  high: MetricSide
  label: string
  selected: boolean
}) {
  if (!low.available || !high.available) {
    return (
      <span className="inline-flex items-baseline gap-1 text-[12px] text-ink-muted">
        Not available
        {(low.unavailable_reason ?? high.unavailable_reason) && (
          <InfoPopover label={`Why ${label} is unavailable`} title={label} width={288}>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
              {low.unavailable_reason ?? high.unavailable_reason}
            </div>
          </InfoPopover>
        )}
      </span>
    )
  }
  return (
    <span
      className={`text-[13px] [font-variant-numeric:tabular-nums] ${
        selected ? 'font-extrabold text-ink-primary' : 'font-bold text-ink-secondary'
      }`}
    >
      {low.display_value} – {high.display_value}
    </span>
  )
}
