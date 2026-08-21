import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../lib/api'
import type {
  OptimizationRequest,
  OptimizationResponse,
  OptimizationScopeRequest,
  OptimizationScopeResponse,
} from '../types/optimization'

/** POST /api/simulation/general-optimization/scope.
 *
 *  MEASURES the selected category / channel / month so the controls can be
 *  bounded. The trade-spend ceiling in particular is a measurement — the mean
 *  Trade Spend across 2024 and 2025 for that scope — and the client has no way
 *  to work it out, which is exactly why it is fetched rather than assumed.
 *
 *  A mutation rather than a query because it is driven by an explicit control
 *  change and its `isPending` / `error` are the states the panel renders.
 */
export function useOptimizationScope() {
  return useMutation<OptimizationScopeResponse, Error, OptimizationScopeRequest>({
    mutationFn: (body) => apiPost<OptimizationScopeResponse>('/simulation/general-optimization/scope', body),
  })
}

/** POST /api/simulation/general-optimization — solve the allocation.
 *
 *  THE OPTIMIZER RUNS ON THE SERVER, deliberately. The objective, the approved
 *  treatment set, the uplift bands and the budget constraint all live beside
 *  the economics that define them; a copy in the browser would be a second set
 *  of business rules free to drift from the first.
 *
 *  The frontend's whole job here is to collect four constraints and render
 *  what comes back — including the statuses that carry no numbers at all.
 */
export function useGeneralOptimization() {
  return useMutation<OptimizationResponse, Error, OptimizationRequest>({
    mutationFn: (body) => apiPost<OptimizationResponse>('/simulation/general-optimization', body),
  })
}
