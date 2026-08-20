import { Icon } from '../../icons'
import { InfoPopover } from '../ui'
import type { CurrentPlan } from '../../types/simulation'

/** THE CURRENT PLAN — what the data says is happening now.
 *
 *  Not a scenario. Every field is derived from fact_sales or from the
 *  validated KPI engine, and every field can show the derivation that produced
 *  it. A field that could not be derived shows the reason instead: the
 *  duration disappears when several promotions share the scope, because a
 *  duration belongs to a promotion and no median stands in for one.
 */
export function CurrentPlanPanel({ plan }: { plan: CurrentPlan }) {
  return (
    <div className="flex flex-col">
      {plan.fields.map((field) => (
        <div key={field.key} className="border-b border-border-subtle py-2.5 last:border-b-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-ink-muted">{field.label}</span>
              {(field.derivation || field.unavailable_reason) && (
                <InfoPopover label={`How ${field.label} was derived`} title={field.label} width={272}>
                  <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
                    {field.available ? (
                      <>
                        <span className="font-semibold text-ink-primary">Derived from</span>
                        <div className="mt-0.5">{field.derivation}</div>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-ink-primary">Not available</span>
                        <div className="mt-0.5">{field.unavailable_reason}</div>
                      </>
                    )}
                  </div>
                </InfoPopover>
              )}
            </div>
            {field.available ? (
              <span className="text-right text-[13px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
                {field.display_value}
              </span>
            ) : (
              <span className="text-[13px] text-ink-muted">—</span>
            )}
          </div>
          {!field.available && field.unavailable_reason && (
            <div className="mt-1 text-[11px] leading-[1.45] text-ink-muted">{field.unavailable_reason}</div>
          )}
        </div>
      ))}

      <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-surface-muted p-[8px_10px] text-[11px] leading-[1.45] text-ink-secondary [&_svg]:mt-px [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0 [&_svg]:text-ink-muted">
        <Icon name="info" />
        <span>
          Measured from the data in this scope — not a proposal. Hover any field to see exactly how it was
          derived.
        </span>
      </div>
    </div>
  )
}
