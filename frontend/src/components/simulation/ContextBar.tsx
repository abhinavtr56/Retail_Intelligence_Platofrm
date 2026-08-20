import { Icon } from '../../icons'
import { InfoPopover } from '../ui'
import type { SimulationContext } from '../../types/simulation'
import type { SimulationContext as InvestigationSimulationContext } from '../../types/investigationContext'
import type { InvestigationOrigin } from '../../store/activeInvestigation'
import type { ContextField } from '../../types/investigationContext'

/** "What are we simulating?" — the resolved scope, in the words people use.
 *
 *  Every value comes from the API's resolved FilterState: channel codes are
 *  already turned into names by the same labeller the Command Center's
 *  breakdowns use, and an unconstrained dimension reads "All channels" rather
 *  than being given an invented default. Nothing on this bar is written down
 *  in the frontend.
 *
 *  Primary dimensions are always shown so the question has an answer even when
 *  nothing is selected; the rest appear only when they are constraining
 *  something.
 */
export function ContextBar({
  context,
  investigation = null,
  origin = null,
  originLabel = null,
}: {
  context: SimulationContext
  /** The RCA hand-off, when one was made. Null on direct entry. */
  investigation?: InvestigationSimulationContext | null
  origin?: InvestigationOrigin | null
  originLabel?: string | null
}) {
  const primary = context.dimensions.filter((d) => d.primary)
  const extra = context.dimensions.filter((d) => !d.primary && d.constrained)

  return (
    <div className="rounded-[var(--r-lg)] border border-border-default bg-surface-card p-[16px_18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-violet [&_svg]:h-3 [&_svg]:w-3">
          <Icon name="target" /> What are we simulating?
        </div>
        <div className="text-[11.5px] text-ink-muted">
          {context.row_count.toLocaleString()} rows · {context.promoted_row_count.toLocaleString()} promoted
        </div>
      </div>

      {investigation && (
        <InvestigationBlock
          investigation={investigation}
          origin={origin}
          originLabel={originLabel}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5">
        <Item label="Period" summary={context.period} constrained={context.year !== null} />
        {primary.map((d) => (
          <Item key={d.key} label={d.label} summary={d.summary} constrained={d.constrained} />
        ))}
      </div>

      {extra.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2 border-t border-border-subtle pt-2.5">
          {extra.map((d) => (
            <Item key={d.key} label={d.label} summary={d.summary} constrained />
          ))}
        </div>
      )}
    </div>
  )
}

function Item({ label, summary, constrained }: { label: string; summary: string; constrained: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">{label}</div>
      <div
        className={`mt-0.5 text-[13px] ${
          // An "All channels" is a real answer, but a weaker one than a
          // selection — muted so the eye finds what is actually constrained.
          constrained ? 'font-bold text-ink-primary' : 'text-ink-muted'
        }`}
      >
        {summary}
      </div>
    </div>
  )
}

/** The investigation this simulation belongs to — B3.2.
 *
 *  THE QUESTION IS SHOWN ONLY IF IT IS ONE. `store/activeInvestigation.ts`
 *  seeds itself with an example copied from investigation-types.json, so a
 *  user who has never run an investigation is still carrying a
 *  plausible-sounding sentence. The backend reports that as `seed_example`
 *  rather than as the investigation's question, and this block renders the
 *  distinction instead of hiding it.
 *
 *  Missing metadata is stated, never invented. RCA assigns no investigation
 *  id and records no KPI under investigation, so both read as unavailable
 *  with the reason on hover.
 */
function InvestigationBlock({
  investigation,
  origin,
  originLabel,
}: {
  investigation: InvestigationSimulationContext
  origin: InvestigationOrigin | null
  originLabel: string | null
}) {
  const question = investigation.question
  const asked = question.value !== null

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
          {asked ? 'Investigation question' : 'Investigation'}
        </div>
        {origin && originLabel && (
          <div className="text-[10.5px] text-ink-muted">
            From {origin === 'risk_alert' ? 'risk alert' : 'underperforming promotions'}: {originLabel}
          </div>
        )}
      </div>

      {asked ? (
        <div className="mt-1 text-[13px] font-semibold leading-[1.45] text-ink-primary">{question.value}</div>
      ) : (
        <div className="mt-1 flex items-start gap-1.5 text-[12px] leading-[1.45] text-ink-muted">
          <span>
            {question.source === 'seed_example'
              ? 'No investigation question yet — the studio is showing an example, not something you asked.'
              : 'No investigation question recorded.'}
          </span>
          <InfoPopover label="Why there is no question" title="Investigation question" width={280}>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{question.reason}</div>
          </InfoPopover>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
        <Meta label="Type" field={investigation.investigation_type} />
        <Meta label="Investigation ID" field={investigation.investigation_id} />
        <Meta label="KPI" field={investigation.focus.kpi} />
        <Meta label="Promotion" field={investigation.focus.promotion_id} />
        <Meta label="Product" field={investigation.focus.product_id} />
      </div>
    </div>
  )
}

/** One piece of investigation metadata. An absent value says so, and the
 *  reason is one hover away — nothing is filled in with a guess. */
function Meta({ label, field }: { label: string; field: ContextField<string> }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-muted">
      <span className="font-semibold">{label}:</span>
      {field.value !== null ? (
        <span className="font-bold text-ink-primary">{field.value}</span>
      ) : (
        <>
          <span>Not specified by investigation</span>
          <InfoPopover label={`Why ${label} is unavailable`} title={label} width={272}>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{field.reason}</div>
          </InfoPopover>
        </>
      )}
    </span>
  )
}
