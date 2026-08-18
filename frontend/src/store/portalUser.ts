import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PortalUser } from '../types/portal'

// Ported from js/portal.js's saveUser/loadUser/defaultUser — a client-side stand-in
// for auth (no identity provider wired up yet), same as the vanilla app.
export const initials = (name: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'U'

const DEFAULT_USER: PortalUser = { name: 'Abhinav', initials: 'AA', email: '' }

interface PortalUserState {
  user: PortalUser
  signIn: (email: string) => void
}

export const usePortalUserStore = create<PortalUserState>()(
  persist(
    (set) => ({
      user: DEFAULT_USER,
      signIn: (email) => {
        const namePart = email.split('@')[0].replace(/[._]+/g, ' ').trim()
        const name = namePart.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Abhinav'
        set({ user: { name, initials: initials(name), email } })
      },
    }),
    { name: 'tiq_portal_user' },
  ),
)
