import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  Pill,
  Spinner,
  Dropdown,
  LiveStatus,
  useLiveStatus,
  useToast,
  useConfirm,
} from '../components/ui'
import { Icon } from '../icons'
import {
  useInvestigationTypes,
  useLegacyInvestigation,
} from '../hooks/useInvestigations'
import { useStartInvestigationRun, useInvestigationRun } from '../hooks/useInvestigationRun'
import { useDatasets } from '../hooks/useDatasets'
import { ApiError } from '../lib/api'
import { ASK_WHY_STATE_KEY, type AskWhyIntent } from '../lib/askWhy'
import { useFocus } from '../hooks/useNav'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { InvestigationGraph } from '../components/investigations/InvestigationGraph'
import { NodeDetailPopover } from '../components/investigations/NodeDetailPopover'
import { BizQuestionCard } from '../components/investigations/BizQuestionCard'
import { AccelList } from '../components/investigations/AccelList'
import { ProgressStrip } from '../components/investigations/ProgressStrip'
import { QueryBar } from '../components/investigations/QueryBar'
import type { Accelerator, OrchNode } from '../types/orchestration'
import type { InvestigationType } from '../types/investigation'

const PROMO_OPTIONS = ['South MT Push (Apr – Jun)', 'North GT Boost', 'Value Pack Bonanza']
const PERIOD_OPTIONS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']
const LAYOUT_OPTIONS = ['Auto Layout', 'Radial', 'Force-directed', 'Hierarchical']

// Ported from js/pages/investigations.js (PageInvestigations.render). Same data shape
// (orchestration.nodes/accelerators/progress/nodeDetails), same interactions (query
// bar -> staged build, node click -> side popover, header dropdowns), state-driven via
// hooks/useEffect timers instead of imperative DOM rebuilds + setInterval choreography.
//
// Question -> type classification used to happen right here, client-side, and fed a
// localStorage-only "recent investigations" list. Both now live on the backend (POST
// /investigations/query — see useSubmitInvestigationQuery) so the classification is a
// single source of truth and the history is shared across browsers/devices. This copy
// stays only as an offline fallback if that request fails outright.
function inferTypeOffline(q: string): InvestigationType {
  const s = (q || '').toLowerCase()
  if (/optimi[sz]e|maximi[sz]e|best plan|allocat|improve roi|lever/.test(s)) return 'optimization'
  if (/launch|new sku|new product|prioriti[sz]e/.test(s)) return 'launch'
  if (/portfolio|channel mix|strategic|fy26|long.?term|growth budget|rebalance/.test(s)) return 'strategic'
  return 'diagnostic'
}

/** The landing state: a prompt, not a pre-baked answer. Example questions come
 *  from the archetype metadata so they stay in step with what the agents can
 *  actually investigate. */
