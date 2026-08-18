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

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setCoords({ left: rect.left, top: rect.bottom + 4, minWidth: Math.max(180, rect.width) })
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
            style={{ left: coords.left, top: coords.top, minWidth: coords.minWidth }}
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
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[13px] font-medium hover:bg-surface-hover ${
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
