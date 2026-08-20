import { Icon } from '../../icons'
import { Button, InfoPopover } from '../ui'
import type { LeverDefinition, LeverValues, SimulateResponse } from '../../types/simulation'

/** The TPO levers, for ONE scenario.
 *
 *  DISCOUNT IS A SEGMENTED CONTROL, NOT A SLIDER. Only five promotion
 *  treatments are approved — 5, 10, 15, 20 and 25 percent — and the backend
 *  rejects anything else rather than rounding or interpolating to the nearest.
 *  A continuous slider would invite the user to ask a question this project
 *  cannot answer, so the control offers exactly the five that exist. The list
 *  arrives from the API; the frontend keeps no copy of the approved rules.
 *
 *  TRADE SPEND IS NOT EDITABLE. In the approved economics it is b(1+u)P(d+c) —
 *  an output of the treatment. It is shown as a derived figure once a scenario
 *  has been run, and there is nothing to type into.
 *
 *  DURATION IS NOT MODELLED. No approved rule maps weeks to uplift, so it is
 *  shown as an observation of the Current Plan and labelled as not modelled.
 *  Nothing about it changes a result.
 *
 *  READ-ONLY FOR THE CURRENT PLAN. Its levers are what the data says happened;
 *  editing them would quietly turn a measurement into a hypothesis.
 */
