// Mirrors backend/app/investigation_runs.py + agents/pipeline.py.
import type { Orchestration } from './orchestration'
import type { InvestigationType } from './investigation'

export type RunStatus = 'running' | 'done' | 'error'
export type SpecialistStatus = 'queued' | 'running' | 'done'

export interface RunSpecialist {
  key: string
  name: string
  desc: string
  icon: string
  status: SpecialistStatus
}

export interface AgentFinding {
  key: string
  name: string
  desc: string
  analysis: string
  headline: string
  body: string
  evidence: string
  metric: string
  delta: string
  trend: 'up' | 'down' | ''
  impact: string
  confidence: number
}

export interface AgentSynthesis {
  summary: string
  root_cause: string
  confidence: number
  insight_count: number
  recommendations: string[]
}

export interface AgentRunResult {
  investigation_type: InvestigationType
  totals: Record<string, string | number | null>
  findings: AgentFinding[]
  synthesis: AgentSynthesis
  // Assembled server-side into the exact shape the graph already renders.
  orchestration: Orchestration
}

export interface InvestigationRun {
  id: string
  question: string
  dataset_id: string
  status: RunStatus
  stage: string
  specialists: RunSpecialist[]
  result: AgentRunResult | null
  error: string | null
  created_at: number
  updated_at: number
}
