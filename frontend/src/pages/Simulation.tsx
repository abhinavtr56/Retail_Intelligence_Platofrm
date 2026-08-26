import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardBody, LiveStatus, Spinner, useLiveStatus, useToast } from '../components/ui'
import { Icon } from '../icons'
import { useInvestigationTypes } from '../hooks/useInvestigations'
import {
  useSimulationRun,
  useSimulateScenario,
  useScenarioComparison,
  useScenarioRecommendation,
  useWeeklyImpact,
  useRiskAssessment,
  toSimulationFilters,
  toComparisonRequest,
} from '../hooks/useSimulation'
import { useInvestigationContext, toInvestigationContextRequest } from '../hooks/useInvestigationContext'
import { useCommandFilters, type CommandFilters } from '../store/commandFilters'
import { useScenarioStore } from '../store/simulationScenarios'
import { useDecisionDraftStore, draftSignature } from '../store/decisionDraft'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { useSavedRefsStore } from '../store/savedRefs'
import { useSaveScenario } from '../hooks/useStore'
import { ActiveInvBanner } from '../components/investigations/ActiveInvBanner'
import { ContextBar } from '../components/simulation/ContextBar'
import { ScenarioRow } from '../components/simulation/ScenarioRow'
import { CurrentPlanPanel } from '../components/simulation/CurrentPlanPanel'
import { ComparisonTable } from '../components/simulation/ComparisonTable'
import { RecommendationPanel } from '../components/simulation/RecommendationPanel'
import { WeeklyImpactPanel } from '../components/simulation/WeeklyImpactPanel'
import { RiskPanel, RiskEmptyState } from '../components/simulation/RiskPanel'
import { LeverPanel } from '../components/simulation/LeverPanel'
import { ScenarioResultPanel, NotSimulatedPanel } from '../components/simulation/ScenarioResultPanel'
import { KpiTable, NoDataPanel } from '../components/simulation/panels'
import { GeneralOptimization } from '../components/optimization/GeneralOptimization'
import { TargetRescue } from '../components/rescue/TargetRescue'
import { useGeneralOptimizationStore, type SimulationMode } from '../store/generalOptimization'
import { useFilterOptions } from '../hooks/useCommandCenter'
import { ExportReportButton } from '../components/reports/ExportReportButton'
import { useTargetRescueStore } from '../store/targetRescue'

/** TPO Simulation Studio.
 *
 *  This page computes NOTHING. It posts a scope to /api/simulation/run for the
 *  measured baseline, and a scope plus an approved treatment to
 *  /api/simulation/simulate to execute a hypothetical. Every figure on screen
 *  was produced by the validated KPI engine.
 *
 *  THE DISTINCTION THE PAGE EXISTS TO KEEP. The Current Plan is measured — its
 *  levers are what the data says happened and its controls are read-only; it
 *  can be recalculated but never simulated. A hypothetical starts with no
 *  result at all, and gets one only when an execution actually succeeds.
 *
 *  A RESULT BELONGS TO THE SCOPE AND THE TREATMENT IT CAME FROM. Changing
 *  either invalidates it (see store/simulationScenarios.ts), so a 10% result
 *  never lingers on screen under a 15% selection.
 */
/** The duration stop that means "one business week". Imported from the lever
 *  control so the panel and the slider cannot drift apart about what 7 days is. */
const WEEKLY_DURATION_WEEKS = 1

