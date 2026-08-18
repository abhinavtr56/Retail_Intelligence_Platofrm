import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Icon, type IconName } from '../../icons'

// Ported from css/layout.css .icon-btn (+ .notif-dot)
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  dot?: boolean
  spinning?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, dot, spinning, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`relative grid h-[38px] w-[38px] cursor-pointer place-items-center rounded-full border-none bg-transparent text-ink-secondary transition-colors duration-150 hover:bg-black/[0.04] hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-violet)] disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      <Icon name={icon} className={`h-[18px] w-[18px] stroke-[1.8] ${spinning ? 'animate-spin' : ''}`} />
      {dot && (
        <span className="absolute right-[10px] top-[9px] h-2 w-2 rounded-full border-2 border-surface-page bg-status-success" />
      )}
    </button>
  )
})
