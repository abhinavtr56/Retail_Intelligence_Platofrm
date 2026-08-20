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
  }
  expected_impact: DecisionImpactMetric[]
  recommendation: {
    recommended_scenario_id: string | null
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
}
