import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { DecisionPageData } from '../types/decision'
import type { InvestigationType } from '../types/investigation'

export function useDecisionPage(type: InvestigationType) {
  const base = useQuery({
    queryKey: ['decision-default'],
    queryFn: () => apiFetch<DecisionPageData>('/decision-default'),
  })
  const override = useQuery({
    queryKey: ['decision', type],
    queryFn: () => apiFetch<Partial<DecisionPageData>>(`/decision/${type}`),
  })

  const data = base.data && override.data ? { ...base.data, ...override.data } : undefined
  return { data, isLoading: base.isLoading || override.isLoading, isError: base.isError || override.isError }
}
