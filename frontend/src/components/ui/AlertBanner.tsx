import { useEffect, useState } from 'react'
import { Icon } from '../../icons'
import { Link } from 'react-router-dom'

// Ported from css/tpo.css .tpo-alert-banner* — the coral risk banner on the 5 main
// pages, with a periodic attention "flash" (box-shadow pulse every 18s, matching the
// vanilla app's `window._cmdWobble` interval).
export function AlertBanner({
  title,
  desc,
  ctaTo,
  onClick,
}: {
  title: string
  desc: string
  ctaTo: string
  onClick?: () => void
}) {
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => {
      setFlash(true)
      window.setTimeout(() => setFlash(false), 600)
    }, 18000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      onClick={onClick}
      className={`fade-in my-[18px] flex cursor-pointer items-center gap-4 rounded-[var(--r-lg)] border border-[#FBC3BD] bg-[#FEEEEC] p-[18px_24px] transition-shadow duration-500 ${
        flash ? 'shadow-[0_0_0_6px_rgba(239,68,68,0.2)]' : 'shadow-[0_0_0_0_rgba(239,68,68,0)]'
      }`}
    >
      <div className="grid h-11 w-11 shrink-0 animate-[pulseDot_2s_ease-in-out_infinite] place-items-center rounded-full bg-white/50 text-[#DC2626] [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:stroke-2">
        <Icon name="warning" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-[#DC2626]">
          <strong className="mr-1.5 font-bold text-[#DC2626]">ALERT:</strong>
          {title}
        </div>
        <div className="mt-[3px] text-[13.5px] font-medium text-[#7F1D1D]">{desc}</div>
      </div>
      <Link
        to={ctaTo}
        // The CTA must do what the banner does. `stopPropagation` alone left
        // the Link navigating while the banner's `onClick` never ran, so
        // "View Details" -- the obvious affordance -- arrived at the target
        // page with NO scope handed over, while clicking the banner body
        // handed one over correctly. The handler is still invoked exactly
        // once: propagation stays stopped, and the CTA calls it itself.
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--r-md)] border border-[#FBC3BD] bg-white px-[18px] text-[13px] font-semibold text-[#DC2626] transition-colors hover:border-[#F87171] hover:bg-[#FEF6F5] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-[#DC2626]"
      >
        View Details
        <Icon name="arrowRight" />
      </Link>
    </div>
  )
}
