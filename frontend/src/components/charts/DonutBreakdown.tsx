import { useEffect, useState } from 'react'

export interface DonutSegment {
  key: string
  pct: number
  color: string
}

// Ported from js/components/charts.js Charts.donutBreakdown
export function DonutBreakdown({
  segments,
  size = 180,
  stroke = 28,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[]
  size?: number
  stroke?: number
  /** Rendered in the ring's hole, e.g. a total-spend figure (ported from the DOM-appended
   *  SVG <text> nodes in js/pages/command.js's renderCharts — an absolutely positioned
   *  div is simpler and equally faithful since the ring's center is always empty). */
  centerValue?: string
  centerLabel?: string
}) {
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const c = 2 * Math.PI * r

  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  let cumulative = 0
  const arcs = segments.map((s, i) => {
    const len = c * (s.pct / 100)
    const rotateDeg = -90 + (cumulative / c) * 360
    cumulative += len
    return (
      <circle
        key={s.key}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={stroke}
        strokeLinecap="butt"
        strokeDasharray={animated ? `${len} ${c - len}` : `0 ${c}`}
        transform={`rotate(${rotateDeg} ${cx} ${cy})`}
        style={{ transition: `stroke-dasharray 1100ms cubic-bezier(0.16,1,0.3,1) ${i * 130}ms` }}
      />
    )
  })

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              {centerValue && (
                <div className="text-lg font-extrabold text-ink-primary">{centerValue}</div>
              )}
              {centerLabel && <div className="mt-0.5 text-[10px] font-semibold text-ink-muted">{centerLabel}</div>}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-ink-secondary">{s.key}</span>
            <span className="font-semibold text-ink-primary">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