function AskSomething({
  types,
  onPick,
}: {
  types: { key: string; title: string; desc?: string; questions?: string[] }[] | undefined
  onPick: (q: string) => void
}) {
  return (
    <Card className="fade-in mt-4">
      <div className="grid place-items-center gap-2 p-[36px_24px_10px] text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-violet-50 text-brand-violet">
          <Icon name="search" className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-extrabold">Ask a question to start an investigation</h2>
        <p className="max-w-[520px] text-[13px] leading-[1.6] text-ink-muted">
          Specialist agents will pick the analyses your question needs, run them against your data, and report a root
          cause with evidence. Ask in plain English, or start from one of these.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 p-[14px_24px_26px] max-[900px]:grid-cols-1">
        {(types ?? []).map((t) => (
          <div key={t.key} className="rounded-[var(--r-lg)] border border-border-subtle p-[12px_14px]">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{t.title}</div>
            <div className="flex flex-col gap-1.5">
              {(t.questions ?? []).slice(0, 2).map((q) => (
                <button
                  key={q}
                  onClick={() => onPick(q)}
                  className="text-left text-[12.5px] leading-[1.5] text-brand-violet hover:underline"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Shown while the agents are working. Previously this window rendered the
 *  static sample graph, so clicking "investigate" flashed up a finished-looking
 *  result for a different question before the real one arrived. */
function RunningState({
  question,
  specialists,
  stage,
}: {
  question: string
  specialists: { key: string; name: string; desc: string; status: string }[]
  stage?: string
}) {
  const done = specialists.filter((s) => s.status === 'done').length
  const pct = specialists.length ? Math.round((done / specialists.length) * 100) : 0
  return (
    <Card className="fade-in mt-4">
      <div className="border-b border-border-subtle p-[16px_20px]">
        <div className="flex items-center gap-2.5">
          <Spinner className="h-4 w-4 text-brand-violet" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold">
              {stage === 'planning' || !specialists.length
                ? 'Planning the investigation…'
                : `Specialist agents running — ${done} of ${specialists.length} complete`}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-ink-muted">{question}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-[3px] bg-surface-muted">
          <div className="h-full rounded-[3px] bg-brand-violet transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {specialists.length > 0 ? (
        <div className="flex flex-col">
          {specialists.map((sp) => (
            <div key={sp.key} className="flex items-center gap-3 border-b border-border-subtle p-[12px_20px] last:border-b-0">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  sp.status === 'done'
                    ? 'bg-status-success'
                    : sp.status === 'running'
                      ? 'animate-[pulseDot_1.2s_ease-in-out_infinite] bg-brand-violet'
                      : 'bg-border-strong'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{sp.name}</div>
                <div className="text-[11.5px] text-ink-muted">{sp.desc}</div>
              </div>
              <span
                className={`shrink-0 text-[11.5px] font-semibold ${
                  sp.status === 'done' ? 'text-status-success' : sp.status === 'running' ? 'text-brand-violet' : 'text-ink-muted'
                }`}
              >
                {sp.status === 'done' ? 'Completed' : sp.status === 'running' ? 'Running' : 'Queued'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-[18px_20px] text-[12.5px] leading-[1.6] text-ink-muted">
          Choosing which specialists this question needs, and the scope they should analyse.
        </div>
      )}
    </Card>
  )
}

/** The question was outside what promotion data can answer. Saying so is far
 *  better than the previous behaviour, which attached real ROI figures to
 *  whatever the question named — "Who is shahrukh khan" returned a confident
 *  root cause about his promotions. */
function OutOfScope({ question, reason, onReset }: { question: string; reason: string; onReset: () => void }) {
  return (
    <Card className="fade-in mt-4">
      <div className="grid place-items-center gap-3 p-[36px_24px] text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-status-warning-bg text-status-warning">
          <Icon name="info" className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-extrabold">That's outside what this data can answer</h2>
        <p className="max-w-[540px] text-[13px] leading-[1.6] text-ink-muted">{reason}</p>
        <p className="max-w-[540px] text-[12px] italic leading-[1.5] text-ink-disabled">You asked: "{question}"</p>
        <button
          onClick={onReset}
          className="mt-1 rounded-[var(--r-md)] bg-brand-violet px-4 py-2 text-[13px] font-semibold text-white"
        >
          Ask something else
        </button>
      </div>
    </Card>
  )
}

type AccelState = 'queued' | 'progress' | 'done'

export function Investigations() {
  const { activeType, activeQuestion, setActive } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const { data: legacy } = useLegacyInvestigation()
  const { data: focus } = useFocus()
  const { show } = useToast()
  const confirm = useConfirm()
  const live = useLiveStatus()

  // Real agent run against an uploaded dataset. When one is active its
  // orchestration replaces the static per-archetype JSON below.
  const { data: datasets } = useDatasets()
  const startRun = useStartInvestigationRun()
  const [runId, setRunId] = useState<string | undefined>(undefined)
  const [datasetId, setDatasetId] = useState<string | undefined>(undefined)
  const { data: run } = useInvestigationRun(runId)
  // `undefined` means the built-in TPO star schema — the same data the Command
  // Center reports on, so both tabs agree. Uploads are the alternative source.
  const selectedDataset = datasets?.find((d) => d.id === datasetId)
  const sourceLabel = selectedDataset
    ? `${selectedDataset.filename} · ${selectedDataset.rows.toLocaleString()} rows`
    : 'TPO star schema (built-in)'
  const liveOrch = run?.status === 'done' ? run.result?.orchestration : undefined

  // An "Ask why" handoff from the Command Center arrives as router state.
  const location = useLocation()
  const intent = (location.state as Record<string, unknown> | null)?.[ASK_WHY_STATE_KEY] as
    | AskWhyIntent
    | undefined

  // Nothing is rendered until the user actually asks something. Opening the
  // page from the sidebar used to show a hardcoded question and a sample graph
  // — an answer to a question nobody asked.
  const [hasAsked, setHasAsked] = useState(Boolean(intent))
  const [handoffLabel, setHandoffLabel] = useState<string | undefined>(intent?.sourceLabel)

  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  const [queryInput, setQueryInput] = useState(activeQuestion)
  useEffect(() => setQueryInput(activeQuestion), [activeQuestion])

  const [promo, setPromo] = useState(PROMO_OPTIONS[0])
  const [period, setPeriod] = useState('Q2 FY25')
  const [layout, setLayout] = useState('Auto Layout')

  const [submitting, setSubmitting] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string> | undefined>(undefined)
  const timers = useRef<number[]>([])
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const [popover, setPopover] = useState<{ node: OrchNode; el: HTMLElement } | null>(null)

  // Reveal the agent-produced nodes once a run finishes.
  useEffect(() => {
    if (!liveOrch) return
    clearTimers()
    const keys = new Set<string>()
    setRevealedKeys(new Set(keys))
    liveOrch.nodes.forEach((n, i) => {
      after(90 + i * 130, () => {
        keys.add(n.key)
        setRevealedKeys(new Set(keys))
      })
    })
    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOrch])

  const legend = legacy?.legend ?? []

  // Always a real agent run. Omitting dataset_id investigates the built-in
  // star schema; passing one investigates that uploaded file.
  const launch = (q: string) => {
    setRunId(undefined)
    setHasAsked(true)
    setSubmitting(true)
    startRun.mutate(
      { question: q, dataset_id: datasetId ?? null },
      {
        onSuccess: (started) => {
          setSubmitting(false)
          setRunId(started.id)
          setActive(inferTypeOffline(q), q)
          show(`Analysing ${sourceLabel} — specialist agents running…`, { duration: 3000 })
        },
        onError: (e) => {
          setSubmitting(false)
          show(e instanceof ApiError ? e.message : "Couldn't start the investigation.", { duration: 4000 })
        },
      },
    )
  }

  const runQuery = () => {
    const q = queryInput.trim()
    if (!q) {
      show('Type a question for TIQ to investigate', { duration: 2000 })
      return
    }
    launch(q)
  }

  // Arriving from "Ask why": fill the question in and start immediately. The
  // user already expressed intent by clicking the alert; making them press
  // enter again would be asking twice. Guarded on the intent's question so a
  // re-render or a second handoff can't re-trigger the same run.
  const launchedIntentRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!intent?.question || launchedIntentRef.current === intent.question) return
    launchedIntentRef.current = intent.question
    setQueryInput(intent.question)
    setHandoffLabel(intent.sourceLabel)
    if (intent.autoRun) launch(intent.question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.question])

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Investigations' }]

  if (!typeMeta) {
    return (
      <AppShell activeKey="investigations" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Investigations…</div>
      </AppShell>
    )
  }

  // A finished agent run's orchestration takes precedence over the static
  // per-archetype sample; everything below renders from `view` either way,
  // since the backend assembles agent results into this exact shape.
  // Only ever the live run. Falling back to the static sample here made the
  // old hardcoded graph flash up while a real investigation was still running.
  const view = liveOrch
  const isAgentRun = Boolean(liveOrch)
  const running = run?.status === 'running'

  // While the pipeline runs, accelerator rows mirror real specialist state
  // instead of the old timer-driven cascade.
  const runAccelerators: Accelerator[] | null = run?.specialists?.length
    ? run.specialists.map((s) => ({
        key: s.key,
        name: s.name,
        desc: s.desc,
        // Base status is only a fallback — statusOverride below is what AccelList
        // actually renders, and it carries the real three-state progress.
        status: s.status === 'done' ? ('Completed' as const) : ('In Progress' as const),
        icon: s.icon,
        tone: 'success' as const,
        node: s.key,
      }))
    : null
  const runAccelState: Record<string, AccelState> | undefined = run?.specialists?.length
    ? Object.fromEntries(
        run.specialists.map((s) => [
          s.key,
          s.status === 'done' ? 'done' : s.status === 'running' ? 'progress' : 'queued',
        ]),
      )
    : undefined

  const agentProgress = run
    ? {
        pct:
          run.status === 'done'
            ? 100
            : Math.round(
                ((run.specialists?.filter((s) => s.status === 'done').length ?? 0) /
                  Math.max(1, run.specialists?.length ?? 1)) *
                  100,
              ),
        insights: run.result?.synthesis.insight_count ?? 0,
        sub:
          run.status === 'error'
            ? (run.error ?? 'Investigation failed')
            : run.status === 'done'
              ? `${run.specialists?.length ?? 0} specialist agents completed`
              : run.stage === 'planning'
                ? 'Planning analysis — mapping your dataset…'
                : `${run.specialists?.filter((s) => s.status === 'done').length ?? 0} of ${run.specialists?.length ?? 0} agents completed`,
      }
    : null

  // Progress comes from the run itself; there is no simulated fallback any more.
  const progress = agentProgress ?? {
    pct: view?.progress.pct ?? 0,
    insights: view?.progress.insights ?? 0,
    sub: view ? `${view.progress.completed} of ${view.progress.total} accelerators completed` : '',
  }

  return (
    <AppShell activeKey="investigations" crumbs={crumbs}>
      <div className="fade-in flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em]">
              Promotion Investigation Workspace <Icon name="sparkles" className="h-5 w-5 text-brand-violet" />
            </h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            {/* Agent count only means something once a run has produced one —
                "0 specialist agents orchestrated" reads like a failure. */}
            Investigation Compression Engine
            {(() => {
              const count = (runAccelerators ?? view?.accelerators ?? []).length
              if (!hasAsked) return ' · ask a question to begin'
              if (!count) return ' · composing the specialist team…'
              return (
                <>
                  {' · '}
                  <strong className="text-brand-violet">{typeMeta.title}</strong> mode · {count} specialist agents
                  orchestrated
                </>
              )
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            selected={promo}
            options={PROMO_OPTIONS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPromo(val)
              show(`Investigation context → ${val.split(' (')[0]}`)
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
          <IconButton
            icon="arrowUpRight"
            title="Share"
            onClick={() =>
              confirm({
                title: 'Share Investigation',
                body: 'Send a read-only link with current filters and findings.',
                primaryText: 'Copy Link & Share',
                icon: 'arrowUpRight',
                // B8: this announced a share that never happened. Nothing is
                // sent from here and no link is copied.
                onConfirm: () => show('Sharing is not yet available', { duration: 3000 }),
              })
            }
          />
          <Dropdown
            selected=""
            // "Export to PDF" WAS HERE AND HAS BEEN REMOVED. Investigations is
            // served from authored content in app/data/investigations.json, not
            // from the validated KPI engine, so there is no authoritative result
            // for a report to be generated from. Offering the item and answering
            // with a toast advertised a capability this module cannot honestly
            // provide; the modules that do have computed results carry the real
            // Export Report control instead.
            options={[{ label: 'Duplicate investigation' }, { label: 'Archive' }]}
            onSelect={(val) => show(`${val} is not yet available`)}
            trigger={<IconButton icon="more" title="More" />}
          />
        </div>
      </div>

      <div className="mt-4">
        <QueryBar
          value={queryInput}
          onChange={setQueryInput}
          onSubmit={runQuery}
          loading={submitting || running}
          loadingLabel={running ? 'Specialist agents analysing your data…' : `Composing ${typeMeta.title} agents…`}
        />
      </div>

      {/* Which uploaded dataset the agents analyse. Without one there's nothing
          real to investigate, so the page falls back to the sample orchestration. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
        <Icon name="database" className="h-3.5 w-3.5" />
        <span>Analysing</span>
        <Dropdown
          selected={datasetId ?? 'star'}
          options={[
            { label: 'TPO star schema (built-in)', value: 'star' },
            ...(datasets ?? []).map((d) => ({
              label: `${d.filename} · ${d.rows.toLocaleString()} rows`,
              value: d.id,
            })),
          ]}
          onSelect={(val) => setDatasetId(val === 'star' ? undefined : val)}
          trigger={
            <Button variant="ghost" size="sm" className="cursor-pointer">
              {sourceLabel} <Icon name="chevronDown" />
            </Button>
          }
        />
        {handoffLabel && <Pill tone="violet">{handoffLabel}</Pill>}
        {isAgentRun && <Pill tone="success">Live agent analysis</Pill>}
        {!datasets?.length && (
          <Link to="/home" className="font-semibold text-brand-violet">
            Upload your own data →
          </Link>
        )}
      </div>

      {run?.status === 'error' && (
        <div className="mt-3 rounded-[var(--r-md)] bg-status-danger-bg p-[10px_14px] text-[12.5px] text-[#B91C1C]">
          Investigation failed — {run.error}
        </div>
      )}

      {run?.status === 'done' && run.result && (
        <Card className="fade-in mt-3.5">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                <Icon name="sparkles" className="h-4 w-4 text-brand-violet" /> Agent Findings
              </span>
            }
            actions={<Pill tone="violet">{run.result.synthesis.confidence}% confidence</Pill>}
          />
          <div className="flex flex-col gap-2.5 p-5 pt-3.5">
            <p className="text-[13.5px] leading-[1.6] text-ink-secondary">{run.result.synthesis.summary}</p>
            <div className="rounded-[var(--r-md)] border border-[rgba(124,92,255,0.2)] bg-brand-violet-50 p-[10px_14px]">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">Root cause</div>
              <div className="mt-1 text-[13px] font-semibold text-ink-primary">{run.result.synthesis.root_cause}</div>
            </div>
            {run.result.synthesis.recommendations.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                  Recommended actions
                </div>
                <ul className="flex flex-col gap-1.5">
                  {run.result.synthesis.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[1.5] text-ink-secondary">
                      <Icon name="checkCircle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {!hasAsked ? (
        <AskSomething types={types} onPick={(q) => { setQueryInput(q); launch(q) }} />
      ) : run?.status === 'done' && run.result && run.result.answerable === false ? (
        <OutOfScope
          question={run.question}
          reason={run.result.refusal ?? ''}
          onReset={() => {
            setRunId(undefined)
            setHasAsked(false)
            setQueryInput('')
            setHandoffLabel(undefined)
          }}
        />
      ) : !view ? (
        <RunningState
          question={queryInput || activeQuestion}
          specialists={run?.specialists ?? []}
          stage={run?.stage}
        />
      ) : (
        <>
      <BizQuestionCard typeMeta={typeMeta} question={activeQuestion} contextChips={view.contextChips} />

      <div className="grid grid-cols-[1.7fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Investigation Graph <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </span>
            }
            actions={
              <div className="flex items-center gap-1.5">
                <Dropdown
                  selected={layout}
                  options={LAYOUT_OPTIONS.map((o) => ({ label: o }))}
                  onSelect={(val) => {
                    setLayout(val)
                    show(`Graph layout: ${val}`)
                  }}
                  trigger={
                    <Button variant="ghost" size="sm" className="cursor-pointer">
                      {layout} <Icon name="chevronDown" />
                    </Button>
                  }
                />
                <IconButton icon="zoomOut" title="Zoom out" onClick={() => show('Zoom: 80%')} />
                <IconButton icon="expand" title="Fit" onClick={() => show('Fit to screen')} />
                <IconButton icon="fullscreen" title="Fullscreen" onClick={() => show('Fullscreen mode')} />
              </div>
            }
          />
          <InvestigationGraph
            center={view.center}
            nodes={view.nodes}
            legend={legend}
            revealedKeys={revealedKeys}
            onNodeClick={(node, el) => setPopover({ node, el })}
          />
        </Card>

        <Card className="fade-in">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Active Accelerators <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </span>
            }
            actions={<Pill tone="violet">{typeMeta.title}</Pill>}
          />
          <div className="px-4.5 py-1">
            <AccelList
              accelerators={runAccelerators ?? view.accelerators}
              statusOverride={runAccelState}
              onSelect={(a) => show(`Opening "${a.name}" details...`)}
            />
          </div>
          <div className="border-t border-border-subtle px-5 py-3">
            <button
              onClick={() => show('Opening full accelerator catalog (16 available)')}
              className="text-[13px] font-semibold text-brand-violet"
            >
              View All Accelerators →
            </button>
          </div>
        </Card>
      </div>

      <ProgressStrip
        pct={progress.pct}
        sub={progress.sub}
        insights={progress.insights}
        sources={view.progress.sources}
      />

        </>
      )}

      {popover && view && (
        <NodeDetailPopover
          node={popover.node}
          detail={view.nodeDetails[popover.node.key]}
          anchorEl={popover.el}
          onClose={() => setPopover(null)}
        />
      )}
    </AppShell>
  )
}
