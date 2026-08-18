import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar, type Crumb } from './Topbar'

// Ported from css/layout.css #app / .main / .content. Below `lg` the sidebar becomes
// an off-canvas drawer (see Sidebar.tsx) instead of a permanent grid column, so this
// falls back to a single-column layout there — a fixed 240px column left no room for
// any page's content on tablet/phone widths.
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
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--sidebar-w)_1fr]">
      <Sidebar activeKey={activeKey} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-col bg-surface-page">
        <Topbar crumbs={crumbs} onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-10 pt-6 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
