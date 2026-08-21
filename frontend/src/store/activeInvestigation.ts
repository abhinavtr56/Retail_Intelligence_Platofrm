import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvestigationType } from '../types/investigation'

// Ported from data.js's window.getActiveInvType/setActiveInvType, which read/wrote
// localStorage directly. Same persisted shape and default question, now as a Zustand
// store — pages read it with useActiveInvestigationStore() instead of calling global
// functions. `activeType`/`activeQuestion` stay client-side (Simulation/Decision/
// Intelligence all read them synchronously to scope their own queries — no reason to
// round-trip that through the backend). The "last N investigations" list used to live
// here too; it's now backend-persisted and shared — see useRecentInvestigations() in
// hooks/useInvestigations.ts.
interface ActiveInvestigationState {
  activeType: InvestigationType
  activeQuestion: string
  setActive: (type: InvestigationType, question: string) => void
}

// Empty by design. A pre-filled question makes the Investigations page render
// an answer nobody asked for; the page now starts blank until the user asks
// something or arrives from an "Ask why" handoff.
const DEFAULT_QUESTION = ''

// The old default question is still sitting in localStorage for anyone who
// used the app before, and persisted state wins over the initial value — so
// clearing the constant alone would fix nothing for existing users. Version 2
// drops it on load.
const OLD_DEFAULT = 'Why did South Modern Trade Push underperform despite increased trade spend?'

export const useActiveInvestigationStore = create<ActiveInvestigationState>()(
  persist(
    (set) => ({
      activeType: 'diagnostic',
      activeQuestion: DEFAULT_QUESTION,
      setActive: (type, question) => set({ activeType: type, activeQuestion: question }),
    }),
    {
      name: 'tiq.activeInvestigation',
      version: 2,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<ActiveInvestigationState>
        if (state.activeQuestion === OLD_DEFAULT) {
          return { ...state, activeQuestion: '' } as ActiveInvestigationState
        }
        return state as ActiveInvestigationState
      },
    },
  ),
)
