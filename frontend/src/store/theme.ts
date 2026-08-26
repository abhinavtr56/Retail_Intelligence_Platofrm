import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** The application's one appearance preference: light or dark.
 *
 *  PRESENTATION ONLY, like `sidebar`. This store holds no identity, no scope,
 *  no filter and no result — switching theme cannot change what any page
 *  measures, and no endpoint knows the setting exists.
 *
 *  PERSISTED THE WAY THIS PROJECT ALREADY PERSISTS A UI PREFERENCE: zustand's
 *  `persist` into localStorage under a `tiq_`-namespaced key, exactly as
 *  `sidebar`, `savedRefs` and `activeInvestigation` do. No provider, no
 *  context and no second state library is introduced for a chrome setting.
 *
 *  THE THEME IS ONE ATTRIBUTE ON <html>. `styles/tokens.css` redefines the
 *  design tokens under `:root[data-theme='dark']`, and every Tailwind colour
 *  utility in the app already resolves through those tokens — so setting the
 *  attribute re-themes the whole application, and no page or component has to
 *  know a theme exists.
 */
export type Theme = 'light' | 'dark'

/** Write the attribute the stylesheet keys off.
 *
 *  Light is the ABSENCE of the attribute rather than `data-theme='light'`:
 *  the light palette is what `:root` already declares, so removing the
 *  override is what "light" means. Guarded for a non-browser environment so
 *  importing this module can never be the thing that breaks a test runner. */
function apply(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // LIGHT BY DEFAULT. Every screen in this application was designed and
      // validated on the light palette; dark is an opt-in preference, not a
      // system-following default that would show a first-time visitor a
      // surface nobody has looked at.
      theme: 'light',
      toggle: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        apply(next)
        set({ theme: next })
      },
      setTheme: (theme) => {
        apply(theme)
        set({ theme })
      },
    }),
    {
      name: 'tiq_theme',
      // APPLIED ON REHYDRATION, NOT FROM A RENDER. localStorage rehydrates
      // before first paint, so the stored theme is on <html> by the time
      // anything is painted and a reload does not flash the light palette
      // first. An effect in a component would run after that paint.
      onRehydrateStorage: () => (state) => apply(state?.theme ?? 'light'),
    },
  ),
)
