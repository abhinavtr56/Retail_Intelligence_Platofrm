import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../icons'

// Ported from js/components/ui.js UI.openDropdown + css/tpo.css .ui-dropdown/.ui-dd-item.
// The original appends the menu straight to <body> with `position: fixed` at the
// trigger's getBoundingClientRect() — deliberately kept identical here (via a portal)
// rather than `position: absolute` inside the trigger's own subtree, since an absolute
// menu gets trapped by any ancestor that happens to establish a stacking context
// (e.g. our `.fade-in`/`.fade-in-up` entrance animations do, because they animate
// `opacity`/`transform`) and renders underneath later sibling cards instead of above
// them. Portaling to <body> sidesteps that class of bug entirely.
export interface DropdownOption {
  label: string
  value?: string
}

export function Dropdown({
  trigger,
  options,
  selected,
  onSelect,
}: {
  trigger: ReactNode
  options: DropdownOption[]
  selected?: string
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ left: 0, top: 0, minWidth: 180 })
  const anchorRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // THE MENU IS KEPT INSIDE THE VIEWPORT. Anchoring it at the trigger's own
  // left/bottom is right only for a trigger with room below and to the right of
  // it. The account avatar sits ~16px from the window edge, so a menu pinned to
  // its left had ~73px of viewport to render into: the labels wrapped a word at
  // a time and "Profile & settings" ran off the screen. The sidebar's account
  // menu has the same problem downwards, opening a few px above the fold.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return
    // Measurable in place because the menu is `width: max-content` (see the
    // style below): it keeps its natural width even when it is currently
    // rendered hard against an edge, so one pass is enough and nothing has to
    // mutate the DOM behind React's back to measure.
    const { offsetWidth: w, offsetHeight: h } = menuRef.current

    const rect = anchorRef.current.getBoundingClientRect()
    const GAP = 8
    const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - w - GAP))
    // Below the trigger when it fits, above it when it does not.
    const below = rect.bottom + 4
    const top =
      below + h + GAP <= window.innerHeight ? below : Math.max(GAP, rect.top - h - 4)

    setCoords({ left, top, minWidth: Math.max(180, rect.width) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <>
      <span ref={anchorRef} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fade-in-up fixed z-[9999] rounded-[var(--r-md)] border border-border-default bg-surface-card p-1 shadow-[var(--shadow-lg)]"
            style={{
              left: coords.left,
              top: coords.top,
              minWidth: coords.minWidth,
              // `max-content` so the menu sizes to its labels rather than to
              // whatever gap is left between the trigger and the window edge —
              // that gap is what wrapped "Profile & settings" a word at a time.
              width: 'max-content',
              // And a ceiling, so a long sign-in address wraps inside the menu
              // instead of stretching it across the screen.
              maxWidth: 'min(320px, calc(100vw - 16px))',
            }}
          >
            {options.map((o) => {
              const val = o.value ?? o.label
              const isSelected = val === selected
              return (
                <div
                  key={val}
                  onClick={() => {
                    setOpen(false)
                    onSelect(val)
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-base font-medium hover:bg-surface-hover ${
                    isSelected ? 'font-bold text-brand-violet' : 'text-ink-primary'
                  }`}
                >
                  <span className="flex-1">{o.label}</span>
                  {isSelected && <Icon name="check" className="h-3.5 w-3.5 text-brand-violet" />}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
