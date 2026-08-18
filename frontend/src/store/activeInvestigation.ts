import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvestigationType } from '../types/investigation'

// Ported from data.js's window.getActiveInvType/setActiveInvType/addActiveInv, which
// read/wrote localStorage directly. Same persisted shape and default question, now as
// a Zustand store — pages read it with useActiveInvestigation() instead of calling
// global functions, and the "last N investigations" list still round-trips to
// localStorage across full page reloads.
export interface ActiveInvEntry {
  type: InvestigationType
  question: string
  at: number
}

interface ActiveInvestigationState {
  activeType: InvestigationType
  activeQuestion: string
  list: ActiveInvEntry[]
  setActive: (type: InvestigationType, question: string) => void
  addActive: (type: InvestigationType, question: string) => void
}

const DEFAULT_QUESTION = 'Why did South Modern Trade Push underperform despite increased trade spend?'

export const useActiveInvestigationStore = create<ActiveInvestigationState>()(
  persist(
    (set, get) => ({
      activeType: 'diagnostic',
      activeQuestion: DEFAULT_QUESTION,
      list: [],
      setActive: (type, question) => set({ activeType: type, activeQuestion: question }),
      addActive: (type, question) => {
        const list = get().list.filter((e) => !(e.type === type && e.question === question))
        set({ list: [{ type, question, at: Date.now() }, ...list].slice(0, 8) })
      },
    }),
    { name: 'tiq.activeInvestigation' },
  ),
)
