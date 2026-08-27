import { Link } from 'react-router-dom'
import { Card, Pill } from '../ui'
import { Icon } from '../../icons'
import type { IntelligenceHandoff } from '../../store/intelligenceHandoff'

/** What Promotion Intelligence sent the user here to test.
 *
 *  WHY IT IS ON SCREEN AT ALL. "Go Deeper" used to navigate and carry nothing,
 *  so the studio opened as a blank simulation and the user had to hold the
 *  recommendation in their head while rebuilding its scope by hand. This is
 *  the recommendation itself — its action, the evidence behind it, and the
 *  change it proposes — sitting above the levers that model it.
 *
 *  IT STATES WHAT WAS PRE-SET AND WHAT WAS NOT. `leverNote` is written by the
 *  studio from what it could actually apply: a depth that matches an approved
 *  treatment is selected and named here; anything else leaves the levers alone
 *  and says so. A control that moved for reasons the page did not explain is
 *  indistinguishable from advice nobody gave.
 */
export function RecommendationHandoffCard({
  handoff,
  leverNote,
  onClear,
}: {
  handoff: IntelligenceHandoff
  leverNote: string
  onClear: () => void
}) {
  const r = handoff.recommendation
  return (
    <Card className="fade-in border-[1.5px] border-[rgba(124,92,255,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle p-[14px_18px]">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Pill tone="violet">From Promotion Intelligence</Pill>
            <Pill tone="neutral">{handoff.scopeLabel}</Pill>
            {r && <Pill tone={r.priority === 'high' ? 'danger' : 'warning'}>{r.priority} priority</Pill>}
            {r && <Pill tone="neutral">{r.confidence}% confidence</Pill>}
          </div>
          <div className="text-[14px] font-bold leading-[1.4]">{r ? r.action : handoff.question}</div>
          {r && <div className="mt-1 text-[12.5px] leading-[1.55] text-ink-secondary">{r.rationale}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link to="/intelligence" className="whitespace-nowrap text-[12.5px] font-semibold text-brand-violet">
            ← Back to Promotion Intelligence
          </Link>
          <button
            onClick={onClear}
            className="whitespace-nowrap text-[12.5px] font-semibold text-ink-muted hover:text-ink-primary"
            title="Stop simulating this recommendation and return to the current selection"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-[14px_18px] max-[900px]:grid-cols-1">
        <Field label="Investigation question" value={handoff.question} />
        {handoff.rootCause && <Field label="Root cause found" value={handoff.rootCause} />}
        {r && <Field label="Evidence" value={r.evidence} />}
        {r && <Field label="Expected impact" value={r.expected_impact} />}
        {r && (
          <Field
            label="Proposed change"
            value={`${r.simulation.lever.replace(/_/g, ' ')} · ${r.simulation.current_value} → ${r.simulation.proposed_value}`}
          />
        )}
        {r && <Field label="Metric to watch" value={r.simulation.metric_to_watch} />}
      </div>

      <div className="flex items-start gap-2 border-t border-border-subtle bg-surface-muted p-[10px_18px] text-[12px] leading-[1.5] text-ink-secondary">
        <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
        <span>{leverNote}</span>
      </div>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">{label}</div>
      <div className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-secondary">{value}</div>
    </div>
  )
}
