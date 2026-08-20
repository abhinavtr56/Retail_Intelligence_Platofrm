import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiPost } from '../lib/api'
import type { InvestigationTypeMeta, LegacyInvestigation, Orchestration } from '../types/orchestration'
import type { InvestigationQueryResult, InvestigationType, RecentInvestigation } from '../types/investigation'

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

// Shared, backend-persisted "recent investigations" list — replaces what
// used to be a localStorage-only Zustand array. Seeded on mount; kept in
// sync after each submission via useSubmitInvestigationQuery below (it
// writes the response's `history` straight into this query's cache, so
// there's no extra round-trip).
export function useRecentInvestigations() {
  return useQuery({
    queryKey: ['investigations', 'recent'],
    queryFn: () => apiFetch<RecentInvestigation[]>('/investigations/recent'),
  })
}

// Classifies a free-text question into one of the 4 archetypes server-side
// (backend/app/routers/investigations.py's infer_investigation_type) and
// records it in the shared history — the backend counterpart to what used
// to be Investigations.tsx's client-only `inferType` + Zustand `addActive`.
export function useSubmitInvestigationQuery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (question: string) => apiPost<InvestigationQueryResult>('/investigations/query', { question }),
    onSuccess: (result) => {
      queryClient.setQueryData(['investigations', 'recent'], result.history)
    },
  })
}
