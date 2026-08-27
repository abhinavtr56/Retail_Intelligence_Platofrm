import { create } from 'zustand'
import type { DecisionCandidate } from '../types/decisionCandidate'

/** The scenarios Decision Center is holding for comparison — B-DC2.
 *
 *  A COLLECTION, NOT A DESTINATION. The Decision Center used to receive one
 *  scenario at a time: Simulation Studio carried a draft here, this page
 *  assembled a record from it, and carrying a second one replaced the first.
 *  Comparing what General Optimization proposed against what Target Rescue
 *  recommended was not possible at all, because neither module could send
 *  anything. This store is what makes several candidates coexist.
 *
 *  IT DOES NOT OWN THE SCENARIOS. Every entry is a COPY of a result its own
 *  module computed and still holds. Removing one here removes it from the
 *  comparison and from nothing else — the simulation's scenario store, the
 *  optimizer's last run and the rescue evaluation are all untouched, which is
 *  what lets a user prune the board without losing work.
 *
 *  SESSION STATE, like store/decisionDraft.ts beside it and for the same
 *  reason: there is no server-side candidate list, and persisting one would
 *  imply a durability the API does not provide. A SAVED DECISION is the
 *  durable artefact, and that path is unchanged.
 *
 *  ADDING IS IDEMPOTENT PER SCENARIO. `id` is composed by the builders from
 *  the source module and the scenario's own identity, so pressing "Add to
 *  Decision Center" twice on the same scenario REPLACES the entry with the
 *  fresher figures instead of stacking a duplicate row that would compare a
 *  scenario against itself.
 */
interface DecisionCandidateStore {
  candidates: DecisionCandidate[]
  /** The candidate whose full record is open below the board. Null until one
   *  is chosen, and cleared when that candidate is removed. */
  selectedId: string | null
  add: (candidate: DecisionCandidate) => void
  remove: (id: string) => void
  select: (id: string | null) => void
  clear: () => void
}

export const useDecisionCandidateStore = create<DecisionCandidateStore>()((set) => ({
  candidates: [],
  selectedId: null,
  add: (candidate) =>
    set((s) => {
      const without = s.candidates.filter((c) => c.id !== candidate.id)
      return {
        candidates: [...without, candidate],
        // A newly added candidate becomes the selected one only when nothing
        // was selected; replacing the board's selection under the user because
        // they added a fourth scenario would move the record they were reading.
        selectedId: s.selectedId ?? candidate.id,
      }
    }),
  remove: (id) =>
    set((s) => {
      const candidates = s.candidates.filter((c) => c.id !== id)
      return {
        candidates,
        selectedId: s.selectedId === id ? (candidates[0]?.id ?? null) : s.selectedId,
      }
    }),
  select: (selectedId) => set({ selectedId }),
  clear: () => set({ candidates: [], selectedId: null }),
}))
