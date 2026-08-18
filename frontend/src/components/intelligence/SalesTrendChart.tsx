import { useChartWidth } from '../charts/useChartWidth'
import type { IncSalesTrend } from '../../types/intelligence'

// Ported from js/pages/intelligence.js's `renderSalesTrend`.
export function SalesTrendChart({ data }: { data: IncSalesTrend }) {
  const { ref, width: w } = useChartWidth(420)
  const h = 180
  const padL = 38,
    padR = 12,
    padT = 12,
    padB = 32
  const innerW = Math.max(1, w - padL - padR)
  const innerH = Math.max(1, h - padT - padB)
  const maxV = Math.max(...data.actual, ...data.expected, ...data.target) * 1.1
  const step = innerW / (data.labels.length - 1)
  const y = (v: number) => padT + innerH * (1 - v / maxV)
  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${padL + i * step} ${y(v)}`).join(' ')
  const grid = [0, 25, 50, 75, 100].filter((v) => v <= maxV)

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={padL + innerW} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {v}
            </text>
          </g>
        ))}
        <text x={padL - 24} y={padT} fontSize={9} fill="var(--text-muted)" fontWeight={600}>
          ₹ Cr
        </text>
        <path d={line(data.target)} fill="none" stroke="#9CA3AF" strokeWidth={1.6} strokeDasharray="4 4" />
        <path d={line(data.expected)} fill="none" stroke="#7C5CFF" strokeWidth={2} strokeDasharray="6 4" opacity={0.7} />
        <path
          d={line(data.actual)}
          fill="none"
          stroke="#7C5CFF"
          strokeWidth={2.4}
          strokeDasharray={800}
          strokeDashoffset={800}
          style={{ animation: 'drawLine 1100ms var(--ease-out) forwards' }}
        />
        {data.actual.map((v, i) => (
          <circle
            key={i}
            cx={padL + i * step}
            cy={y(v)}
            r={2.5}
            fill="#7C5CFF"
            style={{ opacity: 0, animation: `fadeIn 240ms ease ${600 + i * 50}ms forwards` }}
          />
        ))}
        {data.labels.map((l, i) => (
          <text key={l} x={padL + i * step} y={padT + innerH + 18} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}
