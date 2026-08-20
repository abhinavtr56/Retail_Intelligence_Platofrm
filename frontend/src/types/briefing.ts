/** The portable decision briefing — B8.
 *
 *  Mirrors backend/app/tpo/briefing.py. Two artifacts rendered from ONE B7
 *  decision record: `briefing.json` for a machine, `briefing.html` for a person
 *  and their browser's Print → Save as PDF.
 *
 *  A RENDERING, NOT A CALCULATION. Nothing is recomputed on either side of the
 *  wire; `briefing.record` is the record the client already holds, returned
 *  unchanged.
 *
 *  NO IDENTITY. The envelope carries no author and no approver, because this
 *  application has no authentication and could not establish either.
 */

import type { DecisionRecord } from './decision'

export interface BriefingExport {
  exported_at: string
  /** Always 'draft' — the only state a record can be in. */
  record_status: 'draft'
  persisted: false
  approved: false
  source: '/api/decision/record'
  /** States that the decision is neither approved nor saved. */
  disclaimer: string
  /** States that no author or approver is named, and why. */
  identity: string
  method: string
  phase: string
}

export interface BriefingResponse {
  /** The `briefing.json` artifact, verbatim. */
  briefing: { export: BriefingExport; record: DecisionRecord }
  /** The `briefing.html` artifact — one self-contained document. */
  html: string
  filenames: { json: string; html: string }
}

export interface BriefingRequest {
  record: DecisionRecord
}
