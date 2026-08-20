/** The risk & governance contract — B6.
 *
 *  Mirrors backend/app/tpo/risk.py.
 *
 *  RISK IS NOT RECOMMENDATION. `recommendation_context` carries B4.3's answer
 *  through untouched; nothing in this contract changes which scenario was
 *  recommended, and there is no risk score, no weight and no risk-adjusted
 *  winner.
 *
 *  A metric with no approved boundary is reported as a MEASUREMENT plus a
 *  named GOVERNANCE GAP — never judged against an invented threshold. The
 *  frontend renders this and assesses nothing.
 */

export type RiskCategory =
  | 'ECONOMIC'
  | 'ASSUMPTION'
  | 'DATA_AVAILABILITY'
  | 'SCOPE'
  | 'CANNIBALIZATION'
  | 'EXECUTION'
  | 'GOVERNANCE'

export type FindingStatus = 'clear' | 'attention' | 'unknown'
/** `unknown` is a real answer — used whenever no approved rule defines what
 *  "enough" would be. */
export type Severity = 'low' | 'medium' | 'high' | 'unknown'

export interface RiskFinding {
  id: string
  category: RiskCategory
  status: FindingStatus
  severity: Severity
  title: string
  reason: string
  evidence: Record<string, unknown>
  source: string
  impact: string
  /** A governance step to verify before executing — never a different
   *  scenario. */
  recommended_action: string | null
}

/** A boundary the project has NOT approved. */
export interface GovernanceGap {
  key: string
  label: string
  statement: string
}

/** A property of the method, true of every scenario — not a risk of this one. */
export interface RiskLimitation {
  id: string
  category: string
  title: string
  statement: string
  implication: string
}

export interface RiskRequest {
  scenario: unknown
  recommendation?: unknown
  weekly_included?: boolean
}

export interface RiskAssessment {
  scenario_id: string
  treatment: string
  discount_pct: number
  overall_status: FindingStatus
  /** The exact rule that produced the status. No score is computed. */
  overall_status_rule: string
  summary: string
  findings: RiskFinding[]
  governance_gaps: GovernanceGap[]
  limitations: RiskLimitation[]
  recommendation_context: {
    recommended_scenario_id: string | null
    recommendation_policy_version: string | null
    is_recommended: boolean
    note: string
  }
  policy: {
    version: string
    principle: string
    overall_status_rule: string
    narrow_headroom_pp: number
    narrow_headroom_source: string
    governance_critical: string[]
  }
  provenance: {
    assessed_by: string
    policy_version: string
    scenario_provenance: Record<string, unknown> | null
    method: string
  }
  meta: { phase: string }
}
