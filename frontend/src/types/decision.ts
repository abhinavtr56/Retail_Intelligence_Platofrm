/** The governed decision record — B7.
 *
 *  Mirrors backend/app/tpo/decision.py. Replaces the authored
 *  `DecisionPageData` shape that fed the old static Decision Center.
 *
 *  AN ASSEMBLY, NOT A CALCULATION. Every figure is carried through verbatim
 *  from the contract that owns it — the simulation's KPIs, the recommendation's
 *  reason and policy, B6's findings, gaps and limitations. The frontend renders
 *  this and computes nothing.
 *
 *  NOT APPROVED AND NOT APPROVABLE. `can_be_approved` is false in every record:
 *  the project defines no approval criteria, so declaring one approvable would
 *  be inventing governance. Recommended, governed, ready-to-review and approved
 *  are four different states and the record keeps them apart.
 *
 *  NOT PERSISTED. `decision_id` is always null and `status` always "draft".
 */

import type { RiskFinding, GovernanceGap, RiskLimitation, FindingStatus } from './risk'
import type { WeeklyMetricSpec, WeeklyReconciliation, WeeklyWeek } from './weekly'
import type { ComparisonMetric, ComparisonScenario, ComparisonStatus } from './comparison'

/** One strategy lever the SELECTED SCENARIO actually carries — B-DC.
 *
 *  Three columns from three owners, none of them the browser:
 *  `current_*` is MEASURED (from /simulation/run's current plan, with the
 *  derivation that produced it), `selected_*` is the scenario's own setting,
 *  and `recommended_*` is the treatment depth of the scenario the decision
 *  policy chose — read out of the comparison by id, never re-derived.
 *
 *  A column with no source carries the reason instead of a value. Render the
 *  reason, never a blank and never a zero.
 */
export interface DecisionStrategyLever {
  key: string
  label: string
  unit: string
  current_value: number | number[] | null
  current_display: string | null
  current_available: boolean
  current_unavailable_reason: string | null
  current_derivation: string | null
  selected_value: number | null
  selected_available: boolean
  selected_unavailable_reason: string | null
  /** False means the engine RECORDS this lever and does not model it — the
   *  expected impact does not move with it. Carried verbatim; never inferred. */
  modelled: boolean
  derived: boolean
  note: string | null
  recommended_value: number | null
  recommended_treatment?: string | null
  recommended_available: boolean
  recommended_unavailable_reason: string | null
  /** Set only when the policy recommends keeping the MEASURED current plan.
   *  Then the recommended depth IS the measured one — same number, same
   *  source — and `recommended_display` carries the engine's own formatting. */
  recommended_display: string | null
  recommended_is_measured_plan: boolean
}

export interface DecisionStrategy {
  available: boolean
  treatment: string | null
  levers: DecisionStrategyLever[]
  baseline_available: boolean
  baseline_unavailable_reason: string | null
  note: string
}

/** One row of the comparison's scenario list, plus two id comparisons. */
export interface DecisionComparisonScenario extends ComparisonScenario {
  is_selected: boolean
  is_recommended: boolean
}

/** The scenario comparison, carried whole from /api/simulation/compare.
 *
 *  MEASURED AND SIMULATED STAY APART: each metric's `baseline` is measured from
 *  the rows in scope, each metric's `scenarios` carry simulated bands. Never
 *  render one as the other.
 */
export type DecisionComparison =
  | {
      available: true
      status: ComparisonStatus
      range_label: string | null
      scenarios: DecisionComparisonScenario[]
      metrics: ComparisonMetric[]
      economic_basis: {
        response_rule: string
        kpi_engine: string
        promotion_cost_rate: number
      } | null
      recommendation_status: string | null
      recommendation_reason: string | null
      measured_note: string
    }
  | { available: false; reason: string }

export interface DecisionImpactMetric {
  metric: string
  label: string | null
  unit: string | null
  /** Both ends of the approved uplift range. There is no midpoint. */
  low: number | null
  high: number | null
  display_low: string | null
  display_high: string | null
  available: boolean
  /** Preserved from the KPI engine. Never zero-filled. */
  unavailable_reason: string | null
}

export interface DecisionRecord {
  /** Always null — B7 persists nothing. */
  decision_id: null
  status: 'draft'
  scenario: {
    scenario_id: string
    name: string
    treatment: string | null
    discount_pct: number | null
    uplift: { low: number; high: number } | null
    range_label: string | null
  }
  investigation: {
    question: string | null
    /** 'rca' when the user actually asked it; 'seed_example' when the store was
     *  still holding the seeded default. */
    question_source: string | null
    question_unavailable_reason: string | null
    investigation_id: string | null
    investigation_id_unavailable_reason: string | null
    investigation_type: string | null
    source: string | null
  }
  scope: {
    filters_applied: Record<string, unknown> | null
    period: string | null
    row_count: number | null
    promoted_row_count: number | null
    excluded_rows: number | null
    /** Why the engine could not re-base those rows. Without this a row of
     *  zeros reads as "we evaluated it and it came to nothing", which is a
     *  different and false claim. */
    excluded_reason: string | null
    /** True when EVERY promoted row was excluded — the scenario had nothing to
     *  compute over, and the zeros are an absence of result, not an outcome. */
    all_promoted_rows_excluded: boolean
  }
  /** Only the levers the selected scenario actually carries. */
  strategy: DecisionStrategy
  expected_impact: DecisionImpactMetric[]
  comparison: DecisionComparison
  recommendation: {
    recommended_scenario_id: string | null
    /** The name a person gave it, resolved from the comparison. Falls back to
     *  the id when the comparison does not name it. */
    recommended_scenario_name: string | null
    /** Whether the carried scenario IS the recommended one. A comparison of two
     *  ids — selecting another scenario does not change what was recommended. */
    is_this_scenario: boolean
    status: string | null
    policy_version: string | null
    objective: string | null
    primary_metric: string | null
    primary_endpoint: string | null
    reason: string | null
    note: string
  }
  governance: {
    overall_status: FindingStatus
    overall_status_rule: string
    summary: string
    findings: RiskFinding[]
    governance_gaps: GovernanceGap[]
    limitations: RiskLimitation[]
    policy_version: string | null
  }
  weekly:
    | {
        available: true
        week_count: number
        weeks: WeeklyWeek[]
        metrics: WeeklyMetricSpec[]
        reconciliation: WeeklyReconciliation
        method: string | null
      }
    | { available: false; reason: string }
  readiness: {
    can_be_approved: false
    reason: string
    blockers: { id: string; title: string; detail: string }[]
    unverified: { id: string; title: string; detail: string; action: string | null }[]
    states: {
      recommended: boolean
      governed: boolean
      ready_to_review: boolean
      approved: false
    }
    states_note: string
  }
  provenance: {
    assembled_from: string[]
    kpi_engine: string | null
    response_rule: string | null
    promotion_cost_rate: number | null
    recommendation_policy_version: string | null
    risk_policy_version: string | null
    scenario_provenance: Record<string, unknown> | null
    method: string
  }
  meta: { phase: string; persisted: false; persistence_note: string }
}

export interface DecisionRecordRequest {
  context: unknown
  simulation: unknown
  recommendation: unknown
  risk: unknown
  weekly?: unknown
  /** /api/simulation/compare. Optional and additive — without it the record's
   *  comparison section carries the reason it is absent. */
  comparison?: unknown
  /** /api/simulation/run — the MEASURED baseline. The only source of a
   *  measured value on this page. */
  baseline?: unknown
}
