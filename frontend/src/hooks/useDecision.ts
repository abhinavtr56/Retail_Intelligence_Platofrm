import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../lib/api'
import type { DecisionRecord, DecisionRecordRequest } from '../types/decision'

/** POST /api/decision/record — assemble the governed decision record.
 *
 *  B7 replaced the two `/api/decision-default` and `/api/decision/{type}`
 *  readers this hook used to merge. They served the authored Decision Center
 *  payload — the static ROI of 2.55, the 89% "data confidence", the governance
 *  checks reporting compliance against budget and margin thresholds that this
 *  project has never defined. Those readers still exist in routers/pages.py,
 *  which is protected, but nothing calls them any more.
 *
 *  A MUTATION, not a query: the record is assembled from the five payloads the
 *  client is holding, so there is a body to send and `isPending` / `error` are
 *  the real request state. Nothing is recomputed on either side.
 */
export function useDecisionRecord() {
  return useMutation<DecisionRecord, Error, DecisionRecordRequest>({
    mutationFn: (body) => apiPost<DecisionRecord>('/decision/record', body),
  })
}
