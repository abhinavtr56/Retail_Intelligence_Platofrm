import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  Pill,
  Dropdown,
  LiveStatus,
  useLiveStatus,
  useToast,
  useConfirm,
} from '../components/ui'
import { Icon } from '../icons'
import {
  useInvestigationTypes,
  useOrchestration,
  useLegacyInvestigation,
} from '../hooks/useInvestigations'
import { useStartInvestigationRun, useInvestigationRun } from '../hooks/useInvestigationRun'
import { useDatasets } from '../hooks/useDatasets'
import { ApiError } from '../lib/api'
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

type AccelState = 'queued' | 'progress' | 'done'

export function Investigations() {
  const { activeType, activeQuestion, setActive } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const { data: orch, isLoading } = useOrchestration(activeType)
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

  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  const [queryInput, setQueryInput] = useState(activeQuestion)
  useEffect(() => setQueryInput(activeQuestion), [activeQuestion])

  const [promo, setPromo] = useState(PROMO_OPTIONS[0])
  const [period, setPeriod] = useState('Q2 FY25')
  const [layout, setLayout] = useState('Auto Layout')

  const [submitting, setSubmitting] = useState(false)
  const [building, setBuilding] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string> | undefined>(undefined)
  const [accelState, setAccelState] = useState<Record<string, AccelState> | undefined>(undefined)
  const [liveProgress, setLiveProgress] = useState<{ pct: number; insights: number; sub: string; confidence: number } | null>(null)
  const timers = useRef<number[]>([])
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const [popover, setPopover] = useState<{ node: OrchNode; el: HTMLElement } | null>(null)

  // Staged build choreography — runs once per `building` toggle-on, keyed to `orch`.
  useEffect(() => {
    clearTimers()
    if (!orch) return

    if (!building) {
      // Static reveal: quick cascade so the page never looks frozen, real statuses.
      setAccelState(undefined)
      setLiveProgress(null)
      const keys = new Set<string>()
      setRevealedKeys(new Set(keys))
      orch.nodes.forEach((n, i) => {
        after(80 + i * 55, () => {
          keys.add(n.key)
          setRevealedKeys(new Set(keys))
        })
      })
      return () => clearTimers()
    }

    // Building: baseline (non-accelerator) nodes trickle in, then each accelerator
    // "runs" and reveals its linked node, pacing matches the original (5s/accelerator).
    const revealed = new Set<string>()
    setRevealedKeys(new Set())
    const accKeys = new Set(orch.accelerators.map((a) => a.node).filter(Boolean) as string[])
    const baseline = orch.nodes.filter((n) => !accKeys.has(n.key))
    const initialState: Record<string, AccelState> = {}
    orch.accelerators.forEach((a) => (initialState[a.key] = 'queued'))
    setAccelState(initialState)
    setLiveProgress({ pct: 0, insights: 0, sub: 'TIQ is orchestrating specialist agents…', confidence: 0 })

    baseline.forEach((n, i) => {
      after(400 + i * 450, () => {
        revealed.add(n.key)
        setRevealedKeys(new Set(revealed))
      })
    })

    const ACC_STEP = 5000
    const ACC_RUN = 4500
    const total = orch.accelerators.length
    orch.accelerators.forEach((a, i) => {
      const start = 900 + i * ACC_STEP
      after(start, () => {
        setAccelState((s) => ({ ...s, [a.key]: 'progress' }))
        if (a.node) {
          revealed.add(a.node)
          setRevealedKeys(new Set(revealed))
        }
      })
      after(start + ACC_RUN, () => {
        setAccelState((s) => ({ ...s, [a.key]: 'done' }))
        const done = i + 1
        const pct = Math.round((done / total) * 100)
        const insights = Math.round((orch.progress.insights * done) / total)
        const confidence = Math.round((orch.progress.confidence * done) / total)
        setLiveProgress({ pct, insights, sub: `${done} of ${total} accelerators completed`, confidence })
      })
    })

    const finishAt = 900 + (total - 1) * ACC_STEP + ACC_RUN + 700
    after(finishAt, () => {
      setBuilding(false)
      setLiveProgress({
        pct: 100,
        insights: orch.progress.insights,
        sub: `${total} of ${total} accelerators completed`,
        confidence: orch.progress.confidence,
      })
      live.reset()
      show(`Investigation complete — ${orch.progress.insights} insights identified · ${orch.progress.confidence}% confidence`, {
        duration: 3500,
      })
    })

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orch, building])

  // Reveal agent-produced nodes as they arrive. The cascade above is keyed to
  // the static orchestration, so without this a finished run would render its
  // graph with every node still hidden.
  useEffect(() => {
    if (!liveOrch) return
    clearTimers()
    setBuilding(false)
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

  const runQuery = () => {
    const q = queryInput.trim()
    if (!q) {
      show('Type a question for TIQ to investigate', { duration: 2000 })
      return
    }

    // Always a real agent run now. Omitting dataset_id investigates the
    // built-in star schema; passing one investigates that uploaded file.
    setRunId(undefined)
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

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Investigations' }]

  if (isLoading || !orch || !typeMeta) {
    return (
      <AppShell activeKey="investigations" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Investigations…</div>
      </AppShell>
    )
  }

  // A finished agent run's orchestration takes precedence over the static
  // per-archetype sample; everything below renders from `view` either way,
  // since the backend assembles agent results into this exact shape.
  const view = liveOrch ?? orch
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
        confidence: run.result?.synthesis.confidence ?? 0,
      }
    : null

  const progress = agentProgress ??
    liveProgress ?? {
      pct: view.progress.pct,
      insights: view.progress.insights,
      sub: `${view.progress.completed} of ${view.progress.total} accelerators completed`,
      confidence: view.progress.confidence,
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
            Investigation Compression Engine · <strong className="text-brand-violet">{typeMeta.title}</strong> mode ·{' '}
            {(runAccelerators ?? view.accelerators).length} specialist agents orchestrated
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
                onConfirm: () => show('Link copied · Shared with Trade Team', { duration: 3000 }),
              })
            }
          />
          <Dropdown
            selected=""
            options={[
              { label: 'Export to PDF' },
              { label: 'Duplicate investigation' },
              { label: 'Archive' },
            ]}
            onSelect={(val) => show(`${val} — done`)}
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
              statusOverride={runAccelState ?? accelState}
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
        confidence={progress.confidence}
        confidenceDelta={view.progress.confidenceDelta}
      />

      {popover && (
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
