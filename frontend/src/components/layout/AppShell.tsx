import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar, type Crumb } from './Topbar'

/** The page shell. Ported from css/layout.css #app / .main / .content.
 *
 *  THE CONTENT IS INSET BY THE FULL NAVIGATION COLUMN, at every width the column
 *  is on screen. Two insets, not three:
 *
 *      below md      ->  none                     (off-canvas drawer)
 *      md and up     ->  --sidebar-w   (224px)    always
 *
 *  ONE NUMBER, AND IT NEVER CHANGES. This used to be a three-way rule - a 68px
 *  rail inset, widened to 224px only when the rail was pinned, and only from
 *  `lg` - which existed to serve a sidebar that changed width under the pointer.
 *  The sidebar no longer does (see Sidebar.tsx), so the layout has nothing left
 *  to respond to: the column is a fixed 224px, the content starts where it ends,
 *  and no pointer movement, route change or breakpoint reflows the page.
 *
 *  BELOW `md` there is no inset at all: the sidebar is an off-canvas drawer
 *  there, and a permanent column is what used to leave no room for any page's
 *  content on phone widths.
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
          // The column's own width, from `md` up, and nothing else. No
          // transition: this value is a constant now, so there is no change for
          // one to animate.
          'md:pl-[var(--sidebar-w)]',
        ].join(' ')}
      >
        <Topbar crumbs={crumbs} onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-10 pt-6 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
