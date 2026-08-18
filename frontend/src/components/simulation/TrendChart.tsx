import { useChartWidth } from '../charts/useChartWidth'

export interface TrendSeries {
  key: string
  color: string
  values: number[]
}

// Ported from js/pages/simulation.js's `renderIncOverTime`.
export function TrendChart({ labels, series, target }: { labels: string[]; series: TrendSeries[]; target: number[] }) {
  const { ref, width: w } = useChartWidth(600)
  const h = 230
  const padL = 36,
    padR = 12,
    padT = 12,
    padB = 28
  const innerW = Math.max(1, w - padL - padR)
  const innerH = Math.max(1, h - padT - padB)
  const allVals = series.flatMap((s) => s.values).concat(target)
  const maxV = Math.max(...allVals) * 1.05 || 100
  const step = innerW / (labels.length - 1)
  const y = (v: number) => padT + innerH * (1 - v / maxV)
  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${padL + i * step} ${y(v)}`).join(' ')
  const ticks = 5
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxV * i) / ticks))

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={padL + innerW} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {v}
            </text>
          </g>
        ))}
        <path d={line(target)} fill="none" stroke="#9CA3AF" strokeWidth={1.6} strokeDasharray="5 4" />
        {series.map((s, i) => (
          <path
            key={s.key}
            d={line(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.2}
            strokeDasharray={800}
            strokeDashoffset={800}
            style={{ animation: `drawLine 1100ms var(--ease-out) ${i * 120}ms forwards` }}
          />
        ))}
        {labels.map((l, i) => (
          <text key={l} x={padL + i * step} y={padT + innerH + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}