export function LeverPanel({
  definitions,
  values,
  readOnly,
  note,
  canRun,
  runLabel,
  running,
  simulation,
  onSelectDiscount,
  onReset,
  onRun,
  dirty,
}: {
  definitions: LeverDefinition[]
  values: LeverValues
  /** True for the measured Current Plan. */
  readOnly: boolean
  note: string
  canRun: boolean
  runLabel: string
  running: boolean
  /** The executed result, when this scenario has one — the source of the
   *  derived Trade Spend. */
  simulation: SimulateResponse | null
  onSelectDiscount: (discountPct: number) => void
  onReset: () => void
  onRun: () => void
  dirty: boolean
}) {
  const discount = definitions.find((d) => d.key === 'discount_pct')
  const duration = definitions.find((d) => d.key === 'duration_weeks')
  const selected = values.discount_pct ?? null

  return (
    <div>
      {!readOnly && (
        <button
          onClick={onReset}
          disabled={!dirty}
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet disabled:cursor-not-allowed disabled:text-ink-muted"
        >
          ↺ Reset to measured values
        </button>
      )}

      <div className="flex flex-col gap-4">
        <DiscountControl
          definition={discount}
          selected={selected}
          readOnly={readOnly}
          onSelect={onSelectDiscount}
        />
        <DurationField definition={duration} />
        <DerivedSpend simulation={simulation} />
      </div>

      <Button variant="primary" block onClick={onRun} disabled={running || !canRun} className="mt-4">
        {running ? (
          <>Running simulation…</>
        ) : (
          <>
            <Icon name={readOnly ? 'refresh' : 'play'} /> {runLabel}
          </>
        )}
      </Button>

      <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-border-subtle bg-surface-muted p-[8px_12px] text-xs [&_svg]:mt-px [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:shrink-0 [&_svg]:text-ink-muted">
        <Icon name="info" />
        <span className="text-ink-secondary">{note}</span>
      </div>
    </div>
  )
}

/** The five approved treatment depths. */
function DiscountControl({
  definition,
  selected,
  readOnly,
  onSelect,
}: {
  definition: LeverDefinition | undefined
  selected: number | null
  readOnly: boolean
  onSelect: (discountPct: number) => void
}) {
  const points = definition?.approved_points ?? []

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs font-semibold text-ink-secondary">
          Discount Depth
          <InfoPopover label="About the discount treatments" title="Approved treatments" width={264}>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
              A scenario may use only these five approved promotion treatments. Depths between them are
              not offered: no approved rule defines an uplift for them, and inventing one would be a
              coefficient rather than a rule.
            </div>
          </InfoPopover>
        </label>
      </div>

      {readOnly ? (
        <div className="rounded-[var(--r-md)] border border-border-subtle bg-surface-muted p-2.5">
          <div className="text-[13px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
            {definition?.display_value ?? '—'}
          </div>
          <div className="mt-1 text-[11px] leading-[1.45] text-ink-muted">
            {definition?.basis ??
              'Measured for this scope. A blend across the promotions in scope, so it need not be one of the approved treatment depths.'}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1 rounded-[var(--r-md)] bg-surface-muted p-[3px]">
            {points.map((point) => {
              const active = selected !== null && Math.abs(selected - point.discount_pct) < 1e-9
              return (
                <button
                  key={point.treatment}
                  onClick={() => onSelect(point.discount_pct)}
                  title={`${point.treatment} · approved uplift ${(point.uplift_low * 100).toFixed(0)}–${(point.uplift_high * 100).toFixed(0)}%`}
                  className={`rounded-[6px] py-1.5 text-[12px] font-bold transition-colors [font-variant-numeric:tabular-nums] ${
                    active
                      ? 'bg-surface-card text-ink-primary shadow-[var(--shadow-xs)]'
                      : 'text-ink-muted hover:text-ink-secondary'
                  }`}
                >
                  {point.discount_pct}%
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 text-[10.5px] leading-[1.45] text-ink-muted">
            {selectedNote(points, selected)}
          </div>
        </>
      )}
    </div>
  )
}

function selectedNote(
  points: NonNullable<LeverDefinition['approved_points']>,
  selected: number | null,
): string {
  const point = points.find((p) => selected !== null && Math.abs(selected - p.discount_pct) < 1e-9)
  if (!point) return 'Select an approved treatment to run this scenario.'
  return `${point.treatment} · approved uplift range ${(point.uplift_low * 100).toFixed(0)}–${(point.uplift_high * 100).toFixed(0)}%`
}

/** Observed, and explicitly not modelled. */
function DurationField({ definition }: { definition: LeverDefinition | undefined }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-ink-secondary">Promotion Duration</label>
        <span className="rounded-[4px] bg-surface-muted px-1.5 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-ink-muted">
          Not modelled
        </span>
      </div>
      <div className="rounded-[var(--r-md)] border border-border-subtle bg-surface-muted p-2.5">
        <div className="text-[13px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
          {definition?.available ? definition.display_value : '—'}
        </div>
        <div className="mt-1 text-[11px] leading-[1.45] text-ink-muted">
          {definition?.available
            ? `${definition.basis}. No approved rule maps duration to uplift, so changing it would not change a result.`
            : definition?.unavailable_reason ?? 'Not available for this scope.'}
        </div>
      </div>
    </div>
  )
}

/** Trade Spend as an OUTPUT. Empty until the scenario has been run. */
function DerivedSpend({ simulation }: { simulation: SimulateResponse | null }) {
  const low = simulation?.result.low.kpis.trade_spend
  const high = simulation?.result.high.kpis.trade_spend

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-xs font-semibold text-ink-secondary">
          Derived Trade Spend
          <InfoPopover label="About derived trade spend" title="Derived, not entered" width={264}>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
              {simulation?.levers.spend_amount.note ??
                'Trade spend is an output of the scenario economics, not an input, so there is nothing to type here.'}
            </div>
          </InfoPopover>
        </label>
      </div>
      <div className="rounded-[var(--r-md)] border border-border-subtle bg-surface-muted p-2.5">
        {low?.available && high?.available ? (
          <>
            <div className="text-[13px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
              {low.display_value} – {high.display_value}
            </div>
            <div className="mt-1 text-[11px] text-ink-muted">Across the approved uplift range.</div>
          </>
        ) : (
          <div className="text-[11px] leading-[1.45] text-ink-muted">
            Calculated from the scenario economics when this scenario is run.
          </div>
        )}
      </div>
    </div>
  )
}
