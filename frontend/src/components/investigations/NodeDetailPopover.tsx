import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../../icons'
import { SidePopover } from '../ui'
import { impactStyle } from './graphLayout'
import type { NodeDetail, OrchNode } from '../../types/orchestration'

// Ported from the `UI.openSidePopover({...})` call in js/pages/investigations.js's
// node click handler, including the mini bar-chart visual (`miniViz`).
export function NodeDetailPopover({
  node,
  detail,
  anchorEl,
  onClose,
}: {
  node: OrchNode
  detail: NodeDetail
  anchorEl: HTMLElement | null
  onClose: () => void
}) {
  const st = impactStyle(node.impact)

  return (
    <SidePopover anchorEl={anchorEl} onClose={onClose}>
      <div className="mb-2.5 flex items-center gap-2">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg [&_svg]:h-4 [&_svg]:w-4"
          style={{ background: st.bg, color: st.accent }}
        >
          <Icon name={node.icon as IconName} />
        </div>
        <div>
          <div className="text-[13px] font-extrabold">{node.label}</div>
          <div className="text-[11px] text-ink-muted">{node.metric}</div>
        </div>
      </div>

      <div className="text-[13px] font-bold leading-[1.4] text-ink-primary">{detail.headline}</div>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-secondary">{detail.body}</p>

      {detail.viz && detail.viz.type === 'bars' && (
        <div className="mt-3 rounded-[10px] p-3" style={{ background: st.bg }}>
          {(() => {
            const max = Math.max(...detail.viz.items.map((it) => it.value)) * 1.15 || 1
            return detail.viz.items.map((it, i) => (
              <div key={it.label} className="mb-2 grid grid-cols-[64px_1fr_40px] items-center gap-2 last:mb-0">
                <span className="whitespace-nowrap text-[11px] font-semibold text-ink-secondary">{it.label}</span>
                <span className="h-[9px] overflow-hidden rounded-full bg-black/[0.06]">
                  <span
                    className="block h-full rounded-full [animation:npGrow_700ms_var(--ease-out)_forwards]"
                    style={{
                      width: `${((it.value / max) * 100).toFixed(1)}%`,
                      background: it.tone === 'muted' ? 'var(--border-strong)' : st.accent,
                      opacity: it.tone === 'accent2' ? 0.55 : 1,
                      animationDelay: `${120 + i * 120}ms`,
                    }}
                  />
                </span>
                <span className="text-right text-[11.5px] font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">
                  {it.value}
                </span>
              </div>
            ))
          })()}
          <div className="mt-0.5 text-right text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            {detail.viz.unit}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-surface-muted p-[8px_10px] text-[11px] leading-[1.45] text-ink-muted">
        <Icon name="info" className="h-3.5 w-3.5 shrink-0" />
        <span>{detail.evidence}</span>
      </div>

      <Link
        to="/intelligence"
        onClick={onClose}
        className="mt-3 flex h-[30px] w-full items-center justify-center gap-2 rounded-[var(--r-md)] bg-brand-violet-50 text-xs font-semibold text-brand-violet hover:bg-[#E6DEFF]"
      >
        View in Intelligence <Icon name="arrowRight" className="h-3.5 w-3.5" />
      </Link>
    </SidePopover>
  )
}
