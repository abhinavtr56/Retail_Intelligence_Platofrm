import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../../icons'
import type { InvestigationTypeMeta } from '../../types/orchestration'

// Ported from css/tpo.css .active-inv-banner — shown on Intelligence / Simulation /
// Decision to keep the active investigation's question in view.
const TONE_BORDER: Record<string, string> = {
  danger: 'border-l-status-danger',
  violet: 'border-l-brand-violet',
  success: 'border-l-status-success',
  warning: 'border-l-status-warning',
}
const TONE_PILL: Record<string, string> = {
  danger: 'bg-status-danger-bg text-[#B91C1C]',
  violet: 'bg-brand-violet-50 text-brand-violet',
  success: 'bg-status-success-bg text-[#047857]',
  warning: 'bg-status-warning-bg text-[#B45309]',
}

export function ActiveInvBanner({
  typeMeta,
  question,
  proceedTo,
  proceedLabel,
  proceedIcon,
}: {
  typeMeta: InvestigationTypeMeta
  question: string
  /** OPTIONAL, and omitted where a plain link would be the wrong control.
   *
   *  This renders a `<Link>`: it navigates and nothing else. On a page whose
   *  own action has to CARRY state with it — Simulation Studio hands the
   *  scenario, its recommendation and its risk assessment to Decision Center —
   *  a second button with the same label that only navigates lands the user on
   *  an empty page. So the caller passes these only when navigation alone is
   *  genuinely the whole action. */
  proceedTo?: string
  proceedLabel?: string
  proceedIcon?: IconName
}) {
  return (
    <div
      className={`fade-in mb-4 grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 rounded-[var(--r-lg)] border border-l-[3px] border-border-subtle bg-surface-card p-[10px_16px] shadow-[var(--shadow-sm)] ${TONE_BORDER[typeMeta.tone]}`}
    >
      <span className={`inline-flex h-[18px] items-center rounded-[var(--r-pill)] px-2 text-[9px] font-semibold tracking-[0.04em] ${TONE_PILL[typeMeta.tone]}`}>
        {typeMeta.badge}
      </span>
      <span className="truncate whitespace-nowrap text-[13px] font-bold text-ink-primary">{question}</span>
      <Link to="/investigations" className="text-[13px] font-semibold text-brand-violet whitespace-nowrap">
        ← Back to Investigation
      </Link>
      {proceedTo && proceedLabel ? (
        <Link
          to={proceedTo}
          className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-[var(--r-md)] bg-brand-violet px-3 text-xs font-semibold text-white shadow-[var(--shadow-violet)] hover:bg-brand-violet-600"
        >
          {proceedIcon && <Icon name={proceedIcon} className="h-3.5 w-3.5" />} {proceedLabel}
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}
