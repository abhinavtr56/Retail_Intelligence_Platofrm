import type { DecisionDraft } from '../store/decisionDraft'

/** A candidate the Decision Center is comparing — B-DC2.
 *
 *  ONE SHAPE, FOUR SOURCES. Simulation Studio, General Optimization, Target
 *  Rescue and the measured Current Plan each produce a scenario in their own
 *  contract, and none of those contracts can be compared with another
 *  directly: the simulation reports approved uplift BANDS over seven KPIs, the
 *  optimizer reports units/revenue/spend bands with no ROI at all, and a
 *  rescue rung reports point figures plus an attainment. This is the common
 *  denominator they can all be READ INTO — not a new model of a promotion.
 *
 *  IT CARRIES VALUES, IT DOES NOT PRODUCE THEM. Every number here was computed
 *  by the engine that owns it and is copied across with the display string that
 *  engine already formatted. Decision Center recalculates nothing: if a figure
 *  here ever disagrees with the same figure in Simulation Studio, the cause is
 *  a bug in the copy, not a second opinion.
 *
 *  ABSENT IS ABSENT. A source that does not produce a metric leaves it out
 *  entirely, or carries `available: false` with the reason its own engine gave.
 *  No zero stands in for a missing figure, and no metric is derived here from
 *  another one — deriving ROI for the optimizer, which does not compute one,
 *  would be inventing the number the comparison then ranks on.
 */

/** Which module produced the scenario. `measured` is the Current Plan — the
 *  observed baseline, not a modelled scenario. */
export type CandidateSource = 'measured' | 'simulation' | 'optimization' | 'rescue'

/** Whether a bigger number is better for this metric, which is the only thing
 *  that lets a comparison mark a best value without guessing. `neutral` metrics
 *  are shown and never ranked — a discount depth is a setting, not a score. */
export type MetricDirection = 'higher' | 'lower' | 'neutral'

export interface CandidateMetric {
  key: string
  label: string
  direction: MetricDirection
  /** The band ends, or the same number twice for a point figure. Null when the
   *  owning engine could not produce it. */
  low: number | null
  high: number | null
  /** The SOURCE ENGINE's own formatted string — never re-formatted here. */
  display: string
  available: boolean
  /** The owning engine's reason, verbatim. Null when the metric is available. */
  unavailable_reason: string | null
}

/** One setting of the plan — discount depth, treatment, mechanic, duration.
 *  Only the settings the source scenario actually carries. */
export interface CandidatePlanField {
  key: string
  label: string
  display: string
}

/** The risk position of this candidate, when its module assessed one.
 *
 *  COUNTS AND A STATUS, because that is what the risk engine produces: it
 *  computes no score and no weights (see types/risk.ts), so nothing here is a
 *  risk NUMBER beyond the checks themselves. Null when the module has no risk
 *  assessment — General Optimization and Target Rescue do not run one, and
 *  saying "no risk" for them would be a claim nobody made. */
export interface CandidateRisk {
  status: 'clear' | 'attention' | 'unknown'
  summary: string
  clear: number
  attention: number
  unknown: number
  policy_version: string
}

export interface DecisionCandidate {
  /** Decision Center's own id for this row. The source scenario keeps its own;
   *  removing a candidate here never touches it. */
  id: string
  name: string
  source: CandidateSource
  /** The badge — "SIMULATION", "TARGET RESCUE", … */
  sourceLabel: string
  /** What the source module was scoped to when this was produced. */
  scopeLabel: string
  addedAt: number
  plan: CandidatePlanField[]
  metrics: CandidateMetric[]
  risk: CandidateRisk | null
  /** How the owning engine described its own method. Shown so a comparison row
   *  can always be traced back to the rule that produced it. */
  basis: string
  /** Simulation only: the payload the existing single-record Decision Center
   *  assembles from. Null for the other sources, which have no such record —
   *  /api/decision/record takes simulation payloads and nothing else. */
  draft: DecisionDraft | null
}
