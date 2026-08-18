import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, IconButton, Card, CardBody, Dropdown, LiveStatus, useLiveStatus, useToast } from '../components/ui'
import { Icon } from '../icons'
import { useInvestigationTypes } from '../hooks/useInvestigations'
import { useSimulationPage } from '../hooks/useSimulation'
import { useFocus } from '../hooks/useNav'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { ActiveInvBanner } from '../components/investigations/ActiveInvBanner'
import { LoadingOverlay } from '../components/simulation/LoadingOverlay'
import { ScenarioRow } from '../components/simulation/ScenarioRow'
import { LeverPanel, LeverStatusPill } from '../components/simulation/LeverPanel'
import { TrendChart } from '../components/simulation/TrendChart'
import { RoiTrajectoryChart } from '../components/simulation/RoiTrajectoryChart'
import { ImpactTable, SimRiskList, ConfidenceRow, RecoCard, StatsRow, ComparisonTable } from '../components/simulation/panels'
import { buildInitialScenarios, compute, NEW_SCENARIO_PALETTE } from '../components/simulation/simulationEngine'
import type { LeverDef, LeverValues, Scenario, SelectDef, SelectValues } from '../types/simulation'

const PROMO_OPTIONS = ['South MT Push (Apr – Jun)', 'North GT Boost (Apr – Jun)', 'Value Pack Bonanza']
const PERIOD_OPTIONS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']

const BOOT_STAGES = [
  'Connecting to historical baselines…',
  'Loading scenario configurations…',
  'Calibrating MMM models…',
  'Running initial forecast…',
]
const RUN_STAGES = ['Analyzing lever deltas…', 'Running MMM model…', 'Computing ROI forecast…', 'Validating governance…']

