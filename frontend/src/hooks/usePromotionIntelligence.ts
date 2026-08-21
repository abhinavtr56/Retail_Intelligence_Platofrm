import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiPost } from '../lib/api'
import type {
  CoreFacts,
  IntelligenceContextResponse,
  IntelligenceFacts,
  IntelligenceRun,
} from '../types/promotionIntelligence'

/** The investigation's own filter object, forwarded whole. Anything dropped
 *  here would mean showing figures for a wider scope than the page claims. */
export type IntelligenceScope = Record<string, unknown>

const LIST_DIMENSIONS = ['channel', 'region', 'state', 'city', 'retailer', 'category', 'brand', 'promotion_type']

export type FactSection = 'core' | 'dimensions' | 'risk' | 'waterfall'

function toQuery(scope: IntelligenceScope, sections: FactSection[]): string {
  const p = new URLSearchParams()
  if (scope.year) p.set('year', String(scope.year))
  if (scope.month) p.set('month', String(scope.month))
  for (const dim of LIST_DIMENSIONS) {
    const v = scope[dim]
    const values = Array.isArray(v) ? v : v == null || v === '' ? [] : [v]
    if (values.length) p.set(dim, values.map(String).join(','))
  }
  p.set('sections', sections.join(','))
  return `?${p.toString()}`
}

// The deterministic half — no model, so it's unbilled, but not free: each
// breakdown re-runs the KPI engine once per group. Sections are fetched per
// tab and cached server-side per scope, so opening a tab costs its own data
// once and nothing thereafter.
//
// `staleTime: Infinity` because the underlying star schema is immutable seed
// data — re-fetching on focus would pay the cost again for an identical answer.

/** KPIs, saturation curve, trend and mechanic table — always loaded. */
export function useCoreFacts(scope: IntelligenceScope) {
  return useQuery({
    queryKey: ['pi-facts', scope, 'core'],
    queryFn: () => apiFetch<CoreFacts>(`/promotion-intelligence/facts${toQuery(scope, ['core'])}`),
    staleTime: Infinity,
  })
}

/** Heavier per-dimension tables and risk — loaded only when their tab opens. */
export function useFactSection(scope: IntelligenceScope, section: FactSection | null) {
  return useQuery({
    queryKey: ['pi-facts', scope, section],
    queryFn: () => apiFetch<Partial<IntelligenceFacts>>(`/promotion-intelligence/facts${toQuery(scope, [section!])}`),
    enabled: Boolean(section),
    staleTime: Infinity,
  })
}

// The investigation this page is meant to deepen, and any analysis already run
// against it. Promotion Intelligence is downstream of Investigations — without
// one it has nothing to go deeper on.
export function useIntelligenceContext(investigationRunId?: string) {
  return useQuery({
    queryKey: ['pi-context', investigationRunId ?? 'latest'],
    queryFn: () =>
      apiFetch<IntelligenceContextResponse>(
        `/promotion-intelligence/context${investigationRunId ? `?investigation_run_id=${investigationRunId}` : ''}`,
      ),
  })
}

export function useStartIntelligenceAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { investigation_run_id?: string; question?: string; filters?: Record<string, unknown> }) =>
      apiPost<IntelligenceRun>('/promotion-intelligence/analyze', body),
    onSuccess: (run) => queryClient.setQueryData(['pi-run', run.id], run),
  })
}

export function useIntelligenceRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['pi-run', runId],
    queryFn: () => apiFetch<IntelligenceRun>(`/promotion-intelligence/runs/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  })
}
