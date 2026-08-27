import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiFetch, apiPost } from '../lib/api'
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
  const queryClient = useQueryClient()
  return useMutation<StoredDecision, Error, SaveDecisionRequest>({
    mutationFn: (body) => apiPost<StoredDecision>('/store/decisions', body),
    // THE HISTORY IS NOW ON THE SAME PAGE AS THE SAVE. It used to be rendered
    // only when nothing else was, so the list was always fetched fresh on the
    // way in and staleness never showed; recording a decision beside it left
    // the list showing the world as it was before the save — a decision saved
    // and a history that says none exists, on screen together.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['store', 'decisions'] }),
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

/** Empty the decision history.
 *
 *  THE ONE DESTRUCTIVE ACTION IN THIS APPLICATION. Everything else the store
 *  holds is append-only, and reports — which are derived and regenerable — were
 *  the only clearable thing until now. This deletes real saved decisions and
 *  they do not come back, which is why the only caller confirms first and why
 *  the response's own count is what the toast reports rather than an assumption
 *  that it worked.
 *
 *  The listing is invalidated rather than optimistically emptied: what the
 *  history shows afterwards is what the server says it holds. */
export function useClearDecisions() {
  const queryClient = useQueryClient()
  return useMutation<{ deleted: number; total: number }, Error, void>({
    mutationFn: () => apiDelete<{ deleted: number; total: number }>('/store/decisions'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store', 'decisions'] })
      // Any single decision cached by id is gone from the server too.
      queryClient.removeQueries({ queryKey: ['store', 'decision'] })
    },
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
