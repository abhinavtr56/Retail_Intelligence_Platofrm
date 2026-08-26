import { Card } from '../ui'
import { Icon } from '../../icons'
import type { InvestigationTypeMeta } from '../../types/orchestration'

// Ported from js/pages/investigations.js's `.biz-question` block.
export function BizQuestionCard({
  typeMeta,
  question,
  contextChips,
}: {
  typeMeta: InvestigationTypeMeta
  question: string
  contextChips: { period: string; channel: string; region: string; spend: string }
}) {
  const tone =
    typeMeta.tone === 'danger'
      ? 'danger'
      : typeMeta.tone === 'violet'
        ? 'violet'
        : typeMeta.tone === 'success'
          ? 'success'
          : 'warning'
  const toneClasses: Record<string, string> = {
    danger: 'bg-status-danger-bg text-[#B91C1C]',
    violet: 'bg-brand-violet-50 text-brand-violet',
    success: 'bg-status-success-bg text-[#047857]',
    warning: 'bg-status-warning-bg text-[#B45309]',
  }

  return (
    <Card className="fade-in mb-4 grid grid-cols-[1.4fr_2fr_auto] items-center gap-[18px] p-[18px_22px] max-[1000px]:grid-cols-1">
      <div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex h-[18px] items-center rounded-[var(--r-pill)] px-2 text-[10.5px] font-semibold tracking-[0.04em] ${toneClasses[tone]}`}>
            {typeMeta.badge}
          </span>
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-brand-violet">Business Question</span>
        </div>
        <div className="mt-2 text-[19px] font-bold leading-[1.35] text-ink-primary">{question}</div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 border-l border-border-subtle pl-[18px] max-[1000px]:border-l-0 max-[1000px]:pl-0">
        <MetaItem icon="calendar" label="Period" value={contextChips.period} />
        <MetaItem icon="flow" label="Channel" value={contextChips.channel} />
        <MetaItem icon="target" label="Region" value={contextChips.region} />
        <MetaItem icon="pricing" label="Spend" value={contextChips.spend} />
      </div>
    </Card>
  )
}

function MetaItem({ icon, label, value }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-brand-violet">
        <Icon name={icon} />
        {label}
      </span>
      <span className="text-[15px] font-bold text-ink-primary">{value}</span>
    </div>
  )
}
