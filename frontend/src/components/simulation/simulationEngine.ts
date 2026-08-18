import type { LeverValues, RiskFactor, Scenario, SimulationPageData } from '../../types/simulation'

// Ported verbatim from js/pages/simulation.js — the deterministic scenario math.
// Pure functions only; the page component owns all React state around these.

export function parseNum(s: string): number {
  const m = String(s).match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : 0
}

export function buildRisk(base: RiskFactor[], factor: number): RiskFactor[] {
  return base.map((r) => {
    const pct = Math.min(95, Math.max(8, Math.round(r.pct * factor)))
    let tone = r.tone
    let status = r.status
    const sub = r.sub
    if (pct < 35) tone = 'success'
    else if (pct < 65) tone = 'warning'
    else tone = 'danger'
    if (r.key === 'budget' || r.key === 'policy') {
      if (pct < 80) {
        tone = 'success'
        status = 'Compliant'
      } else {
        tone = 'warning'
        status = 'Near Limit'
      }
    } else {
      status = pct < 35 ? 'Low' : pct < 65 ? 'Medium' : 'High'
    }
    return { ...r, pct, tone, status, sub }
  })
}

export function buildInitialScenarios(D: SimulationPageData): Scenario[] {
  return [
    {
      key: 's1',
      name: 'Current Plan',
      sub: 'Baseline',
      dotColor: '#7C5CFF',
      recommended: false,
      levers: { discount: 15, duration: 6, spend: 98.6, incentive: 3.5 },
      selects: { region: 'South Focus', sku: 'Top 15 SKUs', inventory: 'Standard' },
      impact: {
        revenue: parseNum(D.projectedImpact.rows[0].cur),
        roi: parseNum(D.projectedImpact.rows[1].cur),
        margin: parseNum(D.projectedImpact.rows[2].cur),
        prob: parseNum(D.projectedImpact.rows[3].cur),
        sellthrough: parseNum(D.projectedImpact.rows[4].cur),
        cannib: -22.4,
      },
      series: { weekly: [...D.incOverTime.s1], roi: [...D.roiTrajectory.s1] },
      risk: buildRisk(D.risk, 1.4),
      confidence: D.confidence.s1,
      breakeven: D.breakeven.s1,
      peakROI: D.peakROI.s1,
    },
    {
      key: 's2',
      name: 'Optimized Plan',
      sub: 'TIQ Recommended',
      dotColor: '#10B981',
      recommended: true,
      levers: { discount: 14, duration: 6, spend: 102, incentive: 3.8 },
      selects: { region: 'Optimized Mix', sku: 'Top 20 SKUs', inventory: 'Optimized' },
      impact: {
        revenue: parseNum(D.projectedImpact.rows[0].opt),
        roi: parseNum(D.projectedImpact.rows[1].opt),
        margin: parseNum(D.projectedImpact.rows[2].opt),
        prob: parseNum(D.projectedImpact.rows[3].opt),
        sellthrough: parseNum(D.projectedImpact.rows[4].opt),
        cannib: -14.2,
      },
      series: { weekly: [...D.incOverTime.s2], roi: [...D.roiTrajectory.s2] },
      risk: buildRisk(D.risk, 0.85),
      confidence: D.confidence.s2,
      breakeven: D.breakeven.s2,
      peakROI: D.peakROI.s2,
    },
    {
      key: 's3',
      name: 'Aggressive Growth',
      sub: 'Maximize Share',
      dotColor: '#4F7CFF',
      recommended: false,
      levers: { discount: 18, duration: 8, spend: 110.5, incentive: 4.2 },
      selects: { region: 'Pan-India', sku: 'Top 25 SKUs', inventory: 'Aggressive' },
      impact: {
        revenue: parseNum(D.projectedImpact.rows[0].agg),
        roi: parseNum(D.projectedImpact.rows[1].agg),
        margin: parseNum(D.projectedImpact.rows[2].agg),
        prob: parseNum(D.projectedImpact.rows[3].agg),
        sellthrough: parseNum(D.projectedImpact.rows[4].agg),
        cannib: -18.7,
      },
      series: { weekly: [...D.incOverTime.s3], roi: [...D.roiTrajectory.s3] },
      risk: buildRisk(D.risk, 1.1),
      confidence: D.confidence.s3,
      breakeven: D.breakeven.s3,
      peakROI: D.peakROI.s3,
    },
  ]
}

/** Deterministic recompute — given lever values and the s1 baseline, returns a new
 *  impact + series for whichever scenario is being recomputed. */
export function compute(levers: LeverValues, s1: Scenario, riskBase: RiskFactor[]) {
  const dDisc = levers.discount - s1.levers.discount
  const dDur = levers.duration - s1.levers.duration
  const dSpend = levers.spend - s1.levers.spend
  const dInc = levers.incentive - s1.levers.incentive
  const overDisc = Math.max(0, levers.discount - 14)

  const SPEND_COEF = 2.45
  const DUR_COEF = 6.2
  const INC_COEF = 14.0
  const OVER_PEN = 4.5
  const revenueLift = dSpend * SPEND_COEF + dDur * DUR_COEF + dInc * INC_COEF - overDisc * OVER_PEN
  const revenue = Math.max(s1.impact.revenue * 0.7, s1.impact.revenue + revenueLift)
  const roi = revenue / Math.max(0.1, levers.spend)
  const margin = s1.impact.margin + (revenue - s1.impact.revenue) * 0.045 - overDisc * 0.22
  const prob = Math.min(99, Math.max(45, s1.impact.prob + (revenue - s1.impact.revenue) * 0.065 - overDisc * 1.4))
  const sellthrough = s1.impact.sellthrough + (revenue - s1.impact.revenue) * 0.0125
  const cannib = s1.impact.cannib - Math.max(0, dDisc) * 0.4 - overDisc * 0.6

  const ratio = revenue / s1.impact.revenue
  const weekly = s1.series.weekly.map((v) => +(v * ratio).toFixed(1))
  const roiSeries = s1.series.roi.map((v) => +(v * (roi / s1.impact.roi)).toFixed(2))

  const breakeven = roi >= 2.4 ? 'W2' : roi >= 1.8 ? 'W3' : roi >= 1.5 ? 'W4' : 'W5'
  const peakROI = Math.max(...roiSeries).toFixed(2)
  const confidence = Math.round(Math.min(96, Math.max(58, 70 + (roi - 1.5) * 18 - overDisc * 1.5)))

  return {
    impact: { revenue, roi, margin, prob, sellthrough, cannib: -Math.abs(cannib) },
    series: { weekly, roi: roiSeries },
    breakeven,
    peakROI,
    confidence,
    risk: buildRisk(riskBase, overDisc > 4 ? 1.35 : roi >= 2.0 ? 0.85 : 1.1),
  }
}

export const SELECT_OPTIONS: Record<string, string[]> = {
  region: ['South Focus', 'Optimized Mix', 'Pan-India', 'North & West Focus', 'Metro-only (Tier 1)', 'Tier 2 & 3 Push', 'South + East'],
  sku: [
    'Top 10 SKUs',
    'Top 15 SKUs',
    'Top 20 SKUs',
    'Top 25 SKUs',
    'Top 50 SKUs',
    'Premium Hair Care',
    'Core Hair Care',
    'Skin Care',
    'Oral Care',
    'All Active SKUs',
  ],
  inventory: ['Standard', 'Optimized', 'Aggressive Load-in', 'Conservative', 'Demand-led Replenishment', 'Channel-balanced'],
}

export const NEW_SCENARIO_PALETTE = ['#F97316', '#EC4899', '#06B6D4', '#A855F7', '#84CC16']
