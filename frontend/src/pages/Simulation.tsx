import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardBody, LiveStatus, Spinner, useLiveStatus, useToast } from '../components/ui'
import { Icon } from '../icons'
import { useInvestigationTypes } from '../hooks/useInvestigations'
import { useSimulationRun, toSimulationFilters } from '../hooks/useSimulation'
import { useCommandFilters } from '../store/commandFilters'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { ActiveInvBanner } from '../components/investigations/ActiveInvBanner'
import { LeverPanel } from '../components/simulation/LeverPanel'
import { KpiTable, ScopeSummary, NoDataPanel } from '../components/simulation/panels'
import type { LeverKey, LeverValues } from '../types/simulation'

/** TPO Simulation Studio — Phase A.
 *
 *  This page computes NOTHING. It posts a scope and a lever payload to
 *  /api/simulation/run and renders what comes back; every figure is produced
 *  by the validated KPI engine, so the Simulation Studio and the Command
 *  Center cannot disagree about the same selection.
 *
 *  What was removed, and why it is not replaced with something else:
 *
 *   * `compute()` — a fixed-coefficient formula in the browser that invented
 *     revenue, ROI, margin and a 12-week series out of four constants. There
 *     is no promotion-response model in the project, so the levers are
 *     submitted and echoed and change nothing, and the page says so.
 *   * The MMM loading theatre — a 5-second timer narrating "Calibrating MMM
 *     models…" over a model that does not exist. Loading is now the real
 *     request state.
 *   * Risk, Confidence, Recommendation, Break-even, Peak ROI, Target
 *     Probability, Sell-through, the weekly series and the ROI trajectory —
 *     every one was a literal in a JSON file or arithmetic on ROI. None can be
 *     derived from the current datasets yet, and a plausible placeholder is
 *     worse than an absent number.
 *   * "Scenario saved to library · Visible to team" — a toast that saved
 *     nothing. Phase A persists nothing, so the button says so and is
 *     disabled.
 */
export function Simulation() {
  const { activeType, activeQuestion } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  // Scope comes from the ONE filter selection the Command Center already owns.
  // The Simulation Studio does not keep a second, quietly different idea of
  // which rows the user is looking at.
  const filters = useCommandFilters((s) => s.filters)
  const currency = useCommandFilters((s) => s.currency)

  const { show } = useToast()
  const live = useLiveStatus()
  const navigate = useNavigate()

  const run = useSimulationRun()
  const [levers, setLevers] = useState<LeverValues>({})
  const requested = useRef<string | null>(null)

  const body = useMemo(
    () => ({ filters: toSimulationFilters(filters), currency }),
    [filters, currency],
  )

  // One baseline run per scope. The measured result is what the page opens on,
  // and it is re-requested when the scope changes — not on every lever move,
  // which would be a request whose answer cannot differ.
  useEffect(() => {
    const key = JSON.stringify(body)
    if (requested.current === key) return
    requested.current = key
    setLevers({})
    run.mutate(body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body])

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Simulation Studio' }]
  const result = run.data

  const definitions = result?.levers.definitions ?? []
  const dirty = definitions.some(
    (d) => d.available && levers[d.key] != null && Math.abs((levers[d.key] as number) - (d.value ?? 0)) > 1e-6,
  )

  const onLeverChange = (key: LeverKey, value: number) => setLevers((prev) => ({ ...prev, [key]: value }))

  const onRun = () => {
    const submitted = Object.fromEntries(
      definitions.filter((d) => d.available).map((d) => [d.key, levers[d.key] ?? d.value]),
    ) as LeverValues
    run.mutate(
      { ...body, levers: submitted },
      {
        onSuccess: (data) =>
          show(
            data.levers.applied
              ? 'Scenario recomputed'
              : 'Baseline recalculated — levers recorded, not yet modelled',
            { duration: 3200 },
          ),
      },
    )
  }

  return (
    <AppShell activeKey="simulation" crumbs={crumbs}>
      <div className="fade-in flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em]">
              TPO Simulation Studio <Icon name="sparkles" className="h-5 w-5 text-brand-violet" />
            </h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            Measured promotion performance for the current selection, from the same KPI engine as the
            Command Center.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => run.mutate(body)} disabled={run.isPending}>
            <Icon name="refresh" /> <span>Recalculate</span>
          </Button>
        </div>
      </div>

      {typeMeta && (
        <div className="mt-4">
          <ActiveInvBanner
            typeMeta={typeMeta}
            question={activeQuestion}
            proceedTo="/decision"
            proceedLabel="Open Decision Center"
            proceedIcon="checkCircle"
          />
        </div>
      )}

      {run.isError && (
        <Card className="fade-in mt-4 border-[1.5px] border-[rgba(239,68,68,0.35)]">
          <CardBody>
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-status-danger-bg text-status-danger [&_svg]:h-4 [&_svg]:w-4">
                <Icon name="warning" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-ink-primary">Simulation request failed</div>
                <div className="mt-1 break-words text-[12.5px] text-ink-secondary">{run.error.message}</div>
                <Button variant="secondary" className="mt-3" onClick={() => run.mutate(body)}>
                  <Icon name="refresh" /> Retry
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {!result && run.isPending && (
        <div className="mt-4 grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-sm text-ink-muted">
            <Spinner />
            <span>Calculating baseline KPIs…</span>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 grid grid-cols-[320px_1fr_300px] gap-4 max-[1400px]:grid-cols-[280px_1fr_280px] max-[1180px]:grid-cols-1">
          <Card className="fade-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h3 className="text-[15px] font-bold">TPO Levers</h3>
              {run.isPending && <Spinner />}
            </div>
            <CardBody>
              <LeverPanel
                definitions={definitions}
                values={levers}
                note={result.levers.note}
                onChange={onLeverChange}
                onReset={() => setLevers({})}
                onRun={onRun}
                running={run.isPending}
                dirty={dirty}
              />
            </CardBody>
          </Card>

          <Card className="fade-in">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <div>
                <h3 className="text-[15px] font-bold">Measured Business Impact</h3>
                <div className="mt-0.5 text-[11.5px] text-ink-muted">
                  {result.scenario.name} · {result.scope.period}
                </div>
              </div>
              <span className="rounded-[var(--r-pill)] bg-surface-muted px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-muted">
                Measured — not modelled
              </span>
            </div>
            {result.scope.has_data ? (
              <div className="overflow-x-auto">
                <KpiTable kpis={result.kpis} targetRoiPct={result.meta.target_roi_pct} />
              </div>
            ) : (
              <NoDataPanel />
            )}
          </Card>

          <Card className="fade-in">
            <div className="border-b border-border-subtle px-5 py-4">
              <h3 className="text-[15px] font-bold">Scope</h3>
            </div>
            <CardBody>
              <ScopeSummary scope={result.scope} />
            </CardBody>
          </Card>
        </div>
      )}

      <div className="mt-[18px] flex items-center justify-end gap-2.5">
        {/* Phase A persists nothing. The button states that rather than
            claiming a save that never happened. */}
        <span className="mr-auto text-[11.5px] text-ink-muted">
          Scenario saving will be available in a later phase.
        </span>
        <Button variant="secondary" disabled>
          <Icon name="checkCircle" /> Save Scenario
        </Button>
        <Button variant="primary" onClick={() => navigate('/decision')}>
          <Icon name="arrowRight" /> Open Decision Center
        </Button>
      </div>
    </AppShell>
  )
}
