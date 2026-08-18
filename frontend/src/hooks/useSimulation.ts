import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { SimulationPageData } from '../types/simulation'
import type { InvestigationType } from '../types/investigation'

// Same merge pattern as useIntelligencePage: shared default + per-type override.
export function useSimulationPage(type: InvestigationType) {
  const base = useQuery({
    queryKey: ['simulation-default'],
    queryFn: () => apiFetch<SimulationPageData>('/simulation-default'),
  })
  const override = useQuery({
    queryKey: ['simulation', type],
    queryFn: () => apiFetch<Partial<SimulationPageData>>(`/simulation/${type}`),
  })

  const data = base.data && override.data ? { ...base.data, ...override.data } : undefined
  return { data, isLoading: base.isLoading || override.isLoading, isError: base.isError || override.isError }
}
