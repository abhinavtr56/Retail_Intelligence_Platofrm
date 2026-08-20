import { useMutation } from '@tanstack/react-query'
import { apiPost } from '../lib/api'
import type { BriefingRequest, BriefingResponse } from '../types/briefing'
import type { DecisionRecord } from '../types/decision'

/** POST /api/decision/briefing — render the record as two portable artifacts.
 *
 *  A MUTATION, not a query: there is a body to send, and `isPending` / `error`
 *  are the real request state the button needs. Nothing is cached, because
 *  nothing is stored — the artifacts are built per request.
 *
 *  The record goes out and comes back unchanged; the only thing the server adds
 *  is the export timestamp and the rendered HTML.
 */
export function useDecisionBriefing() {
  return useMutation<BriefingResponse, Error, BriefingRequest>({
    mutationFn: (body) => apiPost<BriefingResponse>('/decision/briefing', body),
  })
}

/** Hand one file to the browser.
 *
 *  An object URL rather than a data: URL — a 52-week briefing is comfortably
 *  larger than the length some browsers accept in an href — and revoked on the
 *  next tick so the tab does not hold the blob for the rest of the session.
 */
function download(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Save both artifacts from one response.
 *
 *  BOTH, deliberately. The HTML is what a person reads and prints; the JSON is
 *  what survives being read by something else. Shipping only the HTML would
 *  make the record's own values unrecoverable from the artifact.
 */
export function saveBriefing(response: BriefingResponse) {
  download(
    response.filenames.json,
    JSON.stringify(response.briefing, null, 2),
    'application/json',
  )
  download(response.filenames.html, response.html, 'text/html')
}

export function briefingRequestFor(record: DecisionRecord): BriefingRequest {
  return { record }
}
