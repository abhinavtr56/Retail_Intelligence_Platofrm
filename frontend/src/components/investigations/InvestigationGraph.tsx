import { Icon, type IconName } from '../../icons'
import { useElementSize } from '../../hooks/useElementSize'
import { computeRadialLayout } from './graphLayout'
import type { LegendItem, OrchNode } from '../../types/orchestration'

// Ported from the `.ig-stage` block + `layoutGraph()` in js/pages/investigations.js.
export function InvestigationGraph({
  center,
  nodes,
  legend,
  revealedKeys,
  onNodeClick,
  zoom = 1,
}: {
  center: { label: string; sub: string }
  nodes: OrchNode[]
  legend: LegendItem[]
  /** Keys of nodes that have "arrived" — undefined means everything is revealed immediately. */
  revealedKeys?: Set<string>
  onNodeClick: (node: OrchNode, el: HTMLElement) => void
  /** Toolbar zoom. Applied as a transform on the stage's contents so the
   *  layout maths stays in unscaled pixels and nothing has to be recomputed
   *  when it changes. */
  zoom?: number
}) {
  const { ref, size } = useElementSize<HTMLDivElement>({ width: 720, height: 560 })
  const laidOut = size.width && size.height ? computeRadialLayout(nodes, size.width, size.height) : []
  const byKey = new Map(laidOut.map((l) => [l.key, l]))

  const isRevealed = (key: string) => !revealedKeys || revealedKeys.has(key)

  return (
    <>
      <div
        ref={ref}
        className="relative h-[560px] overflow-hidden"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(124,92,255,0.04), transparent 70%)' }}
      >
        {/* ONE transform for the whole stage. Zooming a wrapper keeps the
            layout in real pixels, so the edge geometry and the node
            positions never have to know a zoom exists. */}
        <div
          className="absolute inset-0 origin-center transition-transform duration-200 ease-[var(--ease-out)]"
          style={{ transform: `scale(${zoom})` }}
        >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`}>
          <defs>
            {laidOut.map((l) => (
              <marker
                key={l.key}
                id={`arr-${l.key}`}
                markerWidth={8}
                markerHeight={8}
                refX={6}
                refY={3}
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0,0 L7,3 L0,6 Z" fill={l.style.color} />
              </marker>
            ))}
          </defs>
          {laidOut.map((l) => (
            <line
              key={l.key}
              x1={l.px.toFixed(1)}
              y1={l.py.toFixed(1)}
              x2={l.edgeX2.toFixed(1)}
              y2={l.edgeY2.toFixed(1)}
              stroke={l.style.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={l.style.dash === 'none' ? undefined : l.style.dash.split(' ').map((v) => Number(v) * 2).join(' ')}
              markerEnd={`url(#arr-${l.key})`}
              className="transition-opacity duration-[420ms] ease-[var(--ease-out)]"
              style={{ opacity: isRevealed(l.key) ? 1 : 0 }}
            />
          ))}
        </svg>

        {nodes.map((n, i) => {
          const l = byKey.get(n.key)
          const st = l?.style
          const trendColor = n.trend === 'down' ? 'var(--status-danger)' : n.trend === 'up' ? 'var(--brand-blue)' : 'var(--text-muted)'
          const revealed = isRevealed(n.key)
          return (
            <div
              key={n.key}
              data-key={n.key}
              onClick={(e) => onNodeClick(n, e.currentTarget)}
              className={`absolute z-[1] flex h-[140px] w-[140px] cursor-pointer flex-col items-center justify-center rounded-full border-[1.5px] border-border-default bg-surface-card p-2 text-center shadow-[var(--shadow-sm)] transition-[opacity,transform,box-shadow,border-color] duration-300 hover:z-[3] hover:shadow-[var(--shadow-md)] ${
                revealed ? 'scale-100 opacity-100 hover:scale-105' : 'pointer-events-none scale-[0.82] opacity-0'
              }`}
              style={{
                left: l ? l.px : `${n.pos.x}%`,
                top: l ? l.py : `${n.pos.y}%`,
                transform: 'translate(-50%, -50%)',
                transitionDelay: revealed ? `${i * 30}ms` : '0ms',
              }}
            >
              <div
                className="mb-1 grid h-7 w-7 place-items-center rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5"
                style={{ background: st?.bg, color: st?.accent }}
              >
                <Icon name={n.icon as IconName} />
              </div>
              <div className="text-[12px] font-bold leading-tight text-ink-primary">{n.label}</div>
              {n.metric && (
                <div className="mt-[3px] text-[13px] font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">
                  {n.metric}
                </div>
              )}
              {n.delta && (
                <div className="mt-0.5 inline-flex items-center gap-0.5 text-[11.5px] font-bold" style={{ color: trendColor }}>
                  <Icon name={n.trend === 'down' ? 'arrowDown' : 'arrowUp'} className="h-2.5 w-2.5" />
                  <span>{n.delta}</span>
                </div>
              )}
            </div>
          )
        })}

        <div
          className="absolute z-[2] rounded-[14px] px-[26px] py-[18px] text-center text-white"
          style={{
            left: size.width / 2,
            top: size.height / 2,
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #4F3CCC 0%, #6B47FF 100%)',
            boxShadow: '0 16px 32px -8px rgba(124, 92, 255, 0.55)',
          }}
        >
          <div className="text-[17px] font-extrabold tracking-[-0.01em]">{center.label}</div>
          <div className="mt-0.5 text-[12.5px] opacity-[0.78]">{center.sub}</div>
        </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-[18px] border-t border-border-subtle p-[12px_22px] text-[12.5px] text-ink-secondary">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-[22px]"
              style={{ borderTop: `2px ${l.style} ${l.color}` }}
            />
            {l.label}
          </span>
        ))}
      </div>
    </>
  )
}
