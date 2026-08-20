import { useEffect, useRef, useState } from 'react'
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
import { useInvestigationTypes, useOrchestration, useLegacyInvestigation } from '../hooks/useInvestigations'
import { useFocus } from '../hooks/useNav'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { InvestigationGraph } from '../components/investigations/InvestigationGraph'
import { NodeDetailPopover } from '../components/investigations/NodeDetailPopover'
import { BizQuestionCard } from '../components/investigations/BizQuestionCard'
import { AccelList } from '../components/investigations/AccelList'
import { ProgressStrip } from '../components/investigations/ProgressStrip'
import { QueryBar } from '../components/investigations/QueryBar'
import type { OrchNode } from '../types/orchestration'
import type { InvestigationType } from '../types/investigation'

const PROMO_OPTIONS = ['South MT Push (Apr – Jun)', 'North GT Boost', 'Value Pack Bonanza']
const PERIOD_OPTIONS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']
const LAYOUT_OPTIONS = ['Auto Layout', 'Radial', 'Force-directed', 'Hierarchical']

// Ported from js/pages/investigations.js (PageInvestigations.render). Same data shape
// (orchestration.nodes/accelerators/progress/nodeDetails), same interactions (query
// bar -> staged build, node click -> side popover, header dropdowns), state-driven via
// hooks/useEffect timers instead of imperative DOM rebuilds + setInterval choreography.
function inferType(q: string): InvestigationType {
  const s = (q || '').toLowerCase()
  if (/optimi[sz]e|maximi[sz]e|best plan|allocat|improve roi|lever/.test(s)) return 'optimization'
  if (/launch|new sku|new product|prioriti[sz]e/.test(s)) return 'launch'
  if (/portfolio|channel mix|strategic|fy26|long.?term|growth budget|rebalance/.test(s)) return 'strategic'
  return 'diagnostic'
}

type AccelState = 'queued' | 'progress' | 'done'

export function Investigations() {
  const { activeType, activeQuestion, setActive, addActive } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const { data: orch, isLoading } = useOrchestration(activeType)
  const { data: legacy } = useLegacyInvestigation()
  const { data: focus } = useFocus()
  const { show } = useToast()
  const confirm = useConfirm()
  const live = useLiveStatus()

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
  const [liveProgress, setLiveProgress] = useState<{ pct: number; insights: number; sub: string } | null>(null)
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
    setLiveProgress({ pct: 0, insights: 0, sub: 'TIQ is orchestrating specialist agents…' })

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
        setLiveProgress({ pct, insights, sub: `${done} of ${total} accelerators completed` })
      })
    })

    const finishAt = 900 + (total - 1) * ACC_STEP + ACC_RUN + 700
    after(finishAt, () => {
      setBuilding(false)
      setLiveProgress({
        pct: 100,
        insights: orch.progress.insights,
        sub: `${total} of ${total} accelerators completed`,
      })
      live.reset()
      // B9: the toast used to append "· 82% confidence". Nothing computes one.
      show(`Investigation complete — ${orch.progress.insights} insights identified`, {
        duration: 3500,
      })
    })

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orch, building])

  const legend = legacy?.legend ?? []

  const runQuery = () => {
    const q = queryInput.trim()
    if (!q) {
      show('Type a question for TIQ to investigate', { duration: 2000 })
      return
    }
    const type = inferType(q)
    setSubmitting(true)
    show(`TIQ is composing specialist agents…`, { duration: 2200 })
    window.setTimeout(() => {
      setSubmitting(false)
      setActive(type, q)
      addActive(type, q)
      setBuilding(true)
    }, 900)
  }

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Investigations' }]

  if (isLoading || !orch || !typeMeta) {
    return (
      <AppShell activeKey="investigations" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Investigations…</div>
      </AppShell>
    )
  }

  const progress = liveProgress ?? {
    pct: orch.progress.pct,
    insights: orch.progress.insights,
    sub: `${orch.progress.completed} of ${orch.progress.total} accelerators completed`,
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
            {orch.accelerators.length} specialist agents orchestrated
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
            options={[
              { label: 'Export to PDF' },
              { label: 'Duplicate investigation' },
              { label: 'Archive' },
            ]}
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
          loading={submitting}
          loadingLabel={`Composing ${typeMeta.title} agents…`}
        />
      </div>

      <BizQuestionCard typeMeta={typeMeta} question={activeQuestion} contextChips={orch.contextChips} />

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
            center={orch.center}
            nodes={orch.nodes}
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
              accelerators={orch.accelerators}
              statusOverride={accelState}
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
        sources={orch.progress.sources}
      />

      {popover && (
        <NodeDetailPopover
          node={popover.node}
          detail={orch.nodeDetails[popover.node.key]}
          anchorEl={popover.el}
          onClose={() => setPopover(null)}
        />
      )}
    </AppShell>
  )
}
