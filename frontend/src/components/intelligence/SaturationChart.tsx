import { useChartWidth } from '../charts/useChartWidth'
import type { SaturationCurve } from '../../types/intelligence'

// Ported from js/pages/intelligence.js's `renderSaturation`.
export function SaturationChart({ data }: { data: SaturationCurve }) {
  const { ref, width: w } = useChartWidth(420)
  const h = 180
  const padL = 40,
    padR = 16,
    padT = 18,
    padB = 32
  const innerW = Math.max(1, w - padL - padR)
  const innerH = Math.max(1, h - padT - padB)
  const maxY = 50,
    maxX = 30
  const x = (v: number) => padL + (v / maxX) * innerW
  const y = (v: number) => padT + innerH * (1 - v / maxY)
  const path = data.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x)} ${y(p.y)}`).join(' ')
  const grid = [0, 10, 20, 30, 40, 50]
  const xLabels = [0, 5, 10, 15, 20, 25, 30]
  const sx = x(data.saturationX)

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={padL + innerW} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {v}%
            </text>
          </g>
        ))}
        <text x={padL - 26} y={padT - 4} fontSize={9} fill="var(--text-muted)" fontWeight={600}>
          Incremental Lift (%)
        </text>
        <line x1={sx} y1={padT} x2={sx} y2={padT + innerH} stroke="#7C5CFF" strokeWidth={1} strokeDasharray="4 3" />
        <text x={sx} y={padT - 4} textAnchor="middle" fontSize={10} fill="#7C5CFF" fontWeight={700}>
          Saturation Point
        </text>
        <path
          d={path}
          fill="none"
          stroke="#7C5CFF"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={800}
          strokeDashoffset={800}
          style={{ animation: 'drawLine 1100ms var(--ease-out) forwards' }}
        />
        {data.points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.x)}
            cy={y(p.y)}
            r={2.5}
            fill="#7C5CFF"
            style={{ opacity: 0, animation: `fadeIn 240ms ease ${500 + i * 50}ms forwards` }}
          />
        ))}
        {xLabels.map((v) => (
          <text key={v} x={x(v)} y={padT + innerH + 18} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
            {v}%
          </text>
        ))}
      </svg>
    </div>
  )
}
