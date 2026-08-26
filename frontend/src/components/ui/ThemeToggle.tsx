import { IconButton } from './IconButton'
import { useThemeStore } from '../../store/theme'

/** Switch the application between the light and dark palettes.
 *
 *  ONE CONTROL, RENDERED IN THE TWO PLACES THE APP HAS A HEADER: the Topbar,
 *  which every page inside AppShell shares, and the portal header on
 *  pages/Home.tsx, which is outside AppShell and has its own. Both render THIS
 *  component, so there is one implementation and the two cannot drift.
 *
 *  IT IS A BUTTON, and reads as one. `title` and `aria-label` both name the
 *  action rather than the current state ("Switch to dark mode"), because that
 *  is what activating it does; `aria-pressed` carries the state, so a screen
 *  reader gets both without the label having to change meaning. It inherits
 *  IconButton's keyboard focus ring, so it is reachable and operable by
 *  keyboard with a visible focus state, and nothing about it is hover-only.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const dark = theme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <IconButton
      // The icon shows what you would GET, which is the same thing the label
      // promises — a moon while light, a sun while dark.
      icon={dark ? 'sun' : 'moon'}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      onClick={toggle}
      className={className}
    />
  )
}
