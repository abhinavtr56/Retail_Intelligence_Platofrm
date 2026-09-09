import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'

// Ported from js/components/ui.js UI.openSidePopover + css/tpo.css .ui-side-popover.
// Portaled to <body> with `position: fixed`, same reasoning as Dropdown.tsx.
export function SidePopover({
  anchorEl,
  onClose,
  children,
}: {
  anchorEl: HTMLElement | null
  onClose: () => void
  children: ReactNode
}) {
  const [coords, setCoords] = useState({ left: 0, top: 0 })
  const popRef = useRef<HTMLDivElement>(null)

  // THE POPOVER IS KEPT INSIDE THE VIEWPORT, VERTICALLY AS WELL AS SIDEWAYS.
  // `top` used to be the anchor's own top with no clamp, so a node in the lower
  // half of the investigation graph opened a panel whose bottom half was simply
  // off-screen — the taller the detail (headline, body and the bar chart), the
  // more of it was lost. Measuring is safe in place: the panel is a fixed `w-80`,
  // so its height does not depend on where it currently sits.
  useLayoutEffect(() => {
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: window.innerWidth - 360, top: 100 }
    const GAP = 12
    const h = popRef.current?.offsetHeight ?? 0
    setCoords({
      left: Math.min(rect.left + 30, window.innerWidth - 340),
      // Slide it up just far enough to fit rather than flipping it above the
      // node: the panel is wide and tall, and a flip would jump it clear across
      // the graph away from the node that opened it.
      top: Math.max(GAP, Math.min(rect.top, window.innerHeight - h - GAP)),
    })
  }, [anchorEl])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) && !anchorEl?.contains(e.target as Node)) {
        onClose()
      }
    }
    // Deferred so the click that opened the popover doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener('click', close), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('click', close)
    }
  }, [anchorEl, onClose])

  return createPortal(
    <div
      ref={popRef}
      className="fade-in-up fixed z-[9999] w-80 overflow-y-auto overscroll-contain rounded-[var(--r-lg)] border border-border-default bg-surface-card p-[18px] shadow-[var(--shadow-lg)]"
      style={{
        left: coords.left,
        top: coords.top,
        // The last resort, for a detail taller than the window itself: scroll
        // inside the panel rather than off the bottom of the screen.
        maxHeight: 'calc(100vh - 24px)',
      }}
    >
      <IconButton icon="x" onClick={onClose} className="absolute right-2 top-2 h-7 w-7" />
      {children}
    </div>,
    document.body,
  )
}
