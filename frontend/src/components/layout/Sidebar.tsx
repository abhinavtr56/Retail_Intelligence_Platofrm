import { Link } from 'react-router-dom'
import { useNav } from '../../hooks/useNav'
import { usePortalUserStore } from '../../store/portalUser'
import { Icon, type IconName } from '../../icons'

// Ported from js/components/sidebar.js + css/layout.css .sidebar*.
// nav.json routes are stored as "#/command" (verbatim from the vanilla app); the
// leading "#" is stripped before handing them to <Link to> since HashRouter adds
// its own "#" when rendering the href.
const toPath = (route: string) => (route.startsWith('#') ? route.slice(1) : route)

// Below `lg`, the sidebar is an off-canvas drawer (fixed, translated out of view,
// with a backdrop) instead of a permanent 240px grid column — that fixed column is
// what caused every TPO page to overflow horizontally on tablet/phone widths, since
// none of them ever discounted it. At `lg` and up it behaves exactly as before
// (sticky, always visible, part of the grid).
export function Sidebar({ activeKey, open, onClose }: { activeKey?: string; open: boolean; onClose: () => void }) {
  const { data: nav } = useNav()
  // B12: the signed-in persona, not user.json's hard-coded "Sanjay Kumar ·
  // Commercial Analyst". The chrome used to name a different person from the
  // one who signed in, and to print a ROLE this project has no authorization
  // model behind — B9 removed both from Settings for the same reason. This is
  // presentation only: no identity is created, and the name shown is still the
  // unverified one the visitor typed at sign-in.
  const user = usePortalUserStore((s) => s.user)

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[var(--sidebar-w)] flex-col border-r border-white/[0.06] bg-sidebar-bg text-sidebar-item transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col items-start gap-0.5 px-[22px] pb-[18px] pt-5">
          <Link to="/command" title="TransOrg IQ — TPO Intelligence" className="flex min-w-0 items-center gap-2.5" onClick={onClose}>
            <img src="/image.png" alt="TransOrg IQ" className="h-16 w-16 object-contain" />
          </Link>
          <div className="mt-0.5 text-[13.5px] font-semibold uppercase tracking-[0.1em] text-sidebar-brand-sub">
            TPO Intelligence
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-2.5">
          {nav?.navMain.map((n) => (
            <NavRow key={n.key} item={n} active={n.key === activeKey} onNavigate={onClose} />
          ))}
          <div className="mx-4 my-3.5 h-px bg-white/[0.06]" />
          {nav?.navSecondary.map((n) => (
            <NavRow key={n.key} item={n} active={n.key === activeKey} onNavigate={onClose} />
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div
            className="flex cursor-pointer items-center gap-2.5 rounded-[var(--r-md)] p-2 transition-colors duration-150 hover:bg-white/[0.05]"
            title={user.name}
          >
            <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6B47FF] to-[#8C6EFF] text-xs font-bold text-white">
              {user.initials}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-sidebar-brand">{user.name}</span>
              <span className="truncate text-[11px] text-sidebar-brand-sub">Signed in locally</span>
            </div>
            <Icon name="chevronDown" className="ml-auto h-3.5 w-3.5 text-sidebar-brand-sub" />
          </div>
        </div>
      </aside>
    </>
  )
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: { key: string; label: string; icon: string; route: string; badge?: string }
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      to={toPath(item.route)}
      data-key={item.key}
      onClick={onNavigate}
      className={`relative flex items-center gap-3.5 rounded-[var(--r-md)] px-3.5 py-[11px] text-sm font-medium no-underline transition-colors duration-150 ${
        active
          ? 'bg-sidebar-item-active-bg font-semibold text-sidebar-item-active [&_svg]:text-[#B7A6FF]'
          : 'text-sidebar-item hover:bg-white/5 hover:text-sidebar-item-hover'
      }`}
    >
      <Icon name={item.icon as IconName} className="h-[18px] w-[18px] shrink-0 stroke-[1.8]" />
      <span>{item.label}</span>
      {item.badge && (
        <span className="ml-auto rounded-[var(--r-pill)] bg-brand-violet px-1.5 py-px text-[10px] font-bold leading-4 text-white">
          {item.badge}
        </span>
      )}
    </Link>
  )
}
