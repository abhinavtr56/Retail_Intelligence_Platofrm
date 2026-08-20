import { Icon } from '../../icons'
import { InfoPopover, Table, Th, Td } from '../ui'
import type {
  ComparisonMetric,
  ComparisonScenario,
  MetricScenario,
  ScenarioComparison,
} from '../../types/comparison'

/** Scenario comparison — B4.2.
 *
 *  COMPARISON IS NOT RECOMMENDATION, and this component is built so it cannot
 *  quietly become one. Everything on screen is a fact the backend produced;
 *  nothing here ranks, scores, sorts by value, or says which scenario is
 *  better.
 *
 *  Three consequences worth naming, because each is a thing a comparison table
 *  normally does and this one must not:
 *
 *  NO GREEN AND RED ON DELTAS. Colouring a delta encodes better/worse, and
 *  `preference` is null on every metric — the project defines no business
 *  objective, so nothing here knows whether a lower trade spend is good news.
 *  Deltas are rendered in neutral ink with a direction arrow, which is a
 *  statement about the number and not about its merit.
 *
 *  NO SORTING. Scenarios appear in the order the backend returned them, which
 *  is the order the user created them. Sorting by any metric would be ranking
 *  by that metric.
 *
 *  NO MIDPOINT. A simulated scenario shows `low – high` and BOTH deltas. The
 *  approved uplift band is a band; averaging its ends would invent a precision
 *  the approved rules do not grant.
 */
export function ComparisonTable({ comparison }: { comparison: ScenarioComparison }) {
  if (comparison.comparison_status !== 'comparable') {
    return <NotComparable comparison={comparison} />
  }

  const columns = comparison.scenarios.filter((s) => s.comparable)
  const excluded = comparison.scenarios.filter((s) => !s.comparable)

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Metric</Th>
            {columns.map((scenario) => (
              <Th key={scenario.scenario_id} className="text-right">
                <div className="normal-case leading-[1.3] text-ink-primary">{scenario.name}</div>
                <div className="text-[10px] font-normal normal-case text-ink-muted">
                  {scenario.is_baseline
                    ? 'Measured baseline'
                    : `Simulated · ${scenario.treatment} at ${scenario.discount_pct}%`}
                </div>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SectionRow label="Treatment" span={columns.length + 1} />
          <tr>
            <Td>Approved uplift range</Td>
            {columns.map((scenario) => (
              <Td key={scenario.scenario_id} className="text-right [font-variant-numeric:tabular-nums]">
                {scenario.uplift
                  ? `${(scenario.uplift.low * 100).toFixed(0)}–${(scenario.uplift.high * 100).toFixed(0)}%`
                  : '—'}
              </Td>
            ))}
          </tr>

          <SectionRow label="Outcome" span={columns.length + 1} />
          {comparison.metrics.map((metric) => (
            <MetricRow key={metric.key} metric={metric} columns={columns} />
          ))}
        </tbody>
      </Table>

      {excluded.length > 0 && <ExcludedNote excluded={excluded} />}
      <Footnote comparison={comparison} />
    </>
  )
}

function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <Td
        colSpan={span}
        className="!text-[10.5px] !font-bold !uppercase !tracking-[0.05em] !text-ink-muted"
      >
        {label}
      </Td>
    </tr>
  )
}

function MetricRow({ metric, columns }: { metric: ComparisonMetric; columns: ComparisonScenario[] }) {
  const byId = new Map(metric.scenarios.map((s) => [s.scenario_id, s]))

  return (
    <tr>
      <Td>
        <div className="flex items-center gap-1.5">
          <span>{metric.label}</span>
          <InfoPopover label={`How ${metric.label} is compared`} title={metric.label} width={288}>
            <div className="mt-1 space-y-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
              <div>
                <span className="font-semibold text-ink-primary">Delta:</span>{' '}
                {metric.delta_type.replace('_', ' ')}
              </div>
              <div className="text-ink-muted">{metric.delta_rationale}</div>
              <div className="text-ink-muted">{metric.preference_reason}</div>
            </div>
          </InfoPopover>
        </div>
      </Td>

      {columns.map((column) => {
        if (column.is_baseline) {
          return (
            <Td key={column.scenario_id} className="text-right [font-variant-numeric:tabular-nums]">
              {metric.baseline?.available ? (
                <span className="font-bold text-ink-primary">{metric.baseline.display_value}</span>
              ) : (
                <Unavailable reason={metric.baseline?.unavailable_reason ?? null} />
              )}
            </Td>
          )
        }

        const cell = byId.get(column.scenario_id)
        if (!cell) return <Td key={column.scenario_id} className="text-right text-ink-muted">—</Td>
        return <ScenarioCell key={column.scenario_id} cell={cell} />
      })}
    </tr>
  )
}

