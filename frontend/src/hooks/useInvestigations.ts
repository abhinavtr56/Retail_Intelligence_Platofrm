import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { InvestigationTypeMeta, LegacyInvestigation, Orchestration } from '../types/orchestration'
import type { InvestigationType } from '../types/investigation'

export function useInvestigationTypes() {
  return useQuery({
    queryKey: ['investigation-types'],
    queryFn: () => apiFetch<InvestigationTypeMeta[]>('/investigation-types'),
  })
}

export function useOrchestration(type: InvestigationType) {
  return useQuery({
    queryKey: ['investigations', type],
    queryFn: () => apiFetch<Orchestration>(`/investigations/${type}`),
  })
}

// Only used for its `legend` field, which the vanilla app treats as a shared
// constant (js/pages/investigations.js reads `DATA.investigation.legend`, not a
// per-type one — see js/data.js).
export function useLegacyInvestigation() {
  return useQuery({
    queryKey: ['investigations', 'legacy'],
    queryFn: () => apiFetch<LegacyInvestigation>('/investigations/legacy'),
  })
}
