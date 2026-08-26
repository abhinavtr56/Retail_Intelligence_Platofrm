import { Icon, type IconName } from '../../icons'
import { Spinner } from '../ui'
import type { Accelerator } from '../../types/orchestration'

type LiveState = 'queued' | 'progress' | 'done'

const STATUS_STYLES: Record<LiveState, string> = {
  done: 'bg-status-success-bg text-[#047857]',
  progress: 'bg-status-warning-bg text-[#B45309]',
  queued: 'bg-surface-muted text-ink-muted',
}
const ICON_STYLES: Record<LiveState, { bg: string; fg: string }> = {
  done: { bg: 'var(--status-success-bg)', fg: 'var(--status-success)' },
  progress: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning)' },
  queued: { bg: 'var(--border-subtle)', fg: 'var(--text-muted)' },
}

// Ported from js/pages/investigations.js's `.accel-list`/`.accel-row`/`setAccel()`.
export function AccelList({
  accelerators,
  statusOverride,
  onSelect,
}: {
  accelerators: Accelerator[]
  /** During the "New Investigation" staged build, overrides each row's live state;
   *  omit to just render each accelerator's own `status` field. */
  statusOverride?: Record<string, LiveState>
  /** Optional. Without it the rows render as the status readout they are,
   *  rather than as click targets that lead nowhere. */
  onSelect?: (a: Accelerator) => void
}) {
  return (
    <div className="flex flex-col">
      {accelerators.map((a, i) => {
        const state: LiveState = statusOverride?.[a.key] ?? (a.status === 'Completed' ? 'done' : 'progress')
        return (
          <div
            key={a.key}
            onClick={onSelect ? () => onSelect(a) : undefined}
            className={`fade-in-up grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-border-subtle py-3 transition-[opacity,background] duration-150 last:border-b-0 ${
              onSelect ? 'cursor-pointer hover:bg-surface-hover' : ''
            } ${state === 'queued' ? 'opacity-50' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className="grid h-9 w-9 place-items-center rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
              style={{ background: ICON_STYLES[state].bg, color: ICON_STYLES[state].fg }}
            >
              <Icon name={a.icon as IconName} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink-primary">{a.name}</div>
              <div className="mt-px text-[11.5px] text-ink-muted">{a.desc}</div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[state]}`}
            >
              {state === 'done' && <Icon name="checkCircle" className="h-[13px] w-[13px]" />}
              {state === 'progress' && <Spinner />}
              {state === 'queued' && <Icon name="clock" className="h-[13px] w-[13px]" />}
              <span>{state === 'done' ? 'Completed' : state === 'progress' ? 'Running…' : 'Queued'}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