/** One simulated scenario's cell: the range, then both deltas.
 *
 *  Rendered in neutral ink. A green "+₹4.2 Cr" would be the component deciding
 *  that more spend is good news, and nothing in this project has decided that.
 */
function ScenarioCell({ cell }: { cell: MetricScenario }) {
  if (!cell.low.available || !cell.high.available) {
    return (
      <Td className="text-right">
        <Unavailable reason={cell.low.unavailable_reason ?? cell.high.unavailable_reason ?? null} />
      </Td>
    )
  }

  return (
    <Td className="text-right align-top [font-variant-numeric:tabular-nums]">
      <div className="font-bold text-ink-primary">
        {cell.low.display_value} – {cell.high.display_value}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-muted">
        <Delta direction={cell.direction_low} display={cell.delta_low.display} />
        {' / '}
        <Delta direction={cell.direction_high} display={cell.delta_high.display} />
        <span className="ml-1 text-[10px]">vs baseline</span>
      </div>
    </Td>
  )
}

/** An arrow and a number. The arrow says which way the value moved — it does
 *  NOT say whether that is an improvement. */
function Delta({ direction, display }: { direction: string | null; display: string | null }) {
  if (!display) return <span>—</span>
  const arrow = direction === 'higher' ? '↑' : direction === 'lower' ? '↓' : '→'
  return (
    <span>
      {arrow} {display}
    </span>
  )
}

function Unavailable({ reason }: { reason: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      —
      {reason && (
        <InfoPopover label="Why this metric is unavailable" title="Not available" width={272}>
          <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{reason}</div>
        </InfoPopover>
      )}
    </span>
  )
}

/** Scenarios that could not join the comparison, and why. Listed rather than
 *  silently dropped — a missing column with no explanation reads as an
 *  oversight. */
function ExcludedNote({ excluded }: { excluded: ComparisonScenario[] }) {
  return (
    <div className="border-t border-border-subtle px-5 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        Not compared
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {excluded.map((scenario) => (
          <div key={scenario.scenario_id} className="text-[11.5px] leading-[1.45] text-ink-muted">
            <span className="font-semibold text-ink-secondary">{scenario.name}</span> —{' '}
            {scenario.exclusion_reason}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The statement this whole card exists to make. */
function Footnote({ comparison }: { comparison: ScenarioComparison }) {
  return (
    <div className="flex items-start gap-1.5 border-t border-border-subtle px-5 py-3 text-[11px] leading-[1.5] text-ink-muted [&_svg]:mt-px [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0">
      <Icon name="info" />
      <span>
        <span className="font-semibold text-ink-secondary">This is a comparison, not a recommendation.</span>{' '}
        Simulated figures show the {comparison.range_label.toLowerCase()} — the low and high ends of the
        treatment's approved band, not a confidence interval — and both deltas are shown against the measured
        baseline. No scenario is ranked or preferred: {comparison.recommendation_reason}
      </span>
    </div>
  )
}

/** What a comparison shows when it cannot be made. */
function NotComparable({ comparison }: { comparison: ScenarioComparison }) {
  const message =
    comparison.comparison_status === 'no_baseline'
      ? 'There is no measured baseline for this scope, so there is nothing to compare against.'
      : 'No scenario has been simulated for this scope yet. Run one to compare it with the measured baseline.'

  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-muted [&_svg]:h-5 [&_svg]:w-5">
        <Icon name="layers" />
      </div>
      <div className="text-sm font-bold text-ink-primary">Nothing to compare yet</div>
      <div className="mx-auto mt-1.5 max-w-[440px] text-[12.5px] leading-[1.55] text-ink-secondary">
        {message}
      </div>
      {comparison.scenarios.some((s) => !s.comparable) && (
        <div className="mx-auto mt-4 max-w-[520px] text-left">
          <ExcludedNote excluded={comparison.scenarios.filter((s) => !s.comparable)} />
        </div>
      )}
    </div>
  )
}
