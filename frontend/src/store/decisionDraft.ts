import { create } from 'zustand'
import type { SimulationContext } from '../types/investigationContext'
import type { SimulateResponse } from '../types/simulation'
import type { Recommendation } from '../types/recommendation'
import type { RiskAssessment } from '../types/risk'
import type { WeeklyResponse } from '../types/weekly'

/** The Simulation → Decision Center handoff — B7.
 *
 *  SESSION STATE ONLY, and deliberately not persisted. B7 adds no storage of
 *  any kind: this store is not written to localStorage, and a reload loses the
 *  draft. That is the honest behaviour while `decision_id` is null — pretending
 *  otherwise would imply the record could be retrieved later.
 *
 *  IT CARRIES RESULTS, NOT CALCULATIONS. The five payloads the user was already
 *  looking at travel across unchanged. Nothing is recomputed here, and no
 *  scenario economics, uplift rule or KPI formula exists anywhere in this file.
 *
 *  STALENESS IS THE REAL RISK. A decision record describing a scenario the user
 *  has since changed would be worse than no record: it would look authoritative
 *  and be out of date. So the draft carries the SIGNATURE of the state it was
 *  taken from — scope, scenario, treatment, recommendation and risk status —
 *  and Simulation Studio drops it the moment that signature stops matching.
 */
export interface DecisionDraft {
  /** Identifies the exact state this draft was taken from. */
  signature: string
  scenarioId: string
  scenarioName: string
  context: SimulationContext
  simulation: SimulateResponse
  recommendation: Recommendation
  risk: RiskAssessment
  weekly: WeeklyResponse | null
}

export interface DecisionDraftStore {
  draft: DecisionDraft | null
  carry: (draft: DecisionDraft) => void
  clear: () => void
}

export const useDecisionDraftStore = create<DecisionDraftStore>()((set) => ({
  draft: null,
  carry: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}))

/** The signature of the state a draft was taken from.
 *
 *  Built from identity and treatment rather than from the payloads themselves:
 *  comparing whole results would make the check expensive and would also fire
 *  on a re-run that produced the same answer.
 */
export function draftSignature(input: {
  scopeKey: string
  scenarioId: string
  discountPct: number | null
  recommendedScenarioId: string | null | undefined
  riskStatus: string | null | undefined
  weeklyScenarioId: string | null | undefined
}): string {
  return JSON.stringify([
    input.scopeKey,
    input.scenarioId,
    input.discountPct,
    input.recommendedScenarioId ?? null,
    input.riskStatus ?? null,
    input.weeklyScenarioId ?? null,
  ])
}
