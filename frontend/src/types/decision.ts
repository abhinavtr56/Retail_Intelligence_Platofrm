export interface StrategyItem {
  label: string
  value: string
  sub: string
  icon: string
}

export interface DecisionImpact {
  label: string
  value: string
  delta: string
  deltaSub?: string
  trend: 'up' | 'down'
  tone?: 'success'
}

export interface GovernanceItem {
  label: string
  sub: string
  status: string
  tone: 'success' | 'warning'
  icon: string
}

export interface ScenarioSummaryRow {
  metric: string
  icon: string
  s1: string
  s2: string
  s3: string
}

export interface WorkflowStep {
  step: number
  label: string
  status: 'Ready' | 'Pending' | 'Not Started'
}

export interface DecisionPageData {
  recommendedPlan: { scenarioName: string; summary: string }
  strategy: StrategyItem[]
  impact: DecisionImpact[]
  impactNote: string
  governance: GovernanceItem[]
  scenarioSummary: ScenarioSummaryRow[]
  workflow: WorkflowStep[]
  version: string
  lastSaved: string
}
