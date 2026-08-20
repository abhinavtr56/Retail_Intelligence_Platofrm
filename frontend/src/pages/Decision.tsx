import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardBody, LiveStatus, Spinner, useLiveStatus } from '../components/ui'
import { InfoPopover } from '../components/ui/InfoPopover'
import { Icon } from '../icons'
import { useDecisionRecord } from '../hooks/useDecision'
import { saveBriefing, useDecisionBriefing } from '../hooks/useBriefing'
import { useDecisionDraftStore } from '../store/decisionDraft'
import { useSavedRefsStore } from '../store/savedRefs'
import { useSaveDecision, useStoredDecision } from '../hooks/useStore'
import type { StoredDecision } from '../types/store'
import type { DecisionImpactMetric, DecisionRecord } from '../types/decision'
import type { RiskFinding } from '../types/risk'

/** Governed Promotion Decision Center — B7.
 *
 *  Shows ONE decision record, assembled by the backend from the scenario the
 *  user carried here, its recommendation and its governance assessment.
 *
 *  WHAT THIS PAGE USED TO DO. It read `decision.json` and rendered authored
 *  content: an ROI of 2.55 in units Simulation abandoned, a "Data Confidence —
 *  High (89%)", strategy rows for Retailer Incentive and Inventory Allocation
 *  (two levers no dataset in this project supports), a governance panel
 *  reporting "Budget Compliance — Compliant" and "Margin Threshold —
 *  Compliant", and an approval animation announcing that the finance team had
 *  been notified. None of it was connected to anything, and the compliance
 *  claims were made against thresholds B6 established do not exist.
 *
 *  All of that is gone. Every figure below is carried verbatim from the
 *  simulation, recommendation and risk contracts, and nothing on this page is
 *  computed.
 *
 *  RECOMMENDED IS NOT APPROVED. The record separates four states —
 *  recommended, governed, ready to review, approved — and `approved` is always
 *  false: this project defines no approval criteria, so nothing here can
 *  declare a decision approvable. No approval is executed and no notification
 *  is sent.
 *
 *  NOTHING IS SAVED. `decision_id` is null and the record is assembled per
 *  request; reloading loses it. The page says so rather than implying a store.
 */
