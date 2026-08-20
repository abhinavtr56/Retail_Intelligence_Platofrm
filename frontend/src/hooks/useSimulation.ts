import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../lib/api'
import type { CommandFilters } from '../store/commandFilters'
import type { SimulationRunRequest, SimulationRunResponse } from '../types/simulation'

/** POST /api/simulation/run.
 *
 *  A MUTATION, not a query: a run is an action the user takes, its result is
 *  what the page shows, and `isPending` / `error` are the real request state.
 *  The page's loading and error states are these two fields — there is no
 *  timer anywhere, and a failed request surfaces as an error with a retry
 *  rather than as a spinner that never resolves.
 *
 *  The two `/api/simulation-default` and `/api/simulation/{type}` readers this
 *  hook used to merge are gone from the flow. They served the authored demo
 *  payload — the impact strings, the weekly arrays, the risk percentages and
 *  the confidence scores that the client-side engine then rescaled.
 */
export function useSimulationRun() {
  return useMutation<SimulationRunResponse, Error, SimulationRunRequest>({
    mutationFn: (body) => apiPost<SimulationRunResponse>('/simulation/run', body),
  })
}

/** The Command Center's filter state, as the simulation API wants it.
 *
 *  Empty lists are dropped rather than sent as `[]`: an absent dimension means
 *  unconstrained, which is a different request from one constrained to
 *  nothing. `year: null` is likewise omitted — the backend reads an absent
 *  year as All Years, exactly as the Command Center's own query strings do.
 */
export function toSimulationFilters(filters: CommandFilters): SimulationRunRequest['filters'] {
  const out: SimulationRunRequest['filters'] = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      if (value.length) out[key as 'channel'] = value
    } else {
      out[key as 'year'] = value as number
    }
  }
  return out
}