export function Simulation() {
  const { activeType, activeQuestion, list, scope: investigationScope } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  // TWO VALID ENTRY PATHS, and the scope resolution is the only difference
  // between them:
  //
  //   A. Direct navigation -> the Command Center's current selection, exactly
  //      as before B3.2.
  //   B. Drilled in from an investigation -> the scope the Command Center
  //      handed over when the user clicked the alert or promotion, which is
  //      that same validated FilterState narrowed by identifiers the source
  //      genuinely provided.
  //
  // Either way this is ONE FilterState, and it is the one /run and /simulate
  // receive. Neither path invents a filter.
  // THE MODE SWITCH. General Optimization is a SECOND, SEPARATE workspace,
  // not a variant of this one: it has its own service, its own controls and
  // its own store, and nothing below this line reads it. Every hook on this
  // page still runs in either mode -- the branch is in the JSX, not around
  // the hooks -- so switching back is instant and the investigation path
  // never observes that it was away.
  const mode = useGeneralOptimizationStore((s) => s.mode)
  const setMode = useGeneralOptimizationStore((s) => s.setMode)
  // The option lists General Optimization's own pickers read. The same
  // endpoint the Command Center uses; no second source of dimension values.
  const filterOptions = useFilterOptions()

  const commandFilters = useCommandFilters((s) => s.filters)
  const currency = useCommandFilters((s) => s.currency)
  const filters = investigationScope?.filters ?? commandFilters

  const { show } = useToast()
  const live = useLiveStatus()
  const navigate = useNavigate()

  const run = useSimulationRun()
  const simulate = useSimulateScenario()
  const context = useInvestigationContext()
  const compare = useScenarioComparison()
  const recommendation = useScenarioRecommendation()
  const weekly = useWeeklyImpact()
  const weeklyFor = useRef<string | null>(null)
  const risk = useRiskAssessment()
  const riskFor = useRef<string | null>(null)
  const carryDecision = useDecisionDraftStore((s) => s.carry)
  const clearDecision = useDecisionDraftStore((s) => s.clear)
  const decisionDraft = useDecisionDraftStore((s) => s.draft)
  const requested = useRef<string | null>(null)
  const compared = useRef<string | null>(null)

  const { scenarios, activeId, seed, select, setLever, resetLevers, addScenario, startRun, applyResult, failRun } =
    useScenarioStore()

  const body = useMemo(() => ({ filters: toSimulationFilters(filters), currency }), [filters, currency])
  const scopeKey = useMemo(() => JSON.stringify(body), [body])

  // One baseline run per scope. A scope change reseeds the store, which
  // discards every scenario result computed over the previous rows.
  useEffect(() => {
    if (requested.current === scopeKey) return
    requested.current = scopeKey
    run.mutate(body, { onSuccess: (data) => seed(scopeKey, data.scenarios) })
    // The investigation context alongside it: who is asking, and about what.
    // It carries NO KPI value — every figure on this page still comes from
    // /run and /simulate through the validated engine.
    context.mutate(
      toInvestigationContextRequest(
        filters,
        { activeType, activeQuestion, list },
        // B10: the durable investigation id, once one has been minted. Before
        // the first save it is null and B3.1's honest gap stands.
        useSavedRefsStore.getState().investigationId,
      ),
    )
    // The guard must NOT survive this effect being torn down. React's
    // StrictMode mounts, unmounts and remounts on the first mount, and
    // react-query drops a mutation's observer on unsubscribe without ever
    // re-attaching it (MutationObserver has onUnsubscribe but no onSubscribe).
    // A request fired on the discarded pass therefore returns 200 to a
    // listener nobody holds: `onSuccess` never runs, `isPending` never clears
    // and the page sits on "Calculating baseline KPIs…" forever. Clearing the
    // ref lets the surviving pass issue the run it can actually receive.
    // Still one run per scope — the deps are unchanged.
    return () => {
      requested.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  // A comparison is only as current as the results behind it, so it is
  // re-requested whenever any scenario's result changes -- a new run, a
  // treatment change that invalidated one, or a scope change that cleared them
  // all. Keyed on what each scenario actually HAS, not on a render count.
  const comparisonKey = useMemo(
    () =>
      JSON.stringify([
        scopeKey,
        scenarios.map((s) => [s.id, s.status, s.simulation?.treatment ?? null, s.simulation?.discount_pct ?? null]),
      ]),
    [scopeKey, scenarios],
  )

  useEffect(() => {
    if (!run.data || !scenarios.length) return
    if (compared.current === comparisonKey) return
    compared.current = comparisonKey
    const request = toComparisonRequest(
      body.filters,
      run.data.scope.filters_applied,
      scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        result: s.result as Record<string, unknown> | null,
        simulation: s.simulation,
      })),
      currency,
    )
    compare.mutate(request)
    // The recommendation reads the SAME request, so the panel and the table
    // can never describe different scenario sets.
    recommendation.mutate(request)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonKey, run.data])

  // The weekly view belongs to ONE scenario: the selected one, at the
  // treatment it was actually run at. Keyed on scope + scenario + treatment so
  // a series can never outlive the thing it decomposes -- switching scenario,
  // changing the discount or changing scope all re-request it.
  const active0 = scenarios.find((s) => s.id === activeId)
  const weeklyKey =
    active0?.simulation
      ? JSON.stringify([scopeKey, active0.id, active0.simulation.discount_pct])
      : null

  useEffect(() => {
    if (!weeklyKey || !active0?.simulation) {
      weeklyFor.current = null
      weekly.reset()
      return
    }
    if (weeklyFor.current === weeklyKey) return
    weeklyFor.current = weeklyKey
    weekly.mutate({
      filters: body.filters,
      currency,
      scenario_id: active0.id,
      discount_pct: active0.simulation.discount_pct,
    })
    // THE GUARD MUST NOT SURVIVE THIS EFFECT BEING TORN DOWN — the same rule
    // the /run effect above already follows, for the same reason.
    //
    // It matters HERE and not there because of where the key comes from. The
    // scenario store is a module-level zustand store, so it survives an
    // unmount: coming back from Decision Center, `active0.simulation` is
    // already populated on the very first render, `weeklyKey` is non-null
    // immediately, and StrictMode's discarded first pass fires this mutation
    // and then throws away its observer. Without this cleanup the surviving
    // pass saw the ref already set, returned early, and the panel sat on
    // "Decomposing the scenario…" against a request nobody was listening to.
    //
    // It recovered once /run reseeded the store and the `!weeklyKey` branch
    // above cleared the ref — but it did not recover if that run failed, and a
    // spinner that depends on an unrelated request succeeding is not a state
    // worth keeping. Clearing the ref lets the surviving pass issue the
    // request it can actually receive.
    return () => {
      weeklyFor.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyKey])

  // The assessment belongs to the SELECTED simulated scenario, and is
  // re-requested when that scenario, its treatment, or B4's answer changes.
  // It sends results the client already has -- nothing is recomputed here or
  // on the server.
  const riskKey = active0?.simulation
    ? JSON.stringify([
        scopeKey,
        active0.id,
        active0.simulation.discount_pct,
        recommendation.data?.recommended_scenario_id ?? null,
      ])
    : null

  useEffect(() => {
    if (!riskKey || !active0?.simulation) {
      riskFor.current = null
      risk.reset()
      return
    }
    if (riskFor.current === riskKey) return
    riskFor.current = riskKey
    risk.mutate({
      scenario: active0.simulation,
      recommendation: recommendation.data ?? null,
      weekly_included: Boolean(weekly.data),
    })
    // Same cleanup, same reason as the weekly effect above — and this one is
    // the more damaging of the two, because `canCarryDecision` requires
    // `risk.data`. An orphaned assessment leaves "Open Decision Center"
    // disabled with no error to explain it.
    return () => {
      riskFor.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskKey])

  // THE HANDOFF, and its invalidation.
  //
  // A decision record describing a scenario the user has since changed would
  // look authoritative and be out of date, so the draft carries the signature
  // of the state it was taken from and is dropped the moment that stops
  // matching. Scope, scenario, treatment, recommendation and risk all
  // participate — any of them moving makes the carried record stale.
  const currentSignature =
    active0?.simulation && context.data && recommendation.data && risk.data
      ? draftSignature({
          scopeKey,
          scenarioId: active0.id,
          discountPct: active0.simulation.discount_pct,
          recommendedScenarioId: recommendation.data.recommended_scenario_id,
          riskStatus: risk.data.overall_status,
          weeklyScenarioId: weekly.data?.scenario_id ?? null,
        })
      : null

  useEffect(() => {
    if (decisionDraft && decisionDraft.signature !== currentSignature) clearDecision()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature])

  const canCarryDecision = Boolean(
    currentSignature && active0?.simulation && context.data && recommendation.data && risk.data,
  )

  /** Why Open Decision Center is disabled, in terms of what the user can do.
   *
   *  Decision Center assembles its record from the scenario, its recommendation
   *  and its risk assessment — all three, because a record missing any of them
   *  would be refused by the contract. So any of the three failing disables the
   *  handoff, and each one needs a different sentence. */
  const handoffBlocker = !active0?.simulation
    ? 'Run and select a scenario to carry it to the Decision Center.'
    : recommendation.isError
      ? 'The recommendation could not be produced, and a decision record needs it. Retry it above.'
      : risk.isError
        ? 'The risk assessment could not be produced, and a decision record needs it. Retry it above.'
        : !context.data
          ? 'Loading the investigation context…'
          : recommendation.isPending || risk.isPending || !recommendation.data || !risk.data
            ? 'Waiting for the recommendation and the risk assessment…'
            : 'Run and select a scenario to carry it to the Decision Center.'

  // --- B10: durable storage ------------------------------------------------
  const saveScenario = useSaveScenario()
  const rememberInvestigation = useSavedRefsStore((s) => s.rememberInvestigation)
  const rememberScenario = useSavedRefsStore((s) => s.rememberScenario)

  const canSaveScenario = Boolean(active0?.simulation && context.data)

  /** Store the active scenario's result.
   *
   *  A save posts back the two payloads this page already holds; nothing is
   *  recomputed on either side. The server mints the ids — the session-local
   *  `scenario-N` above is a counter that resets on every reseed and could
   *  never be a durable key.
   *
   *  On success the minted investigation id is remembered, so the NEXT
   *  /simulation/context call carries it and every downstream record can be
   *  traced back to the investigation that prompted it. */
  const saveActiveScenario = () => {
    if (!active0?.simulation || !context.data) return
    saveScenario.mutate(
      { context: context.data, simulation: active0.simulation, name: active0.name },
      {
        onSuccess: (stored) => {
          rememberInvestigation(stored.investigation_id)
          rememberScenario(stored.scenario_id, stored.version)
        },
      },
    )
  }

  const openDecisionCenter = () => {
    if (
      !currentSignature || !active0?.simulation || !context.data ||
      !recommendation.data || !risk.data
    ) {
      return
    }
    // Results only. Nothing is recomputed, and no economics travel with it.
    carryDecision({
      signature: currentSignature,
      scenarioId: active0.id,
      scenarioName: active0.name,
      context: context.data,
      simulation: active0.simulation,
      recommendation: recommendation.data,
      risk: risk.data,
      weekly: weekly.data?.scenario_id === active0.id ? weekly.data : null,
      // Both are results this page ALREADY holds, carried across unchanged so
      // the decision record can state a measured value beside a simulated one
      // and show the scenarios side by side. Neither is recomputed, here or on
      // the server, and a scope that produced neither carries null rather than
      // a stand-in.
      comparison: compare.data ?? null,
      baseline: run.data ?? null,
    })
    navigate('/decision')
  }

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Simulation Studio' }]
  const result = run.data
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
  const definitions = result?.levers.definitions ?? []
  const isMeasured = active?.kind === 'measured'

  // Dirty against THIS scenario's own seeded start, not against the measured
  // plan. Aggressive Growth opens at the deepest approved treatment, so the
  // older comparison would have shown it modified — and offered a Reset —
  // before the user had touched anything.
  const dirty = Boolean(
    active &&
      !isMeasured &&
      (active.levers.discount_pct !== active.seededLevers.discount_pct ||
        active.levers.duration_weeks !== active.seededLevers.duration_weeks),
  )
  const approvedSelected = Boolean(
    definitions
      .find((d) => d.key === 'discount_pct')
      ?.approved_points?.some((p) => Math.abs(p.discount_pct - (active?.levers.discount_pct ?? NaN)) < 1e-9),
  )

  const onRun = () => {
    if (!active) return

    // The Current Plan is measured: its button recalculates the baseline and
    // can never produce a simulated status.
    if (isMeasured) {
      run.mutate(body, {
        onSuccess: (data) => {
          seed(scopeKey, data.scenarios)
          show('Baseline recalculated from the current selection', { duration: 2600 })
        },
      })
      return
    }

    const discount = active.levers.discount_pct
    if (discount == null) return
    // EVERYTHING THIS RUN NEEDS, CAPTURED BEFORE IT STARTS. By the time the
    // response lands the user may have selected another scenario, so `active`
    // is the wrong thing to read from — the run belongs to the scenario it was
    // started for and to the scope it was started under.
    const requestedId = active.id
    const requestedName = active.name
    const requestedScope = scopeKey
    startRun(requestedId)

    // `mutateAsync`, NOT `mutate` WITH CALLBACKS.
    //
    // THE BUG THIS FIXES: run scenario A, then select B and run it before A
    // returns. `mutate`'s per-call callbacks live on the shared observer, so
    // B's replaced A's, A's `onSuccess` never fired, `applyResult` never ran,
    // and A's card sat on "Running against the KPI engine…" indefinitely —
    // even though its request had succeeded.
    //
    // The promise `mutateAsync` returns belongs to THIS execution and cannot be
    // displaced, so every concurrent run resolves on its own and settles its own
    // scenario. Nothing here polls, waits or forces a state: the request's own
    // success or failure is what ends it.
    simulate
      .mutateAsync({
        filters: body.filters,
        currency,
        scenario_id: requestedId,
        discount_pct: discount,
        // Echoed, not modelled — see the duration control in LeverPanel. Sent
        // so the executed result records which cadence was asked for.
        duration_weeks: active.levers.duration_weeks ?? undefined,
      })
      .then((data) => {
        // A RESULT FROM A SUPERSEDED SCOPE IS DISCARDED, NOT APPLIED. A scope
        // change reseeds the store from a fresh /run; a scenario result computed
        // over the previous rows means nothing against the new ones, and the
        // scenario ids are stable enough that it would land silently.
        if (useScenarioStore.getState().scopeKey !== requestedScope) return

        // THE RESULT MUST BE THE ONE WE ASKED FOR. The backend echoes the
        // scenario_id it was given, so this can only fail if a response were
        // ever routed to the wrong scenario — and attaching it anyway would
        // put one scenario's KPIs under another's name, which is the single
        // most damaging thing this page could do. Refused rather than shown.
        if (data.scenario_id !== requestedId) {
          failRun(
            requestedId,
            'Simulation result does not match the selected scenario. Nothing has been ' +
              'applied — run the scenario again.',
          )
          return
        }
        applyResult(requestedId, data)
        show(`${requestedName} simulated — ${data.treatment} at ${data.discount_pct}%`, {
          duration: 3000,
        })
      })
      .catch((error: Error) => {
        if (useScenarioStore.getState().scopeKey !== requestedScope) return
        failRun(requestedId, error.message)
      })
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
            {mode === 'general'
              ? 'Allocate a trade-spend budget across a category and channel, at approved discount depths.'
              : mode === 'rescue'
                ? 'Check monthly target progress and recover an at-risk target with the least aggressive approved intervention.'
                : 'The measured promotion plan for the current selection, and what an approved treatment would do to it.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ModeSwitch mode={mode} onChange={setMode} />
          {/* THE EXPORT FOLLOWS THE ACTIVE MODE. `module`, `scope` and `options`
              are all derived from `mode`, and the scope/options callbacks read
              each mode's OWN store at click time — so a Target Rescue export can
              never carry General Optimization's product plan, and switching modes
              needs no cache to invalidate. */}
          <ExportReportButton
            key={mode}
            module={exportModule(mode)}
            scope={() => exportScope(mode, filters)}
            options={() => exportOptions(mode, activeId, scenarios)}
            currency={currency}
          />
          {mode === 'investigation' && (
            <Button variant="secondary" onClick={() => run.mutate(body, { onSuccess: (d) => seed(scopeKey, d.scenarios) })} disabled={run.isPending}>
              <Icon name="refresh" /> <span>Recalculate</span>
            </Button>
          )}
        </div>
      </div>

      {/* THE THREE MODES. General Optimization and Target Rescue each render
          INSTEAD of the investigation workspace, never beside it -- one page
          shell, one router entry, three workspaces. Nothing below is duplicated
          for either, and nothing below changed to make room. Each mode owns its
          own store, so switching cannot carry one mode's scope into another. */}
      {mode === 'general' ? (
        <div className="mt-4">
          <GeneralOptimization options={filterOptions.data} />
        </div>
      ) : mode === 'rescue' ? (
        <div className="mt-4">
          <TargetRescue options={filterOptions.data} />
        </div>
      ) : (
        <>
        {typeMeta && (
          <div className="mt-4">
            <ActiveInvBanner
              typeMeta={typeMeta}
              // The RESOLVED question, not the raw store value. The store seeds
              // itself with an example, and this banner sitting next to the
              // context bar showing "no question yet" would contradict it.
              question={context.data?.question.value ?? 'No investigation question yet'}
              // NO "Open Decision Center" HERE.
              //
              // This banner offered a second button with that exact label, and
              // it was a plain <Link>: it navigated without carrying the
              // scenario, its recommendation or its risk assessment. A user who
              // ran a scenario and clicked THIS one arrived at Decision Center's
              // "No scenario has been carried here" empty state, while the
              // identically-labelled button at the foot of the page worked.
              //
              // One label, one behaviour: the handoff lives on the footer
              // button, which calls `openDecisionCenter` and carries the draft.
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
                  <div className="text-[13px] font-bold text-ink-primary">Could not load the baseline</div>
                  <div className="mt-1 break-words text-[12.5px] text-ink-secondary">{run.error.message}</div>
                  <Button
                    variant="secondary"
                    className="mt-3"
                    onClick={() => run.mutate(body, { onSuccess: (d) => seed(scopeKey, d.scenarios) })}
                  >
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

        {result && active && (
          <>
            <div className="fade-in mt-4">
              <ContextBar
                context={result.context}
                investigation={context.data ?? null}
                origin={investigationScope?.origin ?? null}
                originLabel={investigationScope?.label ?? null}
              />
            </div>

            <div className="mt-4">
              <ScenarioRow scenarios={scenarios} activeId={activeId} onSelect={select} onAdd={addScenario} />
            </div>

            <div className="mt-4 grid grid-cols-[320px_1fr_300px] gap-4 max-[1400px]:grid-cols-[280px_1fr_280px] max-[1180px]:grid-cols-1">
              <Card className="fade-in">
                <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                  <div>
                    <h3 className="text-[15px] font-bold">TPO Levers</h3>
                    <div className="mt-0.5 text-[11.5px] text-ink-muted">{active.name}</div>
                  </div>
                  {(run.isPending || active.running) && <Spinner />}
                </div>
                <CardBody>
                  <LeverPanel
                    definitions={definitions}
                    values={active.levers}
                    readOnly={isMeasured}
                    simulation={active.simulation}
                    note={
                      isMeasured
                        ? 'These are the observed values for this scope, not settings. Select a hypothetical scenario to explore an approved treatment.'
                        : 'Discount is the only MODELLED lever: it selects an approved treatment and moves every KPI below. Duration is recorded and echoed but maps to no approved uplift, so it moves nothing. Trade spend is derived from the treatment, never entered.'
                    }
                    canRun={isMeasured || approvedSelected}
                    runLabel={isMeasured ? 'Recalculate baseline' : 'Run Simulation'}
                    running={isMeasured ? run.isPending : active.running}
                    onSelectDiscount={(value) => setLever(active.id, 'discount_pct', value)}
                    onSelectDuration={(value) => setLever(active.id, 'duration_weeks', value)}
                    onReset={() => resetLevers(active.id)}
                    onRun={onRun}
                    dirty={dirty}
                  />
                </CardBody>
              </Card>

              <Card className="fade-in">
                {active.kind === 'measured' ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                      <div>
                        <h3 className="text-[15px] font-bold">Projected Business Impact</h3>
                        <div className="mt-0.5 text-[11.5px] text-ink-muted">
                          {active.name} · {result.context.period}
                        </div>
                      </div>
                      <span className="rounded-[var(--r-pill)] bg-status-success-bg px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-status-success">
                        Measured
                      </span>
                    </div>
                    {!result.scope.has_data ? (
                      <NoDataPanel />
                    ) : active.result ? (
                      <div className="overflow-x-auto">
                        <KpiTable kpis={active.result} targetRoiPct={result.meta.target_roi_pct} />
                      </div>
                    ) : (
                      <NoDataPanel />
                    )}
                  </>
                ) : active.running ? (
                  <div className="grid min-h-[300px] place-items-center">
                    <div className="flex flex-col items-center gap-3 text-sm text-ink-muted">
                      <Spinner />
                      <span>Running {active.name} through the KPI engine…</span>
                    </div>
                  </div>
                ) : active.simulation ? (
                  <ScenarioResultPanel
                    simulation={active.simulation}
                    // WEEKLY CADENCE SELECTED -> READ THE SCENARIO PER WEEK.
                    // Not a second simulation and not a division: these are the
                    // weeks /simulation/weekly already returned for THIS scenario,
                    // sliced from the same counterfactual. Guarded on the response
                    // belonging to the selected scenario, because the weekly
                    // request lags a scenario switch by one round trip.
                    perWeek={
                      active.levers.duration_weeks === WEEKLY_DURATION_WEEKS &&
                      weekly.data?.scenario_id === active.id
                        ? weekly.data.weeks
                        : null
                    }
                    // B: a scenario cell defers to the MEASURED figure rather
                    // than resolving a wider scope of its own.
                    measuredCannibalization={result.kpis.cannibalization}
                  />
                ) : (
                  <NotSimulatedPanel reason={active.result_reason} error={active.error} />
                )}
              </Card>

              <Card className="fade-in">
                <div className="border-b border-border-subtle px-5 py-4">
                  <h3 className="text-[15px] font-bold">Current Plan</h3>
                  <div className="mt-0.5 text-[11.5px] text-ink-muted">Observed from the data</div>
                </div>
                <CardBody>
                  <CurrentPlanPanel plan={result.current_plan} />
                </CardBody>
              </Card>
            </div>

            {/* The recommendation has the same three request states as everything
                else on this page: pending, failed with a real message and a
                retry, or an answer. It is never silently absent. */}
            {(recommendation.data || recommendation.isPending || recommendation.isError) && (
              <Card className="fade-in mt-[18px]">
                {recommendation.isError ? (
                  <div className="px-5 py-6">
                    <div className="text-[13px] font-bold text-ink-primary">
                      Could not produce a recommendation
                    </div>
                    <div className="mt-1 break-words text-[12.5px] text-ink-secondary">
                      {recommendation.error.message}
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-3"
                      onClick={() => {
                        if (recommendation.variables) recommendation.mutate(recommendation.variables)
                      }}
                    >
                      <Icon name="refresh" /> Retry
                    </Button>
                  </div>
                ) : recommendation.data ? (
                  <RecommendationPanel recommendation={recommendation.data} />
                ) : (
                  <div className="flex items-center gap-2 px-5 py-6 text-[12.5px] text-ink-muted">
                    <Spinner /> Applying the decision policy…
                  </div>
                )}
              </Card>
            )}

            <Card className="fade-in mt-[18px]">
              {!active.simulation ? (
                <div className="px-5 py-8 text-center">
                  <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-muted [&_svg]:h-5 [&_svg]:w-5">
                    <Icon name="activity" />
                  </div>
                  <div className="text-sm font-bold text-ink-primary">Weekly Impact</div>
                  <div className="mt-1.5 text-[12.5px] text-ink-secondary">
                    Run a scenario to see weekly impact.
                  </div>
                </div>
              ) : weekly.isError ? (
                <div className="px-5 py-6">
                  <div className="text-[13px] font-bold text-ink-primary">
                    Could not build the weekly view
                  </div>
                  <div className="mt-1 break-words text-[12.5px] text-ink-secondary">
                    {weekly.error.message}
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      if (weekly.variables) weekly.mutate(weekly.variables)
                    }}
                  >
                    <Icon name="refresh" /> Retry
                  </Button>
                </div>
              ) : weekly.data && weekly.data.scenario_id === active.id ? (
                <WeeklyImpactPanel
                  weekly={weekly.data}
                  isRecommended={recommendation.data?.recommended_scenario_id === active.id}
                />
              ) : (
                <div className="flex items-center gap-2 px-5 py-8 text-[12.5px] text-ink-muted">
                  <Spinner /> Decomposing the scenario across its business weeks…
                </div>
              )}
            </Card>

            <Card className="fade-in mt-[18px]">
              {!active.simulation ? (
                <RiskEmptyState />
              ) : risk.isError ? (
                <div className="px-5 py-6">
                  <div className="text-[13px] font-bold text-ink-primary">
                    Could not assess risk and governance
                  </div>
                  <div className="mt-1 break-words text-[12.5px] text-ink-secondary">
                    {risk.error.message}
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      if (risk.variables) risk.mutate(risk.variables)
                    }}
                  >
                    <Icon name="refresh" /> Retry
                  </Button>
                </div>
              ) : risk.data && risk.data.scenario_id === active.id ? (
                <RiskPanel risk={risk.data} />
              ) : (
                <div className="flex items-center gap-2 px-5 py-8 text-[12.5px] text-ink-muted">
                  <Spinner /> Assessing risk and governance…
                </div>
              )}
            </Card>

            {scenarios.length > 1 && (
              <Card className="fade-in mt-[18px]">
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
                  <div>
                    <h3 className="text-[15px] font-bold">Scenario Comparison</h3>
                    <div className="mt-0.5 text-[11.5px] text-ink-muted">
                      Measured, simulated and unrun scenarios side by side — facts and deltas, not a ranking.
                    </div>
                  </div>
                  {compare.isPending && <Spinner />}
                </div>
                <div className="overflow-x-auto rounded-b-[var(--r-lg)]">
                  {compare.isError ? (
                    <div className="px-5 py-6 text-center text-[12.5px] text-ink-secondary">
                      Could not build the comparison: {compare.error.message}
                    </div>
                  ) : compare.data ? (
                    <ComparisonTable comparison={compare.data} />
                  ) : (
                    <div className="px-5 py-6 text-center text-[12.5px] text-ink-muted">
                      Preparing the comparison…
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}

        <div className="mt-[18px] flex items-center justify-end gap-2.5">
          <span className="mr-auto text-[11.5px] text-ink-muted">
            {saveScenario.isError ? (
              <span className="text-status-danger">
                Could not save the scenario — {saveScenario.error.message}. Nothing on this
                page has changed.
              </span>
            ) : saveScenario.isSuccess ? (
              <>
                Saved as <strong>{saveScenario.data.scenario_id}</strong> · version{' '}
                {saveScenario.data.version}. Ownership is unverified — this application has
                no authentication.
              </>
            ) : canCarryDecision ? (
              'Carrying the selected scenario, its recommendation and its governance assessment.'
            ) : (
              // NAME THE ACTUAL BLOCKER. The decision record is assembled from
              // the scenario, its recommendation AND its risk assessment, so a
              // failure in either downstream call disables this button. Saying
              // "run and select a scenario" when a scenario has been run and
              // selected sends the user to fix something that is not wrong.
              handoffBlocker
            )}
          </span>
          {/* B10: a real save. Only a scenario that has actually been simulated
              can be stored — there is nothing else to store. */}
          <Button
            variant="secondary"
            onClick={saveActiveScenario}
            disabled={!canSaveScenario || saveScenario.isPending}
            title={canSaveScenario ? undefined : 'Run this scenario first'}
          >
            {saveScenario.isPending ? <Spinner /> : <Icon name="checkCircle" />}
            <span>{saveScenario.isPending ? 'Saving…' : 'Save Scenario'}</span>
          </Button>
          <Button variant="primary" onClick={openDecisionCenter} disabled={!canCarryDecision}>
            <Icon name="arrowRight" /> Open Decision Center
          </Button>
        </div>
        </>
      )}
    </AppShell>
  )
}

/** WHICH REPORT THE EXPORT CONTROL ASKS FOR, per active mode.
 *
 *  One switch, so the three modes cannot drift apart or fall through to a
 *  default that would silently export the wrong workspace.
 */
function exportModule(mode: SimulationMode) {
  if (mode === 'general') return 'simulation-general-optimization' as const
  if (mode === 'rescue') return 'simulation-target-rescue' as const
  return 'simulation-investigation' as const
}

/** THE SCOPE EACH MODE ACTUALLY WORKS OVER — read at click time.
 *
 *  Investigation Simulation scopes from the Command Center's FilterState (or the
 *  RCA hand-off that narrowed it), exactly as its own /run and /simulate calls
 *  do. General Optimization and Target Rescue each own their controls, and each
 *  store is read directly here, so an export reflects that mode's selection and
 *  no other's. This is the same state isolation the three modes already keep.
 */
function exportScope(mode: SimulationMode, filters: CommandFilters): Record<string, unknown> {
  if (mode === 'general') {
    const c = useGeneralOptimizationStore.getState().controls
    return {
      month: c.month ?? undefined,
      channel: c.channel ? [c.channel] : undefined,
      category: c.category ? [c.category] : undefined,
    }
  }
  if (mode === 'rescue') {
    const c = useTargetRescueStore.getState().controls
    return {
      year: c.year ?? undefined,
      month: c.month,
      channel: c.channel ? [c.channel] : undefined,
      category: c.category ? [c.category] : undefined,
      product: c.product ? [c.product] : undefined,
    }
  }
  return toSimulationFilters(filters) as Record<string, unknown>
}

/** THE CONTROL VALUES each module's authoritative service needs as INPUTS.
 *
 *  Never results: the server re-runs the same service the screen called and
 *  produces its own figures. What travels is only what the user set.
 */
function exportOptions(
  mode: SimulationMode,
  activeId: string,
  scenarios: { id: string; name: string; levers: { discount_pct?: number | null } }[],
): Record<string, unknown> {
  if (mode === 'general') {
    const c = useGeneralOptimizationStore.getState().controls
    return {
      max_trade_spend: c.maxTradeSpend ?? undefined,
      min_discount_pct: c.minDiscountPct,
      max_discount_pct: c.maxDiscountPct,
    }
  }
  if (mode === 'rescue') {
    const c = useTargetRescueStore.getState().controls
    return {
      target_units: c.targetUnits ?? undefined,
      current_discount_pct: c.currentDiscountPct,
      checkpoint: c.checkpoint,
      max_additional_trade_spend: c.maxAdditionalTradeSpend ?? undefined,
    }
  }
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
  return {
    scenario_id: active?.id,
    scenario_name: active?.name,
    discount_pct: active?.levers?.discount_pct ?? undefined,
    filename_hint: active?.name,
  }
}

/** INVESTIGATION SIMULATION | GENERAL OPTIMIZATION | TARGET RESCUE.
 *
 *  A segmented control, not a router: all three modes are this page, so
 *  switching cannot lose the investigation's scope, its question or a scenario
 *  the user has already run. The default is Investigation Simulation and the
 *  store does not persist the choice, so a fresh load always opens on it.
 *
 *  Each mode's controls live in its own store, so switching away and back
 *  restores what the user had without any mode observing another's selection.
 */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: SimulationMode
  onChange: (mode: SimulationMode) => void
}) {
  const modes: { key: SimulationMode; label: string; title: string }[] = [
    {
      key: 'investigation',
      label: 'Investigation Simulation',
      title: 'Measure the current plan and simulate an approved treatment over it.',
    },
    {
      key: 'general',
      label: 'General Optimization',
      title: 'Allocate a trade-spend budget across a category, channel and month.',
    },
    {
      key: 'rescue',
      label: 'Target Rescue',
      title: 'Identify monthly target risk and recommend recovery actions.',
    },
  ]
  return (
    <div
      role="tablist"
      aria-label="Simulation mode"
      className="inline-flex items-center gap-0.5 rounded-[var(--r-md)] border border-border-default bg-surface-muted p-0.5"
    >
      {modes.map((m) => {
        const on = m.key === mode
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={on}
            title={m.title}
            onClick={() => onChange(m.key)}
            className={`cursor-pointer whitespace-nowrap rounded-[var(--r-sm)] px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet ${
              on
                ? 'bg-surface-card text-ink-primary shadow-[var(--shadow-sm)]'
                : 'text-ink-muted hover:text-ink-primary'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
