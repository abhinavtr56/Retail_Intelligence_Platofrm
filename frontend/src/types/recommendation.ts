/** The recommendation contract — B4.3.
 *
 *  Mirrors backend/app/tpo/recommendation.py.
 *
 *  THE POLICY TRAVELS WITH THE ANSWER. `policy` carries the objective, the
 *  economic constraint and the full decision hierarchy that produced this
 *  result, so a recommendation is never a black box and the UI can say
 *  exactly what rule was applied.
 *
 *  There is no score, no rank and no weight in this contract — the engine is
 *  deterministic business rules over numbers the validated KPI engine already
 *  produced.
 */

import type { SimulationKpiKey } from './simulation'

export type RecommendationStatus =
  | 'recommended'
  | 'maintain_current_plan'
  | 'no_clear_winner'
  | 'insufficient_data'

export type DecisionEndpoint = 'low' | 'high'
export type DecisionDirection = 'higher_is_preferred' | 'lower_is_preferred'

export interface DecisionCriterion {
  metric: string
  endpoint: DecisionEndpoint
  direction: DecisionDirection
  role: 'primary' | 'tie_breaker'
  note: string
}

export interface RecommendationPolicy {
  version: string
  objective: string
  economic_constraint: {
    metric: string
    endpoints: DecisionEndpoint[]
    must_be: string
    note: string
  }
  primary_metric: string
  /** Always 'low' under the initial policy — the conservative reading. */
  primary_endpoint: DecisionEndpoint
  hierarchy: DecisionCriterion[]
  required_metrics: string[]
  range_policy: string
  tolerance: Record<string, number>
}

/** One metric as evidence. A measured baseline has no band, so `low` and
 *  `high` carry the same figure — a property of a measurement, not a
 *  collapsed range. */
export interface EvidenceMetric {
  low: number | null
  high: number | null
  display_low: string | null
  display_high: string | null
  available: boolean
  unavailable_reason: string | null
}

export type Evidence = Record<SimulationKpiKey, EvidenceMetric>

export interface EligibleScenario {
  scenario_id: string
  name: string
  treatment: string | null
  discount_pct: number | null
  uplift: { low: number; high: number } | null
  evidence: Evidence
}

export interface ExcludedScenario {
  scenario_id: string
  name: string
  reason: string
}

/** One rung of the hierarchy as it was actually applied. */
export interface DecisionStep {
  criterion: string
  endpoint: DecisionEndpoint
  direction?: DecisionDirection
  role: 'primary' | 'tie_breaker'
  outcome: 'separated' | 'tied' | 'skipped'
  detail?: string
  readings: Record<string, number | null>
  leading_value?: number
  tolerance?: number
  leaders?: string[]
}

export interface Recommendation {
  status: RecommendationStatus
  recommended_scenario_id: string | null
  policy: RecommendationPolicy
  eligible_scenarios: EligibleScenario[]
  excluded_scenarios: ExcludedScenario[]
  decision_path: DecisionStep[]
  evidence: { current_plan?: Evidence; recommended?: Evidence }
  reason: string
  comparison_status: string
  /** Named only when status is `insufficient_data`. */
  missing?: string[]
  provenance: {
    decided_by: string
    policy_version: string
    comparison: Record<string, unknown>
    method: string
  }
  meta: { currency: string; phase: string }
}
