import { Icon, type IconName } from '../../icons'
import { Pill, type PillTone } from '../ui'

export interface NormalizedInsight {
  key: string
  title: string
  desc: string
  impact: string
  icon: IconName
  tone: PillTone
  trend?: 'up' | 'down'
}

// Ported from js/pages/intelligence.js's `.kins-list`/`.kins-row`, shared by the
// Overview tab's preview list and the full Insights tab.
export function KeyInsightsList({ items }: { items: NormalizedInsight[] }) {
  const iconStyle: Record<string, { bg: string; fg: string }> = {
    danger: { bg: 'var(--status-danger-bg)', fg: 'var(--status-danger)' },
    warning: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning)' },
    success: { bg: 'var(--status-success-bg)', fg: 'var(--status-success)' },
  }

  return (
    <div className="flex flex-col">
      {items.map((k, i) => (
        <div
          key={k.key}
          className="fade-in-up grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-border-subtle py-3.5 last:border-b-0"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div
            className="grid h-9 w-9 place-items-center rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
            style={{
              background: (iconStyle[k.tone] ?? iconStyle.warning).bg,
              color: (iconStyle[k.tone] ?? iconStyle.warning).fg,
            }}
          >
            <Icon name={k.icon} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-[1.35] text-ink-primary">{k.title}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-muted">{k.desc}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <Pill tone={k.tone}>{k.impact}</Pill>
            {k.trend && <Icon name={k.trend === 'down' ? 'arrowDown' : 'arrowUp'} className="h-3.5 w-3.5 text-status-warning" />}
          </div>
        </div>
      ))}
    </div>
  )
}
