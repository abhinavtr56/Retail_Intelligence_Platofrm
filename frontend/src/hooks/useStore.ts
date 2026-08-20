import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch, apiPost } from '../lib/api'
import type {
  SaveDecisionRequest,
  SaveScenarioRequest,
  StoredDecision,
  StoredDecisionList,
  StoredScenario,
} from '../types/store'

/** Durable storage — B10.
 *
 *  Five thin calls around the frozen computation contracts. Nothing here
 *  computes anything: a save posts back a payload the client already holds,
 *  and a load returns exactly what was written.
 *
 *  SAVES ARE MUTATIONS, LOADS ARE QUERIES. A save has a body and its
 *  `isPending` / `error` are the real request state a button needs. A load is
 *  cached by id, because a stored record is immutable — re-fetching it can
 *  only return the same bytes.
 */

export function useSaveScenario() {
  return useMutation<StoredScenario, Error, SaveScenarioRequest>({
    mutationFn: (body) => apiPost<StoredScenario>('/store/scenarios', body),
  })
}

export function useStoredScenario(scenarioId: string | null) {
  return useQuery({
    queryKey: ['store', 'scenario', scenarioId],
    queryFn: () => apiFetch<StoredScenario>(`/store/scenarios/${scenarioId}`),
    enabled: Boolean(scenarioId),
    // A stored version never changes; there is nothing to go stale in cache.
    staleTime: Infinity,
    retry: false,
  })
}

export function useSaveDecision() {
  return useMutation<StoredDecision, Error, SaveDecisionRequest>({
    mutationFn: (body) => apiPost<StoredDecision>('/store/decisions', body),
  })
}

export function useStoredDecision(decisionId: string | null) {
  return useQuery({
    queryKey: ['store', 'decision', decisionId],
    queryFn: () => apiFetch<StoredDecision>(`/store/decisions/${decisionId}`),
    enabled: Boolean(decisionId),
    staleTime: Infinity,
    retry: false,
  })
}

export function useStoredDecisions(enabled = true) {
  return useQuery({
    queryKey: ['store', 'decisions'],
    queryFn: () => apiFetch<StoredDecisionList>('/store/decisions'),
    enabled,
    retry: false,
  })
}