// Ported from js/pages/simulation.js (PageSimulation.render + its ~15 render helpers).
// State-driven equivalent of the original's imperative `state` object + `renderAll()`.
export function Simulation() {
  const { activeType, activeQuestion } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const { data: D, isLoading } = useSimulationPage(activeType)
  const { data: focus } = useFocus()
  const { show } = useToast()
  const live = useLiveStatus()
  const navigate = useNavigate()
  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [activeKey, setActiveKey] = useState('s2')
  const [pendingLevers, setPendingLevers] = useState<LeverValues | null>(null)
  const [pendingSelects, setPendingSelects] = useState<SelectValues | null>(null)
  const [chartMode, setChartMode] = useState<'weekly' | 'cumulative'>('weekly')
  const [compareMode, setCompareMode] = useState(false)
  const [promo, setPromo] = useState(PROMO_OPTIONS[0])
  const [period, setPeriod] = useState('Q2 FY25')

  const [booting, setBooting] = useState(true)
  const [runState, setRunState] = useState<'idle' | 'running' | 'done'>('idle')

  // Boot: build scenarios from the fetched data once, then play the engine warmup.
  useEffect(() => {
    if (!D || scenarios) return
    const built = buildInitialScenarios(D)
    setScenarios(built)
    const active = built.find((s) => s.key === activeKey) ?? built[0]
    setPendingLevers({ ...active.levers })
    setPendingSelects({ ...active.selects })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D])

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Simulation Studio' }]

  if (isLoading || !D || !typeMeta || !scenarios || !pendingLevers || !pendingSelects) {
    return (
      <AppShell activeKey="simulation" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Simulation Studio…</div>
      </AppShell>
    )
  }

  const activeScenario = scenarios.find((s) => s.key === activeKey)!
  const baseline = scenarios[0]
  const visible = compareMode ? scenarios : [activeScenario]

  const switchScenario = (key: string) => {
    if (key === activeKey) return
    const sc = scenarios.find((s) => s.key === key)!
    setActiveKey(key)
    setPendingLevers({ ...sc.levers })
    setPendingSelects({ ...sc.selects })
    show(`Switched to ${sc.name}`, { duration: 1600 })
  }

  const addScenario = () => {
    const base = activeScenario
    const used = scenarios.map((s) => s.dotColor)
    const color = NEW_SCENARIO_PALETTE.find((c) => !used.includes(c)) ?? NEW_SCENARIO_PALETTE[0]
    const num = scenarios.length + 1
    const key = `sN${num}`
    const created: Scenario = {
      ...base,
      key,
      name: `Scenario ${num}`,
      sub: `Cloned from ${base.name}`,
      dotColor: color,
      recommended: false,
      levers: { ...base.levers },
      selects: { ...base.selects },
      series: { weekly: [...base.series.weekly], roi: [...base.series.roi] },
      risk: base.risk.map((r) => ({ ...r })),
    }
    setScenarios([...scenarios, created])
    setActiveKey(key)
    setPendingLevers({ ...created.levers })
    setPendingSelects({ ...created.selects })
    show('New scenario added — adjust levers and click Run Simulation', { duration: 2600 })
  }

  const resetLevers = () => {
    setPendingLevers({ ...activeScenario.levers })
    setPendingSelects({ ...activeScenario.selects })
    show(`Levers reset to ${activeScenario.name} defaults`)
  }

  const runSimulation = () => {
    setRunState('running')
  }

  const finishRun = () => {
    const out = compute(pendingLevers, baseline, D.risk)
    const updated = scenarios.map((s) =>
      s.key === activeKey
        ? { ...s, levers: { ...pendingLevers }, selects: { ...pendingSelects }, ...out }
        : s,
    )
    const topConf = updated.reduce((a, b) => (a.confidence > b.confidence ? a : b))
    const final = updated.map((s) => ({ ...s, recommended: s.key === topConf.key }))
    setScenarios(final)
    setRunState('done')
    const sc = final.find((s) => s.key === activeKey)!
    show(`Simulation complete — ${sc.name}: ROI ${sc.impact.roi.toFixed(2)} · Confidence ${sc.confidence}%`, { duration: 3500 })
    window.setTimeout(() => setRunState('idle'), 2200)
  }

  const cum = (arr: number[]) => {
    const out: number[] = []
    let s = 0
    arr.forEach((v) => {
      s += v
      out.push(+s.toFixed(1))
    })
    return out
  }
  const chartSeries = visible.map((s) => ({
    key: s.key,
    color: s.dotColor,
    values: chartMode === 'cumulative' ? cum(s.series.weekly) : s.series.weekly,
  }))
  const chartTarget = chartMode === 'cumulative' ? cum(D.incOverTime.target) : D.incOverTime.target

  const leversDirty = (Object.keys(pendingLevers) as LeverDef['key'][]).some(
    (k) => Math.abs(pendingLevers[k] - activeScenario.levers[k]) > 1e-6,
  )
  const selectsDirty = (Object.keys(pendingSelects) as SelectDef['key'][]).some(
    (k) => (pendingSelects[k] || '') !== (activeScenario.selects[k] || ''),
  )

  return (
    <AppShell activeKey="simulation" crumbs={crumbs}>
      <LoadingOverlay
        active={booting}
        title="Initializing TPO Simulation Engine"
        stages={BOOT_STAGES}
        onDone={() => {
          setBooting(false)
          show('Simulation Studio ready', { duration: 2000 })
        }}
      />
      <LoadingOverlay active={runState === 'running'} title="Recomputing Scenario" stages={RUN_STAGES} onDone={finishRun} />

      <div className="fade-in flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em]">
              TPO Simulation Studio <Icon name="sparkles" className="h-5 w-5 text-brand-violet" />
            </h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">Model and compare promotion scenarios to maximize ROI and achieve targets</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCompareMode((v) => !v)}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[var(--r-md)] border border-border-default bg-surface-card px-3.5 py-2 text-xs font-medium text-ink-secondary hover:border-brand-violet"
          >
            <span>Compare Scenarios</span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${compareMode ? 'bg-brand-violet' : 'bg-border-default'}`}>
              <span
                className={`absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-transform ${compareMode ? 'translate-x-4' : ''}`}
              />
            </span>
          </button>
          <Dropdown
            selected={promo}
            options={PROMO_OPTIONS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPromo(val)
              show(`Simulating: ${val.split(' (')[0]}`)
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
          <Dropdown
            selected=""
            options={[{ label: 'Export comparison' }, { label: 'Save as template' }, { label: 'Share scenarios' }]}
            onSelect={(val) => show(`${val} — done`)}
            trigger={<IconButton icon="more" />}
          />
        </div>
      </div>

      <div className="mt-4">
        <ActiveInvBanner
          typeMeta={typeMeta}
          question={activeQuestion}
          proceedTo="/decision"
          proceedLabel="Proceed to Decision"
          proceedIcon="checkCircle"
        />
      </div>

      <ScenarioRow scenarios={scenarios} activeKey={activeKey} onSelect={switchScenario} onAdd={addScenario} />

      <div className="grid grid-cols-[320px_1fr_320px] gap-4 max-[1400px]:grid-cols-[280px_1fr_280px] max-[1180px]:grid-cols-1">
        <Card className="fade-in">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
              TPO Levers <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
            </h3>
            <LeverStatusPill dirty={leversDirty || selectsDirty} />
          </div>
          <CardBody>
            <LeverPanel
              leverDefs={D.levers}
              selectDefs={D.selects}
              scenario={activeScenario}
              pendingLevers={pendingLevers}
              pendingSelects={pendingSelects}
              onLeverChange={(key, value) => setPendingLevers({ ...pendingLevers, [key]: value })}
              onSelectChange={(key, value) => setPendingSelects({ ...pendingSelects, [key]: value })}
              onReset={resetLevers}
              onRun={runSimulation}
              runState={runState}
            />
          </CardBody>
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card className="fade-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
                Projected Business Impact <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </h3>
            </div>
            <div className="overflow-x-auto">
              <ImpactTable visible={visible} baseline={baseline} compareMode={compareMode} />
            </div>
          </Card>

          <Card className="fade-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <div className="inline-flex rounded-[var(--r-pill)] bg-surface-muted p-[3px]">
                {(['weekly', 'cumulative'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={`rounded-[var(--r-pill)] px-3 py-1 text-[11.5px] font-semibold ${
                      chartMode === m ? 'bg-surface-card text-ink-primary shadow-[var(--shadow-xs)]' : 'text-ink-muted'
                    }`}
                  >
                    {m === 'weekly' ? 'Impact Over Time' : 'Cumulative Impact'}
                  </button>
                ))}
              </div>
              <IconButton icon="more" />
            </div>
            <CardBody>
              <div className="mb-1.5 text-xs text-ink-muted">
                {chartMode === 'weekly' ? 'Weekly Incremental Sales (₹ Cr)' : 'Cumulative Incremental Sales (₹ Cr)'}
              </div>
              <div className="mb-2 flex flex-wrap gap-3.5 text-xs text-ink-secondary">
                {visible.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-3.5 rounded-sm" style={{ background: s.dotColor }} /> {s.name}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-[#9CA3AF]" /> Target
                </span>
              </div>
              <TrendChart labels={D.incOverTime.labels} series={chartSeries} target={chartTarget} />
            </CardBody>
          </Card>

          <div className="grid grid-cols-[1.6fr_1fr] gap-3.5 max-[900px]:grid-cols-1">
            <Card className="fade-in">
              <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                <h3 className="text-[15px] font-bold">ROI Trajectory</h3>
                <div className="flex gap-3 text-xs text-ink-muted">
                  {visible.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-2.5 rounded-sm" style={{ background: s.dotColor }} /> {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <CardBody>
                <RoiTrajectoryChart labels={D.roiTrajectory.labels} scenarios={visible} />
              </CardBody>
            </Card>
            <Card className="fade-in">
              <StatsRow visible={visible} />
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card className="fade-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
                Risk &amp; Governance <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </h3>
            </div>
            <div className="px-4.5 py-2">
              <SimRiskList risk={activeScenario.risk} />
            </div>
          </Card>

          <Card className="fade-in">
            <div className="border-b border-border-subtle px-5 py-4">
              <h3 className="text-[15px] font-bold">Scenario Confidence</h3>
            </div>
            <CardBody>
              <ConfidenceRow visible={visible} activeKey={activeKey} />
            </CardBody>
          </Card>

          <Card className="fade-in border-[1.5px] border-[rgba(124,92,255,0.2)] bg-[linear-gradient(180deg,rgba(124,92,255,0.02),white_50%)]">
            <CardBody>
              <RecoCard rec={scenarios.find((s) => s.recommended) ?? activeScenario} />
            </CardBody>
          </Card>
        </div>
      </div>

      {compareMode && (
        <Card className="fade-in mt-[18px]">
          <div className="border-b border-border-subtle px-5 py-4">
            <h3 className="text-[15px] font-bold">Scenario Comparison Summary</h3>
          </div>
          <div className="overflow-x-auto rounded-b-[var(--r-lg)]">
            <ComparisonTable scenarios={scenarios} />
          </div>
        </Card>
      )}

      <div className="mt-[18px] flex justify-end gap-2.5">
        <Button variant="secondary" onClick={() => show('Scenario saved to library · Visible to team', { duration: 2500 })}>
          <Icon name="checkCircle" /> Save Scenario
        </Button>
        <Button variant="primary" onClick={() => navigate('/decision')}>
          <Icon name="arrowRight" /> Proceed to Decision Center
        </Button>
      </div>
    </AppShell>
  )
}
