import { create } from 'zustand'
import type { LeverKey, LeverValues, Scenario, SimulateResponse } from '../types/simulation'

/** Scenario state for the Simulation Studio — B1 model, B2.3 execution.
 *
 *  SESSION STATE ONLY. Nothing here is persisted and nothing is sent back to
 *  the server: there is no scenario store to save into yet, so a reload starts
 *  over. That is the honest behaviour until persistence exists.
 *
 *  WHERE SCENARIOS COME FROM. The backend owns the scenario MODEL — the three
 *  default identities, their kind, their status, and the observed levers the
 *  Current Plan was measured at. This store seeds from that payload once per
 *  scope and owns the mutable state afterwards. The frontend writes down no
 *  scenario name, no status value and no lever default of its own.
 *
 *  ISOLATION. Every update is immutable and touches exactly one scenario: the
 *  addressed scenario is rebuilt, every other is returned by reference. Three
 *  scenarios sharing one mutable object — where dragging one scenario's
 *  discount silently moved another's — is the bug this shape prevents.
 *
 *  `running` IS FRONTEND STATE. The backend status model has three values and
 *  `running` is not one of them; it is never sent and never received. It lives
 *  beside the scenario so a card can show its own spinner.
 *
 *  A RESULT BELONGS TO THE SCOPE AND LEVERS IT WAS COMPUTED FROM. Two things
 *  therefore invalidate it:
 *
 *    * a scope change, which reseeds the whole store from a fresh /run;
 *    * a lever change on that scenario, which drops its result and returns it
 *      to `not_simulated`.
 *
 *  Keeping a 10%-discount result on screen after the user selects 15% would be
 *  showing an answer to a question nobody asked any more.
 */
export interface ScenarioState extends Scenario {
  /** The levers this scenario ARRIVED with, kept so Reset can return it to
   *  its own starting point. Not necessarily the measured plan: the backend
   *  opens Aggressive Growth at the deepest approved treatment, and resetting
   *  that scenario to the measured depth would quietly turn it into a second
   *  Optimized Plan. Seeded from the payload and never written to. */
  seededLevers: LeverValues
  /** Frontend request state. Never sent to the backend. */
  running: boolean
  /** The executed result, when this scenario has been simulated. */
  simulation: SimulateResponse | null
  /** The last failure for this scenario, cleared on the next attempt. */
  error: string | null
}

export interface ScenarioStore {
  /** Identifies the scope the current scenarios were seeded from. */
  scopeKey: string | null
  scenarios: ScenarioState[]
  activeId: string
  /** Monotonic counter behind the ids of user-added scenarios. A counter, not
   *  a random or time-based id, because both are unavailable in some render
   *  paths and neither is needed for a session-local key. */
  nextIndex: number

  seed: (scopeKey: string, scenarios: Scenario[]) => void
  select: (id: string) => void
  setLever: (id: string, key: LeverKey, value: number) => void
  resetLevers: (id: string) => void
  addScenario: () => void

  startRun: (id: string) => void
  applyResult: (id: string, result: SimulateResponse) => void
  failRun: (id: string, message: string) => void
}

function copyLevers(levers: LeverValues): LeverValues {
  return { ...levers }
}

/** A scenario as it arrives from /run: never running, never simulated. */
function fresh(scenario: Scenario): ScenarioState {
  return {
    ...scenario,
    levers: copyLevers(scenario.levers),
    // A SECOND, SEPARATE copy — not the same object as `levers`. Sharing one
    // would make the starting point drift with every edit, which is the one
    // thing it must not do.
    seededLevers: copyLevers(scenario.levers),
    running: false,
    simulation: null,
    error: null,
  }
}

/** Rebuild ONE scenario; return every other by reference. The single place
 *  isolation is enforced, so there is one thing to get right. */
function patch(
  scenarios: ScenarioState[],
  id: string,
  change: (scenario: ScenarioState) => ScenarioState,
): ScenarioState[] {
  return scenarios.map((scenario) => (scenario.id === id ? change(scenario) : scenario))
}

