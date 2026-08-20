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

const DEFAULT_QUESTION = 'Why did South Modern Trade Push underperform despite increased trade spend?'

export const useActiveInvestigationStore = create<ActiveInvestigationState>()(
  persist(
    (set) => ({
      activeType: 'diagnostic',
      activeQuestion: DEFAULT_QUESTION,
      setActive: (type, question) => set({ activeType: type, activeQuestion: question }),
    }),
    { name: 'tiq.activeInvestigation' },
  ),
)
