import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** The navigation rail's one preference: pinned open, or collapsed to a rail.
 *
 *  PRESENTATION ONLY. This store holds no identity, no scope, no filter and no
 *  result — moving the rail cannot change what any page measures. Nothing here
 *  is sent to the server, and no endpoint knows the rail exists.
 *
 *  PERSISTED THE WAY THIS PROJECT ALREADY PERSISTS A UI PREFERENCE: zustand's
 *  `persist` into localStorage, the same mechanism `portalUser`, `savedRefs` and
 *  `activeInvestigation` use. No backend storage is introduced for a chrome
 *  setting, and the key is namespaced `tiq_` like the others.
 *
 *  HOVER IS NOT IN HERE. A hover expansion is transient, belongs to one mounted
 *  sidebar, and would be meaningless restored from a previous visit — so it
 *  stays as local component state and only `pinned` survives.
 */
interface SidebarState {
  /** True keeps the rail expanded without a pointer over it. */
  pinned: boolean
  togglePinned: () => void
  setPinned: (pinned: boolean) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      // COLLAPSED BY DEFAULT. A first-time visitor gets the rail and the widest
      // possible content area; the preference only overrides that once they have
      // actually expressed one.
      pinned: false,
      togglePinned: () => set((s) => ({ pinned: !s.pinned })),
      setPinned: (pinned) => set({ pinned }),
    }),
    { name: 'tiq_sidebar' },
  ),
)