export const useScenarioStore = create<ScenarioStore>()((set, get) => ({
  scopeKey: null,
  scenarios: [],
  activeId: 'current-plan',
  nextIndex: 1,

  seed: (scopeKey, scenarios) =>
    set({
      scopeKey,
      // A new scope discards every previous result and lever edit. The levers
      // were anchored on the old scope's observed values and the results were
      // computed over its rows; neither means anything here.
      scenarios: scenarios.map(fresh),
      activeId: scenarios[0]?.id ?? 'current-plan',
      nextIndex: 1,
    }),

  select: (id) => set({ activeId: id }),

  setLever: (id, key, value) =>
    set((state) => ({
      scenarios: patch(state.scenarios, id, (scenario) =>
        scenario.editable_levers
          ? {
              ...scenario,
              levers: { ...scenario.levers, [key]: value },
              // The result described the OLD lever set. Drop it rather than
              // leave it on screen next to the new one.
              simulation: null,
              status: scenario.simulation ? 'not_simulated' : scenario.status,
              error: null,
            }
          : scenario,
      ),
    })),

  /** Back to the values THIS scenario was seeded with.
   *
   *  It used to reset to the Current Plan's measured levers, which was right
   *  while every hypothetical started there. Aggressive Growth now opens at the
   *  deepest approved treatment, and resetting it to the measured depth would
   *  have collapsed it into a copy of Optimized Plan — undoing the one thing
   *  that distinguishes the two. Each scenario returns to its own start. */
  resetLevers: (id) =>
    set((state) => ({
      scenarios: patch(state.scenarios, id, (scenario) =>
        scenario.editable_levers
          ? {
              ...scenario,
              levers: copyLevers(scenario.seededLevers),
              simulation: null,
              status: scenario.simulation ? 'not_simulated' : scenario.status,
              error: null,
            }
          : scenario,
      ),
    })),

  /** A new hypothetical scenario, seeded from whichever scenario is active.
   *  State creation only — a copied lever set carries no copied result. */
  addScenario: () => {
    const { scenarios, activeId, nextIndex } = get()
    const source = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
    if (!source) return
    const id = `scenario-${nextIndex}`
    const created: ScenarioState = {
      id,
      name: `Scenario ${nextIndex + 1}`,
      sub_label: `Copied from ${source.name}`,
      kind: 'hypothetical',
      status: 'not_simulated',
      levers: copyLevers(source.levers),
      seededLevers: copyLevers(source.levers),
      editable_levers: true,
      result: null,
      // Borrowed from an existing hypothetical rather than written down here:
      // the sentence explaining why a scenario has no result belongs to the
      // backend, which is the thing that knows.
      result_reason: scenarios.find((s) => s.kind === 'hypothetical')?.result_reason ?? null,
      running: false,
      simulation: null,
      error: null,
    }
    set({ scenarios: [...scenarios, created], activeId: id, nextIndex: nextIndex + 1 })
  },

  startRun: (id) =>
    set((state) => ({
      scenarios: patch(state.scenarios, id, (s) => ({ ...s, running: true, error: null })),
    })),

  /** Attach a real executed result to ONE scenario.
   *
   *  `status` becomes 'simulated' here and nowhere else in the frontend, and
   *  only with a response in hand — the same rule the backend guard enforces.
   *  The scenario's levers are left exactly as they were: the run was made
   *  from them, so overwriting them would detach the result from its inputs.
   */
  applyResult: (id, result) =>
    set((state) => ({
      scenarios: patch(state.scenarios, id, (s) => ({
        ...s,
        running: false,
        error: null,
        status: 'simulated',
        simulation: result,
      })),
    })),

  failRun: (id, message) =>
    set((state) => ({
      scenarios: patch(state.scenarios, id, (s) => ({
        ...s,
        running: false,
        error: message,
        // Status and any previous result are left alone. A failed attempt
        // tells us nothing new about the scenario.
      })),
    })),
}))
