import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../icons'
import { IconButton } from '../ui'
import { useToast } from '../ui'
import { usePortalUserStore } from '../../store/portalUser'

export interface Crumb {
  label: string
  route?: string
}

// Ported from js/components/topbar.js + css/layout.css .topbar*. `onMenuClick` only
// renders (and only matters) below `lg`, where Sidebar is an off-canvas drawer.
export function Topbar({ crumbs = [], onMenuClick }: { crumbs?: Crumb[]; onMenuClick?: () => void }) {
  // B12: see Sidebar — the signed-in persona, not the authored one.
  const user = usePortalUserStore((s) => s.user)
  const { show } = useToast()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-10 flex h-[var(--topbar-h)] items-center gap-2 border-b border-border-subtle bg-surface-page pl-4 pr-4 sm:gap-4 sm:pl-8 sm:pr-7">
      {onMenuClick && <IconButton icon="menu" title="Menu" onClick={onMenuClick} className="-ml-1.5 lg:hidden" />}
      <div className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span
              key={i}
              className={
                isLast
                  ? 'inline-flex min-w-0 items-center gap-2'
                  : 'hidden min-w-0 shrink-0 items-center gap-2 sm:inline-flex'
              }
            >
              {c.route && !isLast ? (
                <Link
                  to={c.route.startsWith('#') ? c.route.slice(1) : c.route}
                  className="whitespace-nowrap hover:text-ink-primary"
                >
                  {c.label}
                </Link>
              ) : (
                <span className={`truncate ${isLast ? 'font-semibold text-ink-primary' : ''}`}>{c.label}</span>
              )}
              {!isLast && <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-ink-disabled" />}
            </span>
          )
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <IconButton
          icon="help"
          title="Help"
          onClick={() => show('Help center coming soon · Press / to search', { duration: 2500 })}
        />
        <IconButton
          icon="bell"
          dot
          title="Notifications"
          onClick={() => show('3 unread alerts · Click "View Details" on the Command Center', { duration: 3000 })}
        />
        <IconButton icon="settings" title="Settings" onClick={() => navigate('/settings')} />
        <div
          className="ml-1 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-[#6B47FF] to-[#8C6EFF] text-xs font-bold text-white"
          title={`${user.name} — signed in locally, not verified`}
        >
          {user.initials}
        </div>
      </div>
    </header>
  )
}