export function Decision() {
  const draft = useDecisionDraftStore((s) => s.draft)
  const clearDraft = useDecisionDraftStore((s) => s.clear)
  const record = useDecisionRecord()
  const briefing = useDecisionBriefing()

  // --- B10: durable storage ------------------------------------------------
  const savedDecisionId = useSavedRefsStore((s) => s.decisionId)
  const savedInvestigationId = useSavedRefsStore((s) => s.investigationId)
  const savedScenarioId = useSavedRefsStore((s) => s.scenarioId)
  const rememberDecision = useSavedRefsStore((s) => s.rememberDecision)
  const saveDecision = useSaveDecision()
  /** With nothing carried here, fall back to the last decision THIS browser
   *  stored. The id is a pointer; the record itself comes from the server, so
   *  a cleared cache loses the shortcut and not the decision. */
  const stored = useStoredDecision(!draft && savedDecisionId ? savedDecisionId : null)
  const requested = useRef<string | null>(null)
  const live = useLiveStatus()
  const navigate = useNavigate()

  useEffect(() => {
    if (!draft) {
      requested.current = null
      record.reset()
      return
    }
    if (requested.current === draft.signature) return
    requested.current = draft.signature
    record.mutate({
      context: draft.context,
      simulation: draft.simulation,
      recommendation: draft.recommendation,
      risk: draft.risk,
      weekly: draft.weekly ?? undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.signature])

  /** Render and save both artifacts. Nothing is stored and nothing on this
   *  page changes — success or failure, the record stays exactly as it is. */
  const generateBriefing = (data: DecisionRecord) =>
    briefing.mutate({ record: data }, { onSuccess: (response) => saveBriefing(response) })

  /** The record on screen, whether it was just assembled or read back out of
   *  the store. The stored one is the B7 record byte for byte — the storage
   *  facts live on the envelope beside it, never inside it. */
  const shown: DecisionRecord | undefined = record.data ?? stored.data?.record

  /** Store the decision durably. Decision Center is the system of record.
   *
   *  The record goes to the server exactly as B7 assembled it; the server
   *  mints the id and appends a version. Nothing on this page changes if the
   *  write fails. */
  const persistDecision = () => {
    if (!shown) return
    saveDecision.mutate(
      {
        record: shown,
        investigation_id: savedInvestigationId,
        scenario_id: savedScenarioId,
        ...(stored.data
          ? { decision_id: stored.data.decision_id, expected_version: stored.data.current_version }
          : {}),
      },
      { onSuccess: (saved) => rememberDecision(saved.decision_id, saved.version) },
    )
  }

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Decision Center' }]

  return (
    <AppShell activeKey="decision" crumbs={crumbs}>
      <div className="fade-in flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em]">
              Governed Promotion Decision Center <Icon name="sparkles" className="h-5 w-5 text-brand-violet" />
            </h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            One decision record, assembled from the scenario you carried here — its recommendation,
            its expected impact and its governance position.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/simulation')}>
            <Icon name="flow" /> <span>Back to Simulation</span>
          </Button>
          {/* Disabled until a record exists — there is nothing to put in a
              briefing before one is assembled, and an enabled button would
              imply otherwise. */}
          <Button
            variant="secondary"
            onClick={persistDecision}
            disabled={!shown || saveDecision.isPending}
            title={shown ? undefined : 'Carry a scenario here first'}
          >
            {saveDecision.isPending ? <Spinner /> : <Icon name="checkCircle" />}
            <span>{saveDecision.isPending ? 'Saving…' : 'Save Decision'}</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => shown && generateBriefing(shown)}
            disabled={!shown || briefing.isPending}
            title={shown ? undefined : 'Carry a scenario here first'}
          >
            {briefing.isPending ? <Spinner /> : <Icon name="download" />}
            <span>{briefing.isPending ? 'Generating…' : 'Download briefing'}</span>
          </Button>
        </div>
      </div>

      {saveDecision.isError && (
        <Card className="fade-in mt-4 border-[1.5px] border-[rgba(239,68,68,0.35)]">
          <CardBody>
            <div className="text-[13px] font-bold text-ink-primary">
              Could not save the decision
            </div>
            <div className="mt-1 break-words text-[12.5px] text-ink-secondary">
              {saveDecision.error.message}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-muted">
              The record below is unchanged, and nothing was written.
            </div>
          </CardBody>
        </Card>
      )}

      {saveDecision.isSuccess && !saveDecision.isPending && (
        <StoredBanner stored={saveDecision.data} label="Saved" />
      )}

      {!draft && stored.data && !saveDecision.isSuccess && (
        <StoredBanner stored={stored.data} label="Loaded from the store" />
      )}

      {!draft && stored.data ? (
        <RecordView
          record={stored.data.record}
          briefing={briefing}
          onGenerate={() => generateBriefing(stored.data.record)}
        />
      ) : !draft && stored.isPending && savedDecisionId ? (
        <div className="mt-4 grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-sm text-ink-muted">
            <Spinner />
            <span>Loading the last decision this browser saved…</span>
          </div>
        </div>
      ) : !draft ? (
        <EmptyState onGo={() => navigate('/simulation')} />
      ) : record.isError ? (
        <ErrorState
          message={record.error.message}
          onRetry={() =>
            record.mutate({
              context: draft.context,
              simulation: draft.simulation,
              recommendation: draft.recommendation,
              risk: draft.risk,
              weekly: draft.weekly ?? undefined,
            })
          }
          onDiscard={() => {
            clearDraft()
            navigate('/simulation')
          }}
        />
      ) : record.data ? (
        <RecordView
          record={record.data}
          briefing={briefing}
          onGenerate={() => record.data && generateBriefing(record.data)}
        />
      ) : (
        <div className="mt-4 grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-sm text-ink-muted">
            <Spinner />
            <span>Assembling the decision record…</span>
          </div>
        </div>
      )}
    </AppShell>
  )
}

type BriefingMutation = ReturnType<typeof useDecisionBriefing>

function RecordView({
  record,
  briefing,
  onGenerate,
}: {
  record: DecisionRecord
  briefing: BriefingMutation
  onGenerate: () => void
}) {
  return (
    <>
      <Card className="fade-in mt-4">
        <SummarySection record={record} />
      </Card>

      <div className="mt-[18px] grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 max-[1180px]:grid-cols-1">
        <Card className="fade-in">
          <ImpactSection record={record} />
        </Card>
        <Card className="fade-in">
          <RecommendationSection record={record} />
        </Card>
      </div>

      <Card className="fade-in mt-[18px]">
        <GovernanceSection record={record} />
      </Card>

      <Card className="fade-in mt-[18px]">
        <ReadinessSection record={record} />
      </Card>

      <Card className="fade-in mt-[18px]">
        <WorkflowSection record={record} />
      </Card>

      <Card className="fade-in mt-[18px]">
        <BriefingSection briefing={briefing} onGenerate={onGenerate} />
      </Card>

      <div className="mt-[18px] flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-muted">
        <span>{record.meta.persistence_note}</span>
        <ProvenancePopover record={record} />
      </div>
    </>
  )
}

/** A. What is being decided. */
function SummarySection({ record }: { record: DecisionRecord }) {
  const { scenario, investigation, scope } = record
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            Decision under review
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[17px] font-extrabold text-ink-primary">{scenario.name}</span>
            <span className="text-[12.5px] text-ink-secondary">
              {scenario.treatment} · {scenario.discount_pct}% discount
            </span>
            {scenario.uplift && (
              <span className="text-[11.5px] text-ink-muted">
                {scenario.range_label} {(scenario.uplift.low * 100).toFixed(0)}–
                {(scenario.uplift.high * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <span className="rounded-[4px] bg-surface-muted px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
          Draft · not saved
        </span>
      </div>

      <CardBody>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Field label="Period" value={scope.period} />
          <Field label="Rows in scope" value={scope.row_count?.toLocaleString() ?? null} />
          <Field label="Promoted rows" value={scope.promoted_row_count?.toLocaleString() ?? null} />
          <Field
            label="Investigation"
            value={investigation.investigation_type}
            fallback="Not specified"
          />
          <Field
            label="Investigation ID"
            value={investigation.investigation_id}
            fallback="Not assigned"
            reason={investigation.investigation_id_unavailable_reason}
          />
        </div>

        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            {investigation.question ? 'Investigation question' : 'Investigation'}
          </div>
          {investigation.question ? (
            <div className="mt-1 text-[13px] font-semibold leading-[1.45] text-ink-primary">
              {investigation.question}
            </div>
          ) : (
            <div className="mt-1 flex items-start gap-1.5 text-[12px] leading-[1.45] text-ink-muted">
              <span>
                {investigation.question_source === 'seed_example'
                  ? 'No investigation question — the studio was showing an example, not something you asked.'
                  : 'No investigation question recorded.'}
              </span>
              {investigation.question_unavailable_reason && (
                <InfoPopover label="Why there is no question" title="Investigation question" width={280}>
                  <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
                    {investigation.question_unavailable_reason}
                  </div>
                </InfoPopover>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </>
  )
}

/** C. Expected impact — both ends of the approved range, never a midpoint. */
function ImpactSection({ record }: { record: DecisionRecord }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Expected Impact</h3>
        <span className="text-[11px] text-ink-muted">
          {record.scenario.range_label} · low – high
        </span>
      </div>
      <div className="px-5 py-3">
        {record.expected_impact.map((metric) => (
          <ImpactRow key={metric.metric} metric={metric} />
        ))}
        <div className="mt-2 border-t border-border-subtle pt-2.5 text-[11px] leading-[1.5] text-ink-muted">
          Both ends of the treatment&apos;s approved uplift range are shown. There is no midpoint and
          no expected value between them, and this is not a confidence interval.
        </div>
        <WeeklyNote record={record} />
      </div>
    </>
  )
}

function ImpactRow({ metric }: { metric: DecisionImpactMetric }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="text-[12.5px] text-ink-secondary">{metric.label ?? metric.metric}</span>
      {metric.available ? (
        <span className="text-[13px] font-bold text-ink-primary [font-variant-numeric:tabular-nums]">
          {metric.display_low} – {metric.display_high}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[13px] text-ink-muted">
          —
          {metric.unavailable_reason && (
            <InfoPopover
              label={`Why ${metric.label ?? metric.metric} is unavailable`}
              title={metric.label ?? metric.metric}
              width={272}
            >
              <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
                {metric.unavailable_reason}
              </div>
            </InfoPopover>
          )}
        </span>
      )}
    </div>
  )
}

/** D. Weekly impact — carried if the user had it open, stated honestly if not. */
function WeeklyNote({ record }: { record: DecisionRecord }) {
  if (!record.weekly.available) {
    return (
      <div className="mt-2 text-[11px] leading-[1.5] text-ink-muted">{record.weekly.reason}</div>
    )
  }
  return (
    <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-[1.5] text-ink-muted">
      <Icon name="activity" className="mt-px h-3 w-3 shrink-0" />
      <span>
        Weekly impact was carried with this scenario: {record.weekly.week_count} business weeks.{' '}
        {record.weekly.method}
      </span>
    </div>
  )
}

/** B. The recommendation, verbatim. */
function RecommendationSection({ record }: { record: DecisionRecord }) {
  const { recommendation } = record
  return (
    <>
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Recommendation</h3>
        <span
          className={`rounded-[4px] px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${
            recommendation.is_this_scenario
              ? 'bg-status-success-bg text-status-success'
              : 'bg-surface-muted text-ink-muted'
          }`}
        >
          {recommendation.is_this_scenario ? 'This scenario' : 'Differs'}
        </span>
      </div>
      <CardBody>
        {recommendation.is_this_scenario ? (
          <div className="text-[13px] font-semibold text-ink-primary">
            Recommended under the current decision policy.
          </div>
        ) : (
          <div className="text-[13px] font-semibold text-ink-primary">
            Selected scenario differs from the current recommendation
            {recommendation.recommended_scenario_id
              ? ` (${recommendation.recommended_scenario_id}).`
              : '.'}
          </div>
        )}
        <div className="mt-2 text-[12.5px] leading-[1.6] text-ink-secondary">
          {recommendation.reason}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-ink-muted">
          <span>
            <span className="font-semibold">Policy:</span> v{recommendation.policy_version}
          </span>
          <span>
            <span className="font-semibold">Primary:</span>{' '}
            {recommendation.primary_metric?.replace(/_/g, ' ')} at the{' '}
            {recommendation.primary_endpoint} end
          </span>
        </div>
        <div className="mt-2 text-[11px] leading-[1.5] text-ink-muted">{recommendation.note}</div>
      </CardBody>
    </>
  )
}

/** E. Risk & governance — B6's assessment, verbatim. */
function GovernanceSection({ record }: { record: DecisionRecord }) {
  const { governance } = record
  const tone = {
    clear: 'bg-status-success-bg text-status-success',
    attention: 'bg-status-warning-bg text-status-warning',
    unknown: 'bg-surface-muted text-ink-muted',
  }[governance.overall_status]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold">Risk &amp; Governance</h3>
          <span
            className={`rounded-[4px] px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${tone}`}
          >
            {governance.overall_status}
          </span>
        </div>
        <span className="text-[11px] text-ink-muted">policy v{governance.policy_version}</span>
      </div>
      <CardBody>
        <div className="max-w-[720px] text-[12.5px] leading-[1.6] text-ink-secondary">
          {governance.summary}
        </div>

        <Group label="Findings">
          {governance.findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </Group>

        <Group label="Governance considerations">
          <div className="text-[11px] leading-[1.5] text-ink-muted">
            These boundaries are not defined anywhere in the project, so nothing above is judged
            against them.
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {governance.governance_gaps.map((gap) => (
              <li key={gap.key} className="text-[11.5px] leading-[1.5] text-ink-muted">
                <span className="font-semibold text-ink-secondary">{gap.label}</span> — {gap.statement}
              </li>
            ))}
          </ul>
        </Group>

        <Group label="Method limitations">
          <ul className="flex flex-col gap-1.5">
            {governance.limitations.map((limitation) => (
              <li key={limitation.id} className="text-[11.5px] leading-[1.5] text-ink-muted">
                <span className="font-semibold text-ink-secondary">{limitation.title}</span> —{' '}
                {limitation.statement}
              </li>
            ))}
          </ul>
        </Group>
      </CardBody>
    </>
  )
}

function FindingRow({ finding }: { finding: RiskFinding }) {
  const tone = {
    high: 'bg-status-danger-bg text-status-danger',
    medium: 'bg-status-warning-bg text-status-warning',
    low: 'bg-surface-muted text-ink-muted',
    unknown: 'bg-surface-muted text-ink-muted',
  }[finding.severity]
  return (
    <div className="text-[11.5px] leading-[1.5]">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-ink-primary">{finding.title}</span>
        <span
          className={`rounded-[4px] px-1.5 py-[1px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${tone}`}
        >
          {finding.severity}
        </span>
        <span className="text-[10px] uppercase tracking-[0.04em] text-ink-muted">
          {finding.category.replace('_', ' ')}
        </span>
      </div>
      <div className="mt-0.5 text-ink-muted">{finding.reason}</div>
    </div>
  )
}

/** F. Readiness — why this is not approved. */
function ReadinessSection({ record }: { record: DecisionRecord }) {
  const { readiness } = record
  const states: [string, boolean][] = [
    ['Recommended', readiness.states.recommended],
    ['Governed', readiness.states.governed],
    ['Ready to review', readiness.states.ready_to_review],
    ['Approved', readiness.states.approved],
  ]
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Readiness</h3>
        <span className="rounded-[4px] bg-status-warning-bg px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-status-warning">
          Not ready for approval
        </span>
      </div>
      <CardBody>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {states.map(([label, on]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[12px]">
              <span
                className={`grid h-4 w-4 place-items-center rounded-full [&_svg]:h-2.5 [&_svg]:w-2.5 ${
                  on ? 'bg-status-success-bg text-status-success' : 'bg-surface-muted text-ink-muted'
                }`}
              >
                <Icon name={on ? 'check' : 'x'} />
              </span>
              <span className={on ? 'text-ink-primary' : 'text-ink-muted'}>{label}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-[1.5] text-ink-muted">{readiness.states_note}</div>

        <Group label="Blocking approval">
          <ul className="flex flex-col gap-1.5">
            {readiness.blockers.map((blocker) => (
              <li key={blocker.id} className="text-[11.5px] leading-[1.5] text-ink-secondary">
                <span className="font-semibold text-ink-primary">{blocker.title}</span> —{' '}
                {blocker.detail}
              </li>
            ))}
          </ul>
        </Group>

        {readiness.unverified.length > 0 && (
          <Group label="Unverified before execution">
            <ul className="flex flex-col gap-1">
              {readiness.unverified.map((item) => (
                <li key={item.id} className="text-[11.5px] leading-[1.5] text-ink-muted">
                  <span className="font-semibold text-ink-secondary">{item.title}</span> —{' '}
                  {item.detail}
                  {item.action && <span className="text-ink-secondary"> {item.action}</span>}
                </li>
              ))}
            </ul>
          </Group>
        )}
      </CardBody>
    </>
  )
}

/** The approval workflow, explicitly inactive.
 *
 *  The old version animated five steps and announced that the finance team had
 *  been notified. Nothing was notified. B7 implements no approval and no
 *  notification, so the workflow is shown as the unbuilt thing it is. */
function WorkflowSection({ record }: { record: DecisionRecord }) {
  const steps = ['Submit for approval', 'Finance review', 'Commercial review', 'Final approval', 'Execute promotion']
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Approval workflow</h3>
        <span className="rounded-[4px] bg-surface-muted px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
          Not active
        </span>
      </div>
      <CardBody>
        <div className="flex flex-wrap gap-2">
          {steps.map((step, index) => (
            <span
              key={step}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-surface-muted px-2.5 py-1 text-[11.5px] text-ink-muted"
            >
              <span className="font-bold">{index + 1}</span> {step}
            </span>
          ))}
        </div>
        <div className="mt-3 text-[11.5px] leading-[1.5] text-ink-muted">
          No approval workflow is implemented. Nothing is submitted, no reviewer is notified and no
          promotion is executed from this page. {record.readiness.reason}
        </div>
      </CardBody>
    </>
  )
}

/** What the store knows about this decision — B10.
 *
 *  Three facts and no more: the id a person cites, the version, and whether the
 *  data it was computed from is still the data this server has loaded.
 *
 *  STALE IS REPORTED, NEVER RESOLVED. When the source CSVs have changed since
 *  the save, the banner says so and the values below stay exactly as they were
 *  stored. Nothing is recalculated and nothing is overwritten — a historical
 *  record is worth having precisely because it is historical.
 *
 *  NO OWNER. The store records none, because there is nobody to record. */
function StoredBanner({ stored, label }: { stored: StoredDecision; label: string }) {
  return (
    <Card
      className={`fade-in mt-4 ${
        stored.stale ? 'border-[1.5px] border-[rgba(245,158,11,0.45)]' : ''
      }`}
    >
      <CardBody>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="text-[13px] font-bold text-ink-primary">
            {label} · <span className="font-mono">{stored.decision_id}</span> · version{' '}
            {stored.version}
            {stored.stale && (
              <span className="ml-2 rounded-[4px] bg-status-warning-bg px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-status-warning">
                Stale
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-muted">
            Saved {stored.saved_at} · draft, not approved
          </div>
        </div>
        <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-muted">
          {stored.stale ? stored.stale_reason : stored.owner_note}
        </div>
        <div className="mt-1 font-mono text-[10.5px] text-ink-muted">
          dataset {stored.dataset_version.slice(0, 16)}…
          {stored.stale && <> · current {stored.current_dataset_version.slice(0, 16)}…</>}
        </div>
      </CardBody>
    </Card>
  )
}

/** The portable briefing — B8.
 *
 *  The record is assembled per request and lost on reload, and the review this
 *  decision is heading into happens outside this application. So the one thing
 *  this page can honestly offer is a file: `briefing.html`, which a browser
 *  prints to PDF, and `briefing.json`, which keeps the record machine-readable.
 *
 *  THIS IS NOT A SAVE. Nothing is stored anywhere by downloading; the record on
 *  screen is untouched by success and — deliberately — by failure too. */
function BriefingSection({
  briefing,
  onGenerate,
}: {
  briefing: BriefingMutation
  onGenerate: () => void
}) {
  const generate = onGenerate
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Take this decision with you</h3>
        {briefing.isSuccess && !briefing.isPending && (
          <span className="rounded-[4px] bg-status-success-bg px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-status-success">
            Briefing saved
          </span>
        )}
      </div>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-[560px] text-[12.5px] leading-[1.6] text-ink-secondary">
            Downloads two files: <strong>briefing.html</strong>, a self-contained page you can open
            anywhere and print to PDF, and <strong>briefing.json</strong>, the record itself. Both
            carry exactly what is on this page — and both state that this decision is a draft, not
            approved and not saved.
          </div>
          <Button variant="primary" onClick={generate} disabled={briefing.isPending}>
            {briefing.isPending ? <Spinner /> : <Icon name="download" />}
            <span>{briefing.isPending ? 'Generating…' : 'Download briefing'}</span>
          </Button>
        </div>

        <div className="mt-3 text-[11px] leading-[1.5] text-ink-muted">
          The briefing names no author and no approver: this application has no authentication, so
          it cannot establish who produced or reviewed it. Downloading stores nothing and notifies
          nobody.
        </div>

        {briefing.isError && (
          <div className="mt-3 flex items-start gap-2.5 rounded-[var(--r-md)] border border-[rgba(239,68,68,0.35)] bg-status-danger-bg px-3 py-2.5">
            <Icon name="warning" className="mt-px h-4 w-4 shrink-0 text-status-danger" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-ink-primary">
                Could not generate the briefing
              </div>
              <div className="mt-0.5 break-words text-[11.5px] leading-[1.5] text-ink-secondary">
                {briefing.error.message}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-muted">
                The decision record above is unchanged.
              </div>
              <Button variant="secondary" className="mt-2" onClick={generate}>
                <Icon name="refresh" /> Retry
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1.5 flex flex-col gap-2">{children}</div>
    </div>
  )
}

function Field({
  label,
  value,
  fallback = '—',
  reason,
}: {
  label: string
  value: string | null
  fallback?: string
  reason?: string | null
}) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      {value ? (
        <div className="mt-0.5 text-[13px] font-bold text-ink-primary">{value}</div>
      ) : (
        <div className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-ink-muted">
          {fallback}
          {reason && (
            <InfoPopover label={`Why ${label} is unavailable`} title={label} width={272}>
              <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{reason}</div>
            </InfoPopover>
          )}
        </div>
      )}
    </div>
  )
}

function ProvenancePopover({ record }: { record: DecisionRecord }) {
  const p = record.provenance
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name="info" className="h-3 w-3" />
      How this record was built
      <InfoPopover label="How this record was built" title="Record provenance" width={330}>
        <div className="mt-1 space-y-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
          <div>{p.method}</div>
          <div>
            <span className="font-semibold text-ink-primary">Assembled from:</span>{' '}
            {p.assembled_from.join(', ')}
          </div>
          <div>
            <span className="font-semibold text-ink-primary">KPI engine:</span> {p.kpi_engine}
          </div>
          <div>
            <span className="font-semibold text-ink-primary">Response rule:</span> {p.response_rule}
          </div>
          <div>
            <span className="font-semibold text-ink-primary">Policies:</span> recommendation v
            {p.recommendation_policy_version}, risk v{p.risk_policy_version}
          </div>
        </div>
      </InfoPopover>
    </span>
  )
}

/** Never authored content — the honest state when nothing was carried here. */
function EmptyState({ onGo }: { onGo: () => void }) {
  return (
    <Card className="fade-in mt-4">
      <div className="px-6 py-12 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-muted text-ink-muted [&_svg]:h-5 [&_svg]:w-5">
          <Icon name="checkCircle" />
        </div>
        <div className="text-sm font-bold text-ink-primary">No decision record</div>
        <div className="mx-auto mt-1.5 max-w-[460px] text-[12.5px] leading-[1.55] text-ink-secondary">
          No scenario has been carried here. Run and select a scenario in Simulation Studio, then
          choose Open Decision Center.
        </div>
        <Button variant="primary" className="mt-4" onClick={onGo}>
          <Icon name="flow" /> Go to Simulation Studio
        </Button>
      </div>
    </Card>
  )
}

function ErrorState({
  message,
  onRetry,
  onDiscard,
}: {
  message: string
  onRetry: () => void
  onDiscard: () => void
}) {
  return (
    <Card className="fade-in mt-4 border-[1.5px] border-[rgba(239,68,68,0.35)]">
      <CardBody>
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-status-danger-bg text-status-danger [&_svg]:h-4 [&_svg]:w-4">
            <Icon name="warning" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-ink-primary">
              Could not assemble the decision record
            </div>
            <div className="mt-1 break-words text-[12.5px] text-ink-secondary">{message}</div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={onRetry}>
                <Icon name="refresh" /> Retry
              </Button>
              <Button variant="secondary" onClick={onDiscard}>
                <Icon name="flow" /> Back to Simulation
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
