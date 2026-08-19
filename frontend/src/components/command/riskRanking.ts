import type { RiskAlert } from '../../types/commandCenter'

/** How Risk Alerts are prioritised in the Command Center.
 *
 *  Kept apart from the panel component so both the panel and the hero banner
 *  read ONE definition — the banner cannot disagree with the list beneath it.
 *
 *  This re-ranks, it never recomputes: every ROI, stake and severity is the
 *  value the backend produced. No financial figure is derived here.
 *
 *  SEVERITY decides the segment; FINANCIAL IMPACT decides the order within it.
 *  Ranking by worst ROI instead fills the Critical tab with tiny 5% Discount
 *  events — technically the lowest ROI, but a rounding error in money terms —
 *  and buries the large promotions that actually put revenue at risk.
 */

export const SEVERITIES = ['Critical', 'High', 'Medium'] as const
export type Severity = (typeof SEVERITIES)[number]

/** Critical beats High beats Medium. */
export const SEVERITY_RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2 }

/** Highest financial impact first: At Stake descending, with the weaker ROI
 *  breaking ties. `at_stake` is the API's own figure — the additional
 *  incremental revenue the event needs to reach target — not a number
 *  computed here. */
export function rankByImpact(a: RiskAlert, b: RiskAlert): number {
  return b.at_stake - a.at_stake || (a.roi_pct ?? 0) - (b.roi_pct ?? 0)
}

/** The single highest-priority alert: severity first, then largest stake, with
 *  ROI only as a tie-break. Undefined when the selection has no alert at all.
 *
 *  So a Critical always outranks a High however small, and within Critical the
 *  banner names the event with the most money at stake. */
export function topPriorityAlert(alerts: RiskAlert[] | undefined): RiskAlert | undefined {
  if (!alerts?.length) return undefined
  return [...alerts].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || rankByImpact(a, b),
  )[0]
}
