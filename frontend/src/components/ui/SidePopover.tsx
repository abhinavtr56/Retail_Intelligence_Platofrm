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

  useLayoutEffect(() => {
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: window.innerWidth - 360, top: 100 }
    setCoords({
      left: Math.min(rect.left + 30, window.innerWidth - 340),
      top: rect.top,
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
      className="fade-in-up fixed z-[9999] w-80 rounded-[var(--r-lg)] border border-border-default bg-surface-card p-[18px] shadow-[var(--shadow-lg)]"
      style={{ left: coords.left, top: coords.top }}
    >
      <IconButton icon="x" onClick={onClose} className="absolute right-2 top-2 h-7 w-7" />
      {children}
    </div>,
    document.body,
  )
}
