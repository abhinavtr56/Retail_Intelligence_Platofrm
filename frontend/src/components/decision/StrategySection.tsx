import { CardBody } from '../ui'
import { InfoPopover } from '../ui/InfoPopover'
import type { DecisionStrategy, DecisionStrategyLever } from '../../types/decision'

/** The strategy levers — measured, selected, recommended.
 *
 *  ONLY WHAT THE SCENARIO CARRIES. The rows are the ones the record built from
 *  the simulation engine's own lever block. Retailer Incentive, Inventory
 *  Allocation and Budget Allocation are not here because no dataset in this
 *  project backs them, and a lever with nothing behind it is not offered.
 *
 *  THREE COLUMNS, THREE KINDS OF FACT, LABELLED AS SUCH. Current is MEASURED
 *  from the rows in scope; Selected is the scenario's own setting; Recommended
 *  is the treatment depth of the scenario the decision policy chose. A column
 *  with no source shows the record's own reason, never a blank and never a zero.
 *
 *  A LEVER THE ENGINE DOES NOT MODEL SAYS SO. `modelled: false` means the engine
 *  records the value and no KPI moves with it — printing it without that mark
 *  would let a reader believe the impact above responds to it.
 */
export function StrategySection({ strategy }: { strategy: DecisionStrategy }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Strategy</h3>
        {strategy.treatment && (
          <span className="text-[11px] text-ink-muted">
            Approved treatment · <span className="font-semibold text-ink-secondary">{strategy.treatment}</span>
          </span>
        )}
      </div>
      <CardBody>
        {!strategy.available ? (
          <div className="text-[12.5px] leading-[1.6] text-ink-muted">
            This scenario records no strategy levers.
          </div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <Th>Lever</Th>
                    <Th align="right">
                      Current
                      <span className="ml-1 font-normal text-ink-muted">measured</span>
                    </Th>
                    <Th align="right">
                      Selected
                      <span className="ml-1 font-normal text-ink-muted">simulated</span>
                    </Th>
                    <Th align="right">Recommended</Th>
                  </tr>
                </thead>
                <tbody>
                  {strategy.levers.map((lever) => (
                    <LeverRow key={lever.key} lever={lever} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 border-t border-border-subtle pt-2.5 text-[11px] leading-[1.5] text-ink-muted">
              {strategy.note}
              {!strategy.baseline_available && strategy.baseline_unavailable_reason && (
                <div className="mt-1">{strategy.baseline_unavailable_reason}</div>
              )}
            </div>
          </>
        )}
      </CardBody>
    </>
  )
}

function LeverRow({ lever }: { lever: DecisionStrategyLever }) {
  return (
    <tr className="border-b border-border-subtle last:border-b-0">
      <td className="py-2.5 pr-3 align-top">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12.5px] font-semibold text-ink-primary">{lever.label}</span>
          {/* Carried verbatim from the engine, and the two cases are different
              facts: a DERIVED lever is an output the engine computes rather
              than an input anyone sets, and a NOT MODELLED one is an input the
              engine records without any KPI responding to it. Either way it did
              not move a number in the impact above, and the badge says so. */}
          {lever.derived ? (
            <span className="rounded-[4px] bg-surface-muted px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
              Derived
            </span>
          ) : (
            !lever.modelled && (
              <span className="rounded-[4px] bg-surface-muted px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
                Not modelled
              </span>
            )
          )}
        </div>
        {lever.note && (
          <div className="mt-0.5 max-w-[420px] text-[11px] leading-[1.5] text-ink-muted">
            {lever.note}
          </div>
        )}
      </td>
      <Cell
        available={lever.current_available}
        display={lever.current_display}
        reason={lever.current_unavailable_reason}
        detail={lever.current_derivation}
        label={`${lever.label} — current`}
      />
      <Cell
        available={lever.selected_available}
        display={leverDisplay(lever.unit, lever.selected_value)}
        reason={lever.selected_unavailable_reason}
        strong
        label={`${lever.label} — selected`}
      />
      {/* When the policy recommends keeping the CURRENT PLAN, the recommended
          depth is the measured one — the engine's own formatted string, not a
          re-rendered float — and the cell says which it is so "25.0%" is not
          mistaken for an approved treatment depth. */}
      <Cell
        available={lever.recommended_available}
        display={lever.recommended_display ?? leverDisplay(lever.unit, lever.recommended_value)}
        reason={lever.recommended_unavailable_reason}
        note={lever.recommended_is_measured_plan ? 'measured plan' : lever.recommended_treatment}
        label={`${lever.label} — recommended`}
      />
    </tr>
  )
}

function Cell({
  available,
  display,
  reason,
  detail,
  note,
  strong,
  label,
}: {
  available: boolean
  display: string | null
  reason: string | null
  detail?: string | null
  /** A short qualifier under the value — which treatment it is, or that it is
   *  the measured plan rather than an approved treatment depth. */
  note?: string | null
  strong?: boolean
  label: string
}) {
  return (
    <td className="py-2.5 pl-3 text-right align-top">
      {available && display ? (
        <span className="inline-flex items-baseline gap-1">
          <span
            className={`text-[13px] [font-variant-numeric:tabular-nums] ${
              strong ? 'font-extrabold text-ink-primary' : 'font-bold text-ink-secondary'
            }`}
          >
            {display}
          </span>
          {detail && (
            <InfoPopover label={`How ${label} was derived`} title={label} width={300}>
              <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{detail}</div>
            </InfoPopover>
          )}
        </span>
      ) : (
        // WORDS, NOT PUNCTUATION. An em dash in a data cell reads as a rendering
        // failure; "Not available" reads as an answer, and the ⓘ carries the
        // engine's own reason for anyone who wants it.
        <span className="inline-flex items-baseline gap-1 text-[12px] text-ink-muted">
          Not available
          {reason && (
            <InfoPopover label={`Why ${label} is unavailable`} title={label} width={300}>
              <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{reason}</div>
            </InfoPopover>
          )}
        </span>
      )}
      {available && note && (
        <div className="mt-0.5 text-[10.5px] text-ink-muted">{note}</div>
      )}
    </td>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`pb-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted ${
        align === 'right' ? 'pl-3 text-right' : 'pr-3'
      }`}
    >
      {children}
    </th>
  )
}

/** A lever value with its unit attached. NOT a calculation and NOT a rounding:
 *  the number is the record's own, and this only names the unit the record
 *  already stated. Currency is left bare because no lever with a currency unit
 *  carries a selected or recommended value — trade spend is derived, not set. */
function leverDisplay(unit: string, value: number | null): string | null {
  if (value === null || value === undefined) return null
  if (unit === 'percent') return `${value}%`
  if (unit === 'weeks') return `${value} ${value === 1 ? 'week' : 'weeks'}`
  return String(value)
}
