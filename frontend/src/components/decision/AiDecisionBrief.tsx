import { Button, CardBody, Spinner } from '../ui'
import { Icon } from '../../icons'
import { briefFailure } from '../../hooks/useDecisionBrief'
import type { useDecisionBrief } from '../../hooks/useDecisionBrief'
import type { DecisionBriefResponse } from '../../types/decisionBrief'

/** The AI decision brief.
 *
 *  AN EXPLANATION BESIDE THE EVIDENCE, NOT INSTEAD OF IT. Every number on this
 *  page is computed by the deterministic TPO engines and rendered in the cards
 *  above. This card holds prose about those numbers. It is visually distinct so
 *  a reader can tell at a glance which is which, and it carries a label saying
 *  so — but it is deliberately NOT dressed up as an oracle: the AI did not make
 *  this decision, did not choose the scenario and did not assess the risk.
 *
 *  NOTHING HERE RUNS ON LOAD. The request is sent when the user asks for it.
 *  That is what guarantees the page cannot hang on a slow or unavailable model:
 *  Decision Center is complete before this card is ever used, and stays complete
 *  if it fails.
 *
 *  FAILURE IS A CARD STATE, NEVER A PAGE STATE. No key, no network, a timeout —
 *  each shows its own reason and a Retry, and everything else on the page keeps
 *  working. Save Decision in particular is never blocked by this.
 */
export function AiDecisionBrief({
  brief,
  onGenerate,
  disabled,
}: {
  brief: ReturnType<typeof useDecisionBrief>
  onGenerate: () => void
  disabled?: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" className="h-4 w-4 text-brand-violet" />
          <h3 className="text-[15px] font-bold">AI Decision Brief</h3>
          <span className="rounded-[4px] bg-surface-muted px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
            Explanation only
          </span>
        </div>
        {brief.isSuccess && brief.data && (
          <span className="text-[11px] text-ink-muted">{brief.data.model}</span>
        )}
      </div>
      <CardBody>
        {brief.isPending ? (
          <div className="flex items-center gap-2.5 text-[12.5px] text-ink-secondary">
            <Spinner />
            <span>Generating explanation…</span>
          </div>
        ) : brief.isError ? (
          <Failure error={brief.error} onRetry={onGenerate} />
        ) : brief.isSuccess && brief.data ? (
          <Brief data={brief.data} onRegenerate={onGenerate} />
        ) : (
          <Idle onGenerate={onGenerate} disabled={disabled} />
        )}
      </CardBody>
    </>
  )
}

function Idle({ onGenerate, disabled }: { onGenerate: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-[560px] text-[12.5px] leading-[1.6] text-ink-secondary">
        Generates a short executive explanation of the decision above — why this scenario, what it
        is expected to do, what supports it, what is risky and what remains unverified. It explains
        the record; it does not produce any figure in it.
      </div>
      <Button variant="secondary" onClick={onGenerate} disabled={disabled}>
        <Icon name="sparkles" /> <span>Generate AI Decision Brief</span>
      </Button>
    </div>
  )
}

function Brief({ data, onRegenerate }: { data: DecisionBriefResponse; onRegenerate: () => void }) {
  return (
    <>
      {/* A number the model wrote that is not in the record it was given.
          Normally this never appears. It does not suppress the text and it does
          not touch a single figure on the page — the cards above are computed,
          and this is prose. Surfacing it is more honest than hiding it. */}
      {data.unverified_figures.length > 0 && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[var(--r-md)] border border-[rgba(245,158,11,0.4)] bg-status-warning-bg px-3 py-2.5">
          <Icon name="warning" className="mt-px h-4 w-4 shrink-0 text-status-warning" />
          <div className="min-w-0 text-[11.5px] leading-[1.5] text-ink-secondary">
            <span className="font-bold text-ink-primary">Check these figures.</span> The explanation
            below mentions {data.unverified_figures.join(', ')}, which {' '}
            {data.unverified_figures.length === 1 ? 'does' : 'do'} not appear in the decision
            record. Use the values in the cards above — those are the computed ones.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {data.sections.map((section) => (
          <div key={section.key}>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-brand-violet">
              {section.heading}
            </div>
            <p className="mt-1 max-w-[860px] text-[12.5px] leading-[1.65] text-ink-secondary">
              {data.brief[section.key]}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Icon name="sparkles" className="h-3 w-3" />
          <span>AI-generated explanation · Based on decision evidence · {data.model}</span>
        </div>
        <Button variant="secondary" onClick={onRegenerate}>
          <Icon name="refresh" /> <span>Regenerate</span>
        </Button>
      </div>
      <div className="mt-2 max-w-[860px] text-[11px] leading-[1.5] text-ink-muted">
        {data.disclaimer}
      </div>
    </>
  )
}

function Failure({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { title, detail } = briefFailure(error)
  return (
    <div className="flex items-start gap-2.5">
      <Icon name="warning" className="mt-px h-4 w-4 shrink-0 text-status-warning" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold text-ink-primary">{title}</div>
        <div className="mt-0.5 max-w-[680px] break-words text-[11.5px] leading-[1.55] text-ink-secondary">
          {detail}
        </div>
        <Button variant="secondary" className="mt-2.5" onClick={onRetry}>
          <Icon name="refresh" /> <span>Retry</span>
        </Button>
      </div>
    </div>
  )
}
