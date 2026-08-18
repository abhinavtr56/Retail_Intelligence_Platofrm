export interface LeverDef {
  key: 'discount' | 'duration' | 'spend' | 'incentive'
  label: string
  min: number
  max: number
  step: number
  value: number
  decimals: number
}

export interface SelectDef {
  key: 'region' | 'sku' | 'inventory'
  label: string
  value: string
}

export interface ImpactRow {
  metric: string
  cur: string
  opt: string
  optDelta: string
  agg: string
  aggDelta: string
}

export interface RiskFactor {
  key: string
  label: string
  status: string
  sub: string
  tone: 'success' | 'warning' | 'danger'
  icon: string
  pct: number
}

export interface SimulationPageData {
  scenarios: unknown
  levers: LeverDef[]
  selects: SelectDef[]
  projectedImpact: { rows: ImpactRow[] }
  incOverTime: { labels: string[]; s1: number[]; s2: number[]; s3: number[]; target: number[] }
  roiTrajectory: { labels: string[]; s1: number[]; s2: number[]; s3: number[] }
  breakeven: { s1: string; s2: string; s3: string }
  peakROI: { s1: string; s2: string; s3: string }
  risk: RiskFactor[]
  confidence: { s1: number; s2: number; s3: number }
  recommendation?: unknown
}

export type LeverValues = Record<LeverDef['key'], number>
export type SelectValues = Record<SelectDef['key'], string>

export interface ScenarioImpact {
  revenue: number
  roi: number
  margin: number
  prob: number
  sellthrough: number
  cannib: number
}

export interface Scenario {
  key: string
  name: string
  sub: string
  dotColor: string
  recommended: boolean
  levers: LeverValues
  selects: SelectValues
  impact: ScenarioImpact
  series: { weekly: number[]; roi: number[] }
  risk: RiskFactor[]
  confidence: number
  breakeven: string
  peakROI: string
}
