import { useState } from 'react'
import { Icon } from '../../icons'
import { InfoBlock, InfoPopover } from '../ui'
import { DonutBreakdown, type DonutSegment } from '../charts'
import type { RiskAssessment, RiskFinding, Severity } from '../../types/risk'

/** Risk & governance — B6.
 *
 *  RISK IS NOT RECOMMENDATION. B4.3 says which scenario is preferred; this
 *  says what a decision maker should know before acting on it. A scenario can
 *  be recommended and still carry attention-level findings, and this panel
 *  never changes or reinterprets the recommendation — it repeats it.
 *
 *  THREE KINDS OF THING, KEPT VISIBLY APART, because conflating them is how a
 *  governance panel starts inventing policy:
 *
 *    EVIDENCE        what the data says about this scenario.
 *    GOVERNANCE GAP  a boundary the project has never approved. Reported as
 *                    absent, never filled in with a plausible number.
 *    ACTION          something to verify before executing. Never "pick a
 *                    different scenario".
 *
 *  NO SCORE, NO TRAFFIC LIGHT BEYOND THE POLICY. The states are Clear,
 *  Attention and Unknown — the words the engine uses. Nothing here says "safe"
 *  or "good", because no approved rule supports either claim.
 */
export function RiskPanel({ risk }: { risk: RiskAssessment }) {
  const attention = risk.findings.filter((f) => f.status === 'attention')
  const unknown = risk.findings.filter((f) => f.status === 'unknown')
  const clear = risk.findings.filter((f) => f.status === 'clear')
  const actions = risk.findings.filter((f) => f.recommended_action)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold">Risk &amp; Governance</h3>
            <StatusPill status={risk.overall_status} />
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-muted">
            Assessed independently of the recommendation · policy v{risk.policy.version}
          </div>
        </div>
        <PolicyPopover risk={risk} />
      </div>

      <div className="px-5 py-4">
        <CheckMix risk={risk} />

        <div className="max-w-[680px] text-[12.5px] leading-[1.6] text-ink-secondary">
          {risk.summary}
        </div>

        {risk.recommendation_context.recommended_scenario_id && (
          <div className="mt-2 text-[11.5px] leading-[1.5] text-ink-muted">
            {risk.recommendation_context.is_recommended ? (
              <>
                This scenario is <span className="font-semibold text-ink-secondary">recommended
                under the current decision policy</span>. {risk.recommendation_context.note}
              </>
            ) : (
              <>
                The recommended scenario under the current decision policy is{' '}
                <span className="font-semibold text-ink-secondary">
                  {risk.recommendation_context.recommended_scenario_id}
                </span>
                . {risk.recommendation_context.note}
              </>
            )}
          </div>
        )}

        {/* WHAT IS OPEN AND WHAT IS FOLDED. Nothing is dropped — every finding,
            gap, limitation and action is still here, in the same words. The
            panel simply stops printing all of it at once: what needs a decision
            is open, and the standing context behind it is one click away. Each
            fold carries its own count, so a collapsed section still says how
            much is in it. */}
        {attention.length > 0 && <FindingGroup label="Needs attention" findings={attention} defaultOpen />}
        {unknown.length > 0 && <FindingGroup label="Could not be assessed" findings={unknown} />}
        {clear.length > 0 && <FindingGroup label="Evidence" findings={clear} />}

        <Section label="Governance considerations" count={risk.governance_gaps.length}>
          <div className="text-[11px] leading-[1.5] text-ink-muted">
            These boundaries are not defined anywhere in the project, so nothing above is
            judged against them.
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {risk.governance_gaps.map((gap) => (
              <li key={gap.key} className="text-[11.5px] leading-[1.5] text-ink-muted">
                <span className="font-semibold text-ink-secondary">{gap.label}</span> — {gap.statement}
              </li>
            ))}
          </ul>
        </Section>

        <Section label="Method limitations" count={risk.limitations.length}>
          <ul className="flex flex-col gap-1.5">
            {risk.limitations.map((limitation) => (
              <li key={limitation.id} className="text-[11.5px] leading-[1.5] text-ink-muted">
                <span className="font-semibold text-ink-secondary">{limitation.title}</span> —{' '}
                {limitation.statement}
                <div className="text-ink-muted">{limitation.implication}</div>
              </li>
            ))}
          </ul>
        </Section>

        {actions.length > 0 && (
          <Section label="What to validate before execution" count={actions.length} defaultOpen>
            <ul className="flex flex-col gap-1">
              {actions.map((finding) => (
                <li key={finding.id} className="text-[11.5px] leading-[1.5] text-ink-secondary">
                  • {finding.recommended_action}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}

function FindingGroup({
  label,
  findings,
  defaultOpen = false,
}: {
  label: string
  findings: RiskFinding[]
  defaultOpen?: boolean
}) {
  return (
    <Section label={label} count={findings.length} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-2.5">
        {findings.map((finding) => (
          <div key={finding.id} className="text-[11.5px] leading-[1.5]">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-ink-primary">{finding.title}</span>
              <SeverityTag severity={finding.severity} />
              <span className="text-[10px] uppercase tracking-[0.04em] text-ink-muted">
                {finding.category.replace('_', ' ')}
              </span>
              <InfoPopover label={`Evidence for ${finding.title}`} title={finding.title} width={320}>
                <div className="mt-1 space-y-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
                  <div>{finding.reason}</div>
                  <div>
                    <span className="font-semibold text-ink-primary">Impact:</span> {finding.impact}
                  </div>
                  <div className="text-ink-muted">Source: {finding.source}</div>
                  <pre className="mt-1 max-h-[160px] overflow-auto rounded-[var(--r-sm)] bg-ink-primary/[0.04] p-1.5 text-[10px] leading-[1.4] text-ink-secondary">
                    {JSON.stringify(finding.evidence, null, 1)}
                  </pre>
                </div>
              </InfoPopover>
            </div>
            {/* Two lines here, the whole paragraph in the ⓘ beside the title —
                which already carried it, along with the impact, the source and
                the evidence. The reason is not shortened, only folded. */}
            <div className="mt-0.5 line-clamp-2 text-ink-muted">{finding.reason}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Named levels only. `unknown` is shown as such rather than being quietly
 *  rendered as "low". */
function SeverityTag({ severity }: { severity: Severity }) {
  const tone = {
    high: 'bg-status-danger-bg text-status-danger',
    medium: 'bg-status-warning-bg text-status-warning',
    low: 'bg-surface-muted text-ink-muted',
    unknown: 'bg-surface-muted text-ink-muted',
  }[severity]
  return (
    <span
      className={`rounded-[4px] px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${tone}`}
    >
      {severity}
    </span>
  )
}

/** The assessment's own checks, counted — as a ring, a figure and a formula.
 *
 *  IT IS NOT A RISK SCORE, and the ⓘ says so. types/risk.ts is explicit that
 *  the engine computes no score, no weight and no risk-adjusted winner, and
 *  inventing one here — severity weights, a risk-adjusted number, a "safety"
 *  percentage — would be precisely the invented policy the rest of this panel
 *  refuses. What the ring shows is the COMPOSITION OF THE CHECKS the engine
 *  actually returned: how many came back clear, how many need attention, and
 *  how many no approved rule could judge.
 *
 *  WHAT THE FIGURE IN THE MIDDLE IS. The clear share of the checks that COULD
 *  be judged. `unknown` findings are on the ring but out of the fraction,
 *  because `unknown` means no approved boundary exists — folding them in
 *  either way would be scoring them against a rule nobody wrote. When nothing
 *  could be judged there is no figure at all, and the ring says so rather than
 *  reading 0% or 100%.
 *
 *  EVERY CHECK COUNTS ONCE. The decision policy assigns no severity weights,
 *  so none are applied; the popover states that rather than leaving the
 *  weighting to be assumed. */
function CheckMix({ risk }: { risk: RiskAssessment }) {
  const counts = {
    clear: risk.findings.filter((f) => f.status === 'clear').length,
    attention: risk.findings.filter((f) => f.status === 'attention').length,
    unknown: risk.findings.filter((f) => f.status === 'unknown').length,
  }
  const total = counts.clear + counts.attention + counts.unknown
  // No checks, nothing to compose. The summary and the sections below still
  // say everything this assessment found.
  if (total === 0) return null

  const assessed = counts.clear + counts.attention
  const score = assessed > 0 ? Math.round((counts.clear / assessed) * 100) : null
  const share = (n: number) => Math.round((n / total) * 100)
  const label = (n: number) => `${n} check${n === 1 ? '' : 's'}`

  const segments: DonutSegment[] = [
    { key: 'Clear', pct: share(counts.clear), color: 'var(--status-success)', value: label(counts.clear) },
    { key: 'Needs attention', pct: share(counts.attention), color: 'var(--status-warning)', value: label(counts.attention) },
    { key: 'Could not be assessed', pct: share(counts.unknown), color: 'var(--border-strong)', value: label(counts.unknown) },
  ].filter((segment) => segment.pct > 0)

  // THE ENGINE'S OWN COMPONENTS. Each finding names the category it belongs to
  // (ECONOMIC, GOVERNANCE, DATA_AVAILABILITY, …) and its own severity — so a
  // breakdown by category is a regrouping of the assessment, not a model of it.
  // There is no WEIGHT column because the engine defines no weights; adding one
  // would mean choosing numbers nobody approved, and the note under the table
  // says so rather than leaving a reader to assume they exist.
  const categories = Array.from(new Set(risk.findings.map((f) => f.category))).map((category) => {
    const inCategory = risk.findings.filter((f) => f.category === category)
    return {
      category,
      total: inCategory.length,
      clear: inCategory.filter((f) => f.status === 'clear').length,
      attention: inCategory.filter((f) => f.status === 'attention').length,
      unknown: inCategory.filter((f) => f.status === 'unknown').length,
      severities: Array.from(new Set(inCategory.map((f) => f.severity))),
    }
  })

  return (
    <div className="mb-4 rounded-[var(--r-md)] border border-border-subtle p-[14px_16px]">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          Governance check mix
        </span>
        <InfoPopover label="About the governance check mix" title="Governance check mix" width={330}>
          <InfoBlock label="Formula">Clear ÷ (Clear + Needs attention) × 100</InfoBlock>
          <InfoBlock label="Weighting">
            Every check counts once. Decision policy v{risk.policy.version} defines no severity
            weights, so none are applied.
          </InfoBlock>
          <InfoBlock label="Excluded">
            Checks that could not be assessed. "Unknown" means no approved rule defines what
            enough would be, so they are shown on the ring but left out of the figure.
          </InfoBlock>
          <InfoBlock label="Risk level">{risk.overall_status_rule}</InfoBlock>
          <InfoBlock label="The one numeric threshold">
            {risk.policy.narrow_headroom_pp} percentage points of break-even headroom —{' '}
            {risk.policy.narrow_headroom_source}
          </InfoBlock>
          <div className="mt-1.5 text-[10.5px] leading-[1.4] text-ink-muted">
            A count of this assessment's own checks — not a risk score. The engine computes none:
            no score, no weighting, no probability and no confidence (app/tpo/risk.py).
          </div>
        </InfoPopover>
      </div>

      {/* Donut left, the engine's own breakdown right — and the breakdown
          scrolls inside its own column rather than widening the card. */}
      <div className="grid grid-cols-[minmax(240px,320px)_1fr] gap-5 max-[900px]:grid-cols-1">
        <div>
          <DonutBreakdown
            segments={segments}
            size={132}
            stroke={22}
            centerValue={score === null ? '—' : `${score}%`}
            centerLabel={score === null ? 'not assessable' : 'checks clear'}
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-ink-muted">Risk level</span>
            <StatusPill status={risk.overall_status} />
          </div>
          <div className="mt-2 text-[11px] leading-[1.5] text-ink-muted">
            {score === null
              ? `No approved rule could judge any of the ${label(total)} in this assessment, so no figure is shown.`
              : `${label(counts.clear)} of ${label(assessed)} that could be judged came back clear${
                  counts.unknown > 0 ? `; ${label(counts.unknown)} could not be assessed` : ''
                }.`}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            By component
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-border-subtle text-ink-muted">
                  <th className="py-1 pr-3 text-left font-semibold">Component</th>
                  <th className="px-2 py-1 text-right font-semibold">Checks</th>
                  <th className="px-2 py-1 text-right font-semibold">Clear</th>
                  <th className="px-2 py-1 text-right font-semibold">Attention</th>
                  <th className="px-2 py-1 text-right font-semibold">Unassessed</th>
                  <th className="py-1 pl-2 text-right font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.category} className="border-b border-border-subtle last:border-b-0">
                    <td className="py-1.5 pr-3 text-left text-ink-secondary">
                      {row.category.replace(/_/g, ' ').toLowerCase()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-primary">{row.total}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{row.clear}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{row.attention}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{row.unknown}</td>
                    <td className="py-1.5 pl-2 text-right text-ink-muted">{row.severities.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10.5px] leading-[1.45] text-ink-muted">
            No weight column: the decision policy assigns none, so every check counts once and a
            weighted total cannot be shown without inventing the weights.
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: RiskAssessment['overall_status'] }) {
  const label = { clear: 'Clear', attention: 'Attention', unknown: 'Unknown' }[status]
  const tone = {
    clear: 'bg-status-success-bg text-status-success',
    attention: 'bg-status-warning-bg text-status-warning',
    unknown: 'bg-surface-muted text-ink-muted',
  }[status]
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${tone}`}
    >
      {label}
    </span>
  )
}

/** A section of the panel, foldable rather than always printed.
 *
 *  THE CONTENT IS UNCHANGED. This adds a header that toggles; it removes no
 *  finding, no governance gap, no limitation and no action, and it shortens no
 *  sentence. The panel had grown to a page and a half of standing policy text
 *  that has to remain available and does not have to be read every time.
 *
 *  The count sits in the header so a folded section still reports its size —
 *  "Evidence 5" is a fact about the assessment, not a hidden one. */
function Section({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string
  /** Omitted for sections that are not a list. */
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted hover:text-ink-secondary"
      >
        <Icon
          name="chevronDown"
          className={`h-3 w-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        {label}
        {count != null && (
          <span className="rounded-[4px] bg-surface-muted px-1.5 py-[1px] text-[9.5px] font-extrabold tabular-nums text-ink-muted">
            {count}
          </span>
        )}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  )
}

function PolicyPopover({ risk }: { risk: RiskAssessment }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
      <Icon name="shield" className="h-3 w-3" />
      How this is assessed
      <InfoPopover label="The risk policy" title="Risk &amp; governance policy" width={330}>
        <div className="mt-1 space-y-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
          <div>{risk.policy.principle}</div>
          <div>
            <span className="font-semibold text-ink-primary">Overall status:</span>{' '}
            {risk.overall_status_rule}
          </div>
          <div>
            <span className="font-semibold text-ink-primary">Break-even headroom:</span>{' '}
            {risk.policy.narrow_headroom_source}
          </div>
          <div className="text-ink-muted">{risk.provenance.method}</div>
        </div>
      </InfoPopover>
    </span>
  )
}

/** Shown when no scenario has been simulated. Nothing is assessed and nothing
 *  is fabricated. */
export function RiskEmptyState() {
  return (
    <div className="px-5 py-8 text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-muted [&_svg]:h-5 [&_svg]:w-5">
        <Icon name="shield" />
      </div>
      <div className="text-sm font-bold text-ink-primary">Risk &amp; Governance</div>
      <div className="mt-1.5 text-[12.5px] text-ink-secondary">
        Run a scenario to assess risk and governance.
      </div>
    </div>
  )
}
