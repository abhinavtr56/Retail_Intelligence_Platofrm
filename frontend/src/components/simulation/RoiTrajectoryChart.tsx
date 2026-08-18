import { useChartWidth } from '../charts/useChartWidth'
import type { Scenario } from '../../types/simulation'

// Ported from js/pages/simulation.js's `renderRoiTraj`.
export function RoiTrajectoryChart({ labels, scenarios }: { labels: string[]; scenarios: Scenario[] }) {
  const { ref, width: w } = useChartWidth(360)
  const h = 170
  const padL = 30,
    padR = 12,
    padT = 12,
    padB = 24
  const innerW = Math.max(1, w - padL - padR)
  const innerH = Math.max(1, h - padT - padB)
  const allVals = scenarios.flatMap((s) => s.series.roi || [])
  const maxV = Math.max(4.0, Math.max(...allVals) * 1.05)
  const step = innerW / (labels.length - 1)
  const y = (v: number) => padT + innerH * (1 - v / maxV)
  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${padL + i * step} ${y(v)}`).join(' ')
  const grid = [0, 1, 2, 3, 4].filter((v) => v <= maxV)

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={padL + innerW} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {scenarios.map((s, i) => (
          <path
            key={s.key}
            d={line(s.series.roi.slice(0, labels.length))}
            fill="none"
            stroke={s.dotColor}
            strokeWidth={2.2}
            strokeDasharray={600}
            strokeDashoffset={600}
            style={{ animation: `drawLine 1100ms var(--ease-out) ${i * 120}ms forwards` }}
          />
        ))}
        {labels.map((l, i) => (
          <text key={l} x={padL + i * step} y={padT + innerH + 16} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}
