import { ICON_PATHS, type IconName } from './icons'

export interface IconProps {
  name: IconName
  className?: string
  /** px size for both width/height; defaults to the vanilla app's 18px nav-icon size via className instead when omitted */
  size?: number
}

// Faithful port of the vanilla `s(path)` wrapper in js/icons.js:
// viewBox 0 0 24 24, no fill, currentColor stroke, 1.8 stroke width, round caps/joins.
// Markup is static/trusted (from ICON_PATHS), never user input.
export function Icon({ name, className, size }: IconProps) {
  const inner = ICON_PATHS[name]
  if (!inner) return null
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={size}
      height={size}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}
