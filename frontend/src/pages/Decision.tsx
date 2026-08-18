import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, IconButton, Card, CardHeader, Pill, Textarea, Dropdown, LiveStatus, useLiveStatus, useToast, useConfirm, Table, Th, Td } from '../components/ui'
import { Icon, type IconName } from '../icons'
import { useInvestigationTypes } from '../hooks/useInvestigations'
import { useDecisionPage } from '../hooks/useDecision'
import { useFocus } from '../hooks/useNav'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { ActiveInvBanner } from '../components/investigations/ActiveInvBanner'
import type { WorkflowStep } from '../types/decision'

const PROMO_OPTIONS = ['South MT Push (Apr – Jun)', 'North GT Boost', 'Value Pack Bonanza']
const PERIOD_OPTIONS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']

type StepState = 'ready' | 'pending' | 'not-started' | 'in-progress' | 'done'

// Ported from js/pages/decision.js (PageDecision.render).
export function Decision() {
  const { activeType, activeQuestion } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const { data: D, isLoading } = useDecisionPage(activeType)
  const { data: focus } = useFocus()
  const { show } = useToast()
  const confirm = useConfirm()
  const live = useLiveStatus()
  const navigate = useNavigate()
  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  const [promo, setPromo] = useState(PROMO_OPTIONS[0])
  const [period, setPeriod] = useState('Q2 FY25')
  const [notes, setNotes] = useState('')
  const [stepStates, setStepStates] = useState<Record<number, StepState> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Decision Center' }]

  if (isLoading || !D || !typeMeta) {
    return (
      <AppShell activeKey="decision" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Decision Center…</div>
      </AppShell>
    )
  }

  const stateFor = (s: WorkflowStep): StepState => stepStates?.[s.step] ?? (s.status === 'Ready' ? 'ready' : s.status === 'Pending' ? 'pending' : 'not-started')
  const labelFor = (s: WorkflowStep, state: StepState) =>
    state === 'in-progress' ? 'In Progress' : state === 'done' ? (s.step === 1 ? 'Submitted' : 'Approved') : s.status

  const triggerApproval = () => {
    setSubmitting(true)
    setLastSaved('just now by Sanjay Kumar')
    window.setTimeout(() => {
      const advance = (idx: number) => {
        if (idx >= D.workflow.length) {
          setSubmitting(false)
          show('Approval workflow triggered · Finance team notified', { duration: 3500 })
          return
        }
        setStepStates((prev) => ({ ...prev, [idx + 1]: 'in-progress' }))
        window.setTimeout(() => {
          setStepStates((prev) => ({ ...prev, [idx + 1]: 'done' }))
          advance(idx + 1)
        }, 900)
      }
      advance(0)
    }, 600)
  }

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
          <p className="mt-1.5 text-sm text-ink-muted">Review and approve the recommended promotion strategy</p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            selected={promo}
            options={PROMO_OPTIONS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPromo(val)
              show(`Plan focus → ${val.split(' (')[0]}`)
            }}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                <Icon name="calendar" /> <span>{promo}</span> <Icon name="chevronDown" />
              </Button>
            }
          />
          <Dropdown
            selected={period}
            options={PERIOD_OPTIONS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPeriod(val)
              show(`Period → ${val}`)
            }}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                <span>{focus?.quarter ?? period}</span> <Icon name="chevronDown" />
              </Button>
            }
          />
          <Button
            variant="secondary"
            onClick={() =>
              confirm({
                title: 'Export Recommended Plan',
                body: 'Generate a fully-formatted PDF with strategy, expected impact, governance and scenario comparison.',
                icon: 'download',
                primaryText: 'Generate PDF',
                onConfirm: () => show('Plan exported · "Q2_SouthMT_OptimizedPlan_v1.2.pdf" downloaded', { duration: 3500 }),
              })
            }
          >
            <Icon name="download" /> Export Plan
          </Button>
          <Dropdown
            selected=""
            options={[{ label: 'Duplicate plan' }, { label: 'View version history' }, { label: 'Discard changes' }]}
            onSelect={(val) => show(`${val} — done`)}
            trigger={<IconButton icon="more" />}
          />
        </div>
      </div>

      <div className="mt-4">
        <ActiveInvBanner
          typeMeta={typeMeta}
          question={activeQuestion}
          proceedTo="/command"
          proceedLabel="Back to Command Center"
          proceedIcon="home"
        />
      </div>

      <div className="mb-4 grid grid-cols-[48px_1fr_auto] items-center gap-4 rounded-[var(--r-lg)] border border-[rgba(16,185,129,0.25)] bg-[linear-gradient(135deg,var(--status-success-bg),white_70%)] p-[14px_22px]">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-status-success text-white [&_svg]:h-[22px] [&_svg]:w-[22px]">
          <Icon name="target" />
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">Recommended Plan</div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span className="rounded-[var(--r-sm)] bg-status-success-bg px-2.5 py-[3px] text-[15px] font-extrabold text-ink-primary">
              {D.recommendedPlan.scenarioName}
            </span>
            <span className="text-[13px] text-ink-secondary">{D.recommendedPlan.summary}</span>
          </div>
        </div>
        <button onClick={() => navigate('/simulation')} className="whitespace-nowrap text-[13px] font-semibold text-brand-violet">
          View Scenario Details →
        </button>
      </div>

      <div className="mb-4 grid grid-cols-[1fr_1.1fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader title="Recommended Promotion Strategy" />
          <div className="flex flex-col px-5 py-1">
            {D.strategy.map((s) => (
              <div key={s.label} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-dashed border-border-subtle py-3 last:border-b-0">
                <div className="grid h-7 w-7 place-items-center rounded-[7px] bg-brand-violet-50 text-brand-violet [&_svg]:h-3.5 [&_svg]:w-3.5">
                  <Icon name={s.icon as IconName} />
                </div>
                <div className="text-[12.5px] text-ink-secondary">{s.label}</div>
                <div className="text-right">
                  <div className="text-[13px] font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">{s.value}</div>
                  <div className="text-[11px] text-ink-muted">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="fade-in">
          <CardHeader title={<span>Expected Business Impact <span className="text-xs font-normal text-ink-muted">(vs Current Plan)</span></span>} />
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2.5">
              {D.impact.map((i) => (
                <div key={i.label} className="rounded-[var(--r-md)] bg-surface-muted p-[12px_14px]">
                  <div className="text-[11px] font-semibold text-ink-muted">{i.label}</div>
                  <div className="mt-1 text-lg font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">{i.value}</div>
                  <div
                    className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold [&_svg]:h-2.5 [&_svg]:w-2.5 ${
                      i.tone === 'success' || i.trend === 'up' ? 'text-status-success' : 'text-status-danger'
                    }`}
                  >
                    <Icon name={i.trend === 'down' ? 'arrowDown' : 'arrowUp'} />
                    <strong>{i.delta}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-[var(--r-md)] border border-[rgba(124,92,255,0.2)] bg-[linear-gradient(135deg,rgba(124,92,255,0.06),rgba(79,124,255,0.04))] p-[10px_14px] text-[12.5px] leading-[1.5] text-ink-secondary [&_svg]:mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_svg]:text-brand-violet">
              <Icon name="sparkles" />
              <span>{D.impactNote}</span>
            </div>
          </div>
        </Card>

        <Card className="fade-in">
          <CardHeader title="Governance & Policy Validation" />
          <div className="px-4.5 py-1.5">
            {D.governance.map((g) => (
              <div key={g.label} className="grid grid-cols-[32px_1fr_auto] items-center gap-2.5 border-b border-dashed border-border-subtle py-2.5 last:border-b-0">
                <div
                  className="grid h-8 w-8 place-items-center rounded-[9px] [&_svg]:h-4 [&_svg]:w-4"
                  style={{
                    background: g.tone === 'success' ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                    color: g.tone === 'success' ? 'var(--status-success)' : 'var(--status-warning)',
                  }}
                >
                  <Icon name={g.icon as IconName} />
                </div>
                <div>
                  <div className="text-[12.5px] font-bold text-ink-primary">{g.label}</div>
                  <div className="text-[11px] text-ink-muted">{g.sub}</div>
                </div>
                <Pill tone={g.tone}>
                  {g.status} {g.tone === 'success' ? '✓' : '⚠'}
                </Pill>
              </div>
            ))}
            <div className="pb-3 pt-2">
              <button
                onClick={() =>
                  confirm({
                    title: 'Governance Policy Details',
                    body: 'Your organization has 14 active TPO policy rules across Budget, Margin, Trade Policy, Inventory, Cannibalization and Data Confidence. The current plan satisfies 13 of 14 rules with 1 in Medium status (Cannibalization).',
                    icon: 'shield',
                    primaryText: 'View Full Policy Document',
                    secondaryText: 'Close',
                    onConfirm: () => show('Opening policy document...'),
                  })
                }
                className="text-[13px] font-semibold text-brand-violet"
              >
                View Policy Details →
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[1fr_1.2fr] gap-4 max-[1280px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader title="Scenario Summary" />
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Metric</Th>
                  <Th>
                    Current Plan
                    <br />
                    <span className="text-xs font-normal normal-case text-ink-muted">(Scenario 1)</span>
                  </Th>
                  <Th className="!bg-status-success-bg">
                    <Pill tone="success" className="mb-1">
                      Recommended Plan
                    </Pill>
                    <br />
                    <span className="text-xs font-normal normal-case text-ink-muted">(Scenario 2)</span>
                  </Th>
                  <Th>
                    Aggressive Growth
                    <br />
                    <span className="text-xs font-normal normal-case text-ink-muted">(Scenario 3)</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {D.scenarioSummary.map((r) => (
                  <tr key={r.metric}>
                    <Td>
                      <Icon name={r.icon as IconName} className="mr-2 inline h-3.5 w-3.5 text-brand-violet" />
                      {r.metric}
                    </Td>
                    <Td>{r.s1}</Td>
                    <Td className="bg-[rgba(16,185,129,0.08)] font-extrabold">{r.s2}</Td>
                    <Td>{r.s3}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="border-t border-border-subtle px-5 py-3">
            <button onClick={() => navigate('/simulation')} className="text-[13px] font-semibold text-brand-violet">
              View Full Comparison →
            </button>
          </div>
        </Card>

        <Card className="fade-in">
          <CardHeader title="Approval & Workflow" />
          <div className="p-5">
            <div className="mb-3.5 flex items-start justify-between gap-2 overflow-x-auto border-b border-border-subtle pb-4">
              {D.workflow.map((s, i) => {
                const state = stateFor(s)
                const circleCls =
                  state === 'ready' || state === 'done'
                    ? 'bg-status-success text-white border-status-success'
                    : state === 'in-progress'
                      ? 'animate-[pulseDot_1.2s_ease-in-out_infinite] border-brand-violet bg-brand-violet text-white'
                      : 'border-border-default bg-surface-muted text-ink-muted'
                const statusCls = state === 'ready' || state === 'done' ? 'text-status-success font-bold' : state === 'in-progress' ? 'text-brand-violet font-bold' : 'text-ink-muted'
                return (
                  <div key={s.step} className="relative min-w-[110px] flex-1 text-center">
                    {i < D.workflow.length - 1 && (
                      <div className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-4 h-0.5 ${state === 'done' ? 'bg-status-success' : 'bg-border-default'}`} />
                    )}
                    <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-extrabold ${circleCls}`}>
                      {s.step}
                    </div>
                    <div className="mt-1.5 text-[11px] font-bold leading-[1.3] text-ink-primary">{s.label}</div>
                    <div className={`mt-0.5 text-[10px] ${statusCls}`}>{labelFor(s, state)}</div>
                  </div>
                )
              })}
            </div>

            <div className="relative mb-3.5">
              <label className="mb-1.5 block text-xs font-semibold text-ink-secondary">
                Add Notes <span className="text-ink-muted">(optional)</span>
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                maxLength={500}
                placeholder="Type your notes here..."
                className="min-h-[78px] pb-6"
              />
              <div className="pointer-events-none absolute bottom-2 right-2.5 text-[11px] text-ink-muted [font-variant-numeric:tabular-nums]">
                {notes.length} / 500
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  confirm({
                    title: 'Share Recommended Plan',
                    body: 'Share with stakeholders. They will see the plan, expected impact and governance status. Approval rights remain with Sanjay Kumar.',
                    icon: 'users',
                    primaryText: 'Share with Trade Team (8 people)',
                    onConfirm: () => show('Plan shared · 8 stakeholders notified via email + Slack', { duration: 3000 }),
                  })
                }
              >
                <Icon name="users" /> Share Plan
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  confirm({
                    title: 'Send to Finance for Review',
                    body: 'Route the plan to Finance for budget validation. Average turnaround: 24 hours.',
                    icon: 'arrowUpRight',
                    primaryText: 'Send to Finance',
                    onConfirm: () => show('Sent to Finance · Priya K. and Vikram T. notified', { duration: 3000 }),
                  })
                }
              >
                <Icon name="arrowUpRight" /> Send to Finance
              </Button>
              <Button variant="primary" onClick={triggerApproval} disabled={submitting}>
                <Icon name={submitting ? 'clock' : 'checkCircle'} /> {submitting ? 'Submitting...' : 'Trigger Approval Workflow'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3.5 rounded-[var(--r-md)] bg-surface-muted p-[12px_18px] text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="shield" className="h-3.5 w-3.5" /> All decisions are logged and versioned for audit and compliance.
        </span>
        <span className="text-sm text-ink-muted">Last saved: {lastSaved ?? D.lastSaved}</span>
        <Pill tone="neutral">Version {D.version}</Pill>
      </div>
    </AppShell>
  )
}
