/** Durable storage — B10.
 *
 *  Mirrors backend/app/store/repository.py. Every payload below is an ENVELOPE
 *  around something a frozen contract produced: `simulation` is the
 *  /simulation/simulate response, `record` is the /decision/record response,
 *  both stored and returned verbatim.
 *
 *  THE RECORD KEEPS B7'S GUARANTEES. Inside `StoredDecision.record`,
 *  `decision_id` is still null, `status` is still 'draft' and
 *  `meta.persisted` is still false — exactly as B7 wrote them. The storage
 *  facts live on the envelope instead. That is what lets a decision read back
 *  out of the store still be accepted by /api/decision/briefing, which refuses
 *  any record claiming an id or persistence.
 *
 *  NO OWNER. `owner` is always null and `owner_note` says why: this
 *  application has no authentication, so there is no actor to attribute a
 *  record to and none has been invented.
 */

import type { DecisionRecord } from './decision'
import type { SimulateResponse } from './simulation'

/** Which data a stored payload was computed from, and whether that is still
 *  the data this server has loaded. */
export interface DatasetLineage {
  dataset_version: string
  current_dataset_version: string
  /** True when the source data has changed since this was saved. The stored
   *  values are historical and have NOT been recomputed. */
  stale: boolean
  stale_reason: string | null
}

export interface StoredScenario extends DatasetLineage {
  /** Server-minted, e.g. `scn_a1b2…`. Never the session-local `scenario-N`. */
  scenario_id: string
  investigation_id: string | null
  name: string
  version: number
  current_version: number
  versions: number[]
  persisted: true
  owner: null
  owner_note: string
  created_at: string
  saved_at: string
  /** The /simulation/simulate response, byte for byte. */
  simulation: SimulateResponse
}

export interface StoredDecisionVersion {
  version: number
  saved_at: string
  dataset_version: string
}

export interface StoredDecision extends DatasetLineage {
  /** Server-minted, e.g. `dec_a1b2…`. The id a person cites. */
  decision_id: string
  version: number
  current_version: number
  versions: StoredDecisionVersion[]
  status: 'draft'
  persisted: true
  owner: null
  owner_note: string
  investigation_id: string | null
  scenario_id: string | null
  scenario_name: string | null
  created_at: string
  saved_at: string
  /** The B7 record, untouched. */
  record: DecisionRecord
}

/** One row of the history list. Headers only — no record payload. */
export interface StoredDecisionSummary extends DatasetLineage {
  decision_id: string
  version: number
  status: 'draft'
  persisted: true
  owner: null
  investigation_id: string | null
  scenario_id: string | null
  scenario_name: string | null
  created_at: string
  saved_at: string
}

export interface StoredDecisionList {
  decisions: StoredDecisionSummary[]
  owner_note: string
  current_dataset_version: string
}

export interface SaveScenarioRequest {
  context: unknown
  simulation: unknown
  name?: string
  /** Present to append a new version of an existing scenario. */
  scenario_id?: string
  /** The version the client believes is current. A stale expectation is
   *  refused with 409 rather than written over unseen work. */
  expected_version?: number
}

export interface SaveDecisionRequest {
  record: DecisionRecord
  investigation_id?: string | null
  scenario_id?: string | null
  decision_id?: string
  expected_version?: number
}
