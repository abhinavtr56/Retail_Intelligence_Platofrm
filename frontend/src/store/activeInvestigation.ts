import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvestigationType } from '../types/investigation'
import type { CommandFilters } from './commandFilters'

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

/** Where an investigation was started from. */
export type InvestigationOrigin = 'risk_alert' | 'underperforming' | 'query'

/** The context the Command Center HANDS OVER when the user drills into an
 *  investigation — B3.2.
 *
 *  Until B3.2 this was thrown away: the alert and promotion click handlers had
 *  the clicked entity in hand and called a bare `navigate('/investigations')`,
 *  so every downstream page had to guess what the user was looking at.
 *
 *  THE ONE RULE HERE. `filters` is the Command Center's own validated
 *  FilterState, narrowed only by identifiers the source ACTUALLY PROVIDED.
 *  Display labels stay in `labels` and are never turned into codes.
 *  Converting a name back into a code by guessing would be a second filter
 *  model wearing a disguise, and it would silently select different rows from
 *  the ones the user clicked.
 *
 *  WHAT EACH SOURCE PROVIDES. A risk alert carries a real `promotion_id`,
 *  while its channel and product arrive as display names and so narrow
 *  nothing. An underperforming row carries the promotion, product and channel
 *  codes of the event it measured, so all three narrow. Neither can narrow to
 *  a week: FilterState has no week.
 */
export interface InvestigationScope {
  /** The validated Command Center FilterState at the moment of hand-off. */
  filters: CommandFilters
  origin: InvestigationOrigin
  /** What the user clicked, for display. */
  label: string
  /** Real identifiers the source genuinely provided. Absent means absent. */
  identifiers: { promotion_id?: string; product_id?: string; channel_id?: string }
  /** Display-only attributes. NOT converted into filters — see above. */
  labels: { product?: string; channel?: string; week?: string; period?: string }
  at: number
}

interface ActiveInvestigationState {
  activeType: InvestigationType
  activeQuestion: string
  list: ActiveInvEntry[]
  /** Null when the user navigated straight to a page rather than drilling in
   *  from the Command Center. Both entry paths stay valid. */
  scope: InvestigationScope | null
  setActive: (type: InvestigationType, question: string) => void
  addActive: (type: InvestigationType, question: string) => void
  startFromCommandCenter: (scope: Omit<InvestigationScope, 'at'>) => void
  clearScope: () => void
}

const DEFAULT_QUESTION = 'Why did South Modern Trade Push underperform despite increased trade spend?'

export const useActiveInvestigationStore = create<ActiveInvestigationState>()(
  persist(
    (set, get) => ({
      activeType: 'diagnostic',
      activeQuestion: DEFAULT_QUESTION,
      list: [],
      scope: null,
      setActive: (type, question) => set({ activeType: type, activeQuestion: question }),
      addActive: (type, question) => {
        const list = get().list.filter((e) => !(e.type === type && e.question === question))
        set({ list: [{ type, question, at: Date.now() }, ...list].slice(0, 8) })
      },
      startFromCommandCenter: (scope) => set({ scope: { ...scope, at: Date.now() } }),
      clearScope: () => set({ scope: null }),
    }),
    { name: 'tiq.activeInvestigation' },
  ),
)
