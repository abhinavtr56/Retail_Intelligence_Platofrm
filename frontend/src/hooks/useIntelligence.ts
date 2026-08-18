import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { IntelligenceAnswer, IntelligencePageData } from '../types/intelligence'
import type { InvestigationType } from '../types/investigation'

// Ported from js/pages/intelligence.js: `Object.assign({}, DATA.intelligence, typeData)`
// — the shared/default block provides tabs + every table that isn't overridden per
// investigation type; the per-type slice overrides title/subtitle/waterfall/etc.
export function useIntelligencePage(type: InvestigationType) {
  const base = useQuery({
    queryKey: ['intelligence-default'],
    queryFn: () => apiFetch<IntelligencePageData>('/intelligence-default'),
  })
  const override = useQuery({
    queryKey: ['intelligence', type],
    queryFn: () => apiFetch<Partial<IntelligencePageData>>(`/intelligence/${type}`),
  })

  const data = base.data && override.data ? { ...base.data, ...override.data } : undefined
  return { data, isLoading: base.isLoading || override.isLoading, isError: base.isError || override.isError }
}

export function useIntelligenceAnswer(type: InvestigationType) {
  return useQuery({
    queryKey: ['intelligence-answers', type],
    queryFn: () => apiFetch<IntelligenceAnswer>(`/intelligence-answers/${type}`),
  })
}
