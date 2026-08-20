import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Pointers to what this browser last saved — B10.
 *
 *  POINTERS ONLY, NEVER DATA. The scenario, the decision record and their
 *  history live in the server's store; all that is kept here is the id needed
 *  to ask for them again after a reload. Clearing this browser's storage loses
 *  the shortcut, not the record — the record is still retrievable by id, and
 *  Reports lists every one that has been stored.
 *
 *  That distinction is the whole reason this store is separate from the
 *  session-only draft stores beside it. `decisionDraft` and
 *  `simulationScenarios` hold real state that genuinely dies with the tab;
 *  this holds three strings that say where to look.
 *
 *  NO IDENTITY. These ids are not owned by anybody. This application has no
 *  authentication, so a saved decision belongs to the store, not to a user,
 *  and this file records no name, email or persona.
 */
export interface SavedRefs {
  /** Server-minted `inv_…`, threaded back into /simulation/context so a
   *  simulation can be traced to the investigation that prompted it. */
  investigationId: string | null
  /** Server-minted `scn_…`, plus the version this browser last wrote, so the
   *  next save can declare what it believed was current. */
  scenarioId: string | null
  scenarioVersion: number | null
  /** Server-minted `dec_…`. */
  decisionId: string | null
  decisionVersion: number | null
}

interface SavedRefsStore extends SavedRefs {
  rememberInvestigation: (id: string | null) => void
  rememberScenario: (id: string, version: number) => void
  rememberDecision: (id: string, version: number) => void
  forgetScenario: () => void
  forgetDecision: () => void
}

const EMPTY: SavedRefs = {
  investigationId: null,
  scenarioId: null,
  scenarioVersion: null,
  decisionId: null,
  decisionVersion: null,
}

export const useSavedRefsStore = create<SavedRefsStore>()(
  persist(
    (set) => ({
      ...EMPTY,
      rememberInvestigation: (investigationId) => set({ investigationId }),
      rememberScenario: (scenarioId, scenarioVersion) => set({ scenarioId, scenarioVersion }),
      rememberDecision: (decisionId, decisionVersion) => set({ decisionId, decisionVersion }),
      forgetScenario: () => set({ scenarioId: null, scenarioVersion: null }),
      forgetDecision: () => set({ decisionId: null, decisionVersion: null }),
    }),
    { name: 'tiq.savedRefs' },
  ),
)
