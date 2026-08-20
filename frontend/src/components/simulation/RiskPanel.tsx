import { Icon } from '../../icons'
import { InfoPopover } from '../ui'
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

        {attention.length > 0 && <FindingGroup label="Needs attention" findings={attention} />}
        {unknown.length > 0 && <FindingGroup label="Could not be assessed" findings={unknown} />}
        {clear.length > 0 && <FindingGroup label="Evidence" findings={clear} />}

        <Section label="Governance considerations">
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

        <Section label="Method limitations">
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
          <Section label="What to validate before execution">
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

function FindingGroup({ label, findings }: { label: string; findings: RiskFinding[] }) {
  return (
    <Section label={label}>
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
            <div className="mt-0.5 text-ink-muted">{finding.reason}</div>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
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
