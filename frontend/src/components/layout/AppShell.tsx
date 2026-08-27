import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar, type Crumb } from './Topbar'

/** The page shell. Ported from css/layout.css #app / .main / .content.
 *
 *  THE CONTENT IS INSET BY THE RAIL, NOT BY THE EXPANDED SIDEBAR. That is the
 *  whole point of the collapsed default: the ~156px the permanent column used to
 *  hold is now page. Three insets, by width:
 *
 *      below md      ->  none                       (off-canvas drawer)
 *      md .. lg      ->  --sidebar-rail-w  (68px)   always
 *      lg and up     ->  --sidebar-w      (224px)   when PINNED, else the rail
 *
 *  A HOVER EXPANSION NEVER MOVES THIS. If it did, every page would reflow as the
 *  pointer crossed the rail on its way to something else, and the chart or table
 *  the user was aiming at would shift under the cursor. Pinning is the
 *  deliberate act, so pinning is the only thing that moves the layout — and it
 *  transitions on the same 200ms curve as the rail itself.
 *
 *  AND ON TABLET, EVEN PINNING DOES NOT. Between `md` and `lg` the content keeps
 *  the 68px inset whatever the preference, so an expanded rail floats over the
 *  page instead of squeezing it to ~540px. That is the brief's tablet behaviour:
 *  a collapsed rail with overlay expansion.
 *
 *  BELOW `md` there is no inset at all: the sidebar is an off-canvas drawer
 *  there, and a permanent column is what used to leave no room for any page's
 *  content on tablet and phone widths.
 */
export function AppShell({
  activeKey,
  crumbs,
  children,
}: {
  activeKey?: string
  crumbs?: Crumb[]
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <Sidebar activeKey={activeKey} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div
        className={[
          'flex min-h-screen min-w-0 flex-col bg-surface-page',
          'transition-[padding-left] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none',
          // The rail's inset from `md`, at every width. The wider inset used to
          // apply when the rail was pinned open; that control has been removed,
          // so the expanded rail always overlays the content instead of moving
          // it, and the page never reflows under the pointer.
          'md:pl-[var(--sidebar-rail-w)]',
        ].join(' ')}
      >
        <Topbar crumbs={crumbs} onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-10 pt-6 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
