import { useState } from 'react'
import { useChartWidth } from '../charts/useChartWidth'
import type { TrendResponse } from '../../types/commandCenter'

/** Promotion Performance Trend, as two panels on one shared x-axis.
 *
 *  Replaces the previous single combined chart, which mixed a percentage
 *  (ROI, 23-551%) and two money series (up to ₹102M) on axes that could not
 *  serve both. Its left axis still carried ratio-era ticks (0, 0.5 … 2.5) from
 *  when ROI was a ratio, so the labels described nothing.
 *
 *  Panel 1 — Trade Spend vs Incremental Sales. Both money, one axis, honest.
 *  Panel 2 — ROI against the target. One percentage axis, scaled to the data.
 *
 *  NULL ROI IS NEVER DRAWN AS ZERO. A period with no promotion has undefined
 *  ROI; plotting 0 would claim the promotion returned nothing. The line breaks
 *  and the tooltip says why. */
export function TrendPanels({
  data,
  rate,
  symbol,
  moneyHeight = 190,
  roiHeight = 130,
}: {
  data: TrendResponse
  /** From `meta.exchange_rate` — the single backend-defined rate. */
  rate: number
  symbol: string
  moneyHeight?: number
  roiHeight?: number
}) {
  const { ref: host, width } = useChartWidth(640)
  const [hover, setHover] = useState<number | null>(null)

  const { labels, series } = data
  const n = labels.length
  const padL = 58
  const padR = 14
  const innerW = Math.max(120, width - padL - padR)
  const step = n > 1 ? innerW / n : innerW
  const targetRoi = series.target_roi[0] ?? data.meta.target_roi_pct

  const money = (v: number) => {
    const a = v * rate
    if (symbol === '₹') {
      if (Math.abs(a) >= 1e7) return `${symbol}${(a / 1e7).toFixed(1)} Cr`
      if (Math.abs(a) >= 1e5) return `${symbol}${(a / 1e5).toFixed(1)} L`
      return `${symbol}${a.toFixed(0)}`
    }
    if (Math.abs(a) >= 1e6) return `${symbol}${(a / 1e6).toFixed(1)} M`
    if (Math.abs(a) >= 1e3) return `${symbol}${(a / 1e3).toFixed(1)} K`
    return `${symbol}${a.toFixed(0)}`
  }

  // --- money panel ---
  const moneyMax = Math.max(...series.incremental_sales, ...series.trade_spend, 1)
  const padT = 12
  const mInner = moneyHeight - padT - 20
  const yM = (v: number) => padT + mInner * (1 - v / moneyMax)

  // --- ROI panel: percentage-aware, negatives preserved ---
  const roiValues = series.roi.filter((v): v is number => v !== null)
  const roiMin = Math.min(0, ...roiValues, targetRoi)
  const roiMax = Math.max(...roiValues, targetRoi) * 1.08 || 100
  const rInner = roiHeight - padT - 24
  const yR = (v: number) => padT + rInner * (1 - (v - roiMin) / (roiMax - roiMin || 1))

  // Break the ROI line into runs of consecutive non-null points.
  const runs: { i: number; v: number }[][] = []
  let run: { i: number; v: number }[] = []
  series.roi.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run)
      run = []
    } else run.push({ i, v })
  })
  if (run.length) runs.push(run)

  const cx = (i: number) => padL + step * i + step / 2
  const labelEvery = Math.max(1, Math.ceil(n / (width < 560 ? 6 : 13)))
  const active = hover !== null && hover < n ? hover : null

  return (
    <div ref={host} className="relative w-full">
      {/* Panel 1 — money */}
      <svg width={width} height={moneyHeight} role="img" aria-label="Trade spend and incremental sales over time">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={width - padR} y1={yM(moneyMax * f)} y2={yM(moneyMax * f)} stroke="var(--border-subtle)" />
            <text x={padL - 8} y={yM(moneyMax * f) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {money(moneyMax * f)}
            </text>
          </g>
        ))}
        {labels.map((_, i) => {
          const h = Math.max(0, mInner - (yM(series.incremental_sales[i]) - padT))
          return (
            <rect
              key={i}
              x={cx(i) - step * 0.3}
              y={yM(series.incremental_sales[i])}
              width={step * 0.6}
              height={h}
              rx={2}
              fill="var(--brand-violet)"
              fillOpacity={active === i ? 0.9 : 0.55}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
        <polyline
          fill="none"
          stroke="var(--status-danger)"
          strokeWidth={2}
          points={series.trade_spend.map((v, i) => `${cx(i)},${yM(v)}`).join(' ')}
        />
      </svg>

      {/* Panel 2 — ROI */}
      <svg width={width} height={roiHeight} role="img" aria-label="ROI against target over time">
        {[0, 1].map((f) => {
          const v = roiMin + (roiMax - roiMin) * f
          return (
            <g key={f}>
              <line x1={padL} x2={width - padR} y1={yR(v)} y2={yR(v)} stroke="var(--border-subtle)" />
              <text x={padL - 8} y={yR(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
                {v.toFixed(0)}%
              </text>
            </g>
          )
        })}
        <line
          x1={padL} x2={width - padR} y1={yR(targetRoi)} y2={yR(targetRoi)}
          stroke="var(--brand-violet)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.8}
        />
        <text x={width - padR} y={yR(targetRoi) - 4} textAnchor="end" fontSize={9.5} fill="var(--brand-violet)" fontWeight={700}>
          Target {targetRoi}%
        </text>
        {roiMin < 0 && <line x1={padL} x2={width - padR} y1={yR(0)} y2={yR(0)} stroke="var(--text-muted)" opacity={0.4} />}
        {runs.map((r, k) => (
          <polyline
            key={k}
            fill="none"
            stroke="var(--brand-violet)"
            strokeWidth={2}
            points={r.map((p) => `${cx(p.i)},${yR(p.v)}`).join(' ')}
          />
        ))}
        {runs.flatMap((r) =>
          r.map((p) => <circle key={p.i} cx={cx(p.i)} cy={yR(p.v)} r={active === p.i ? 3.5 : 2} fill="var(--brand-violet)" />),
        )}
        {labels.map((l, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={cx(i)} y={roiHeight - 6} textAnchor="middle" fontSize={9.5} fill="var(--text-muted)">
              {l}
            </text>
          ) : null,
        )}
        {/* Invisible hover columns spanning both panels' x range */}
        {labels.map((_, i) => (
          <rect
            key={`h${i}`} x={cx(i) - step / 2} y={0} width={step} height={roiHeight}
            fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {active !== null && (
        <div
          className="pointer-events-none absolute top-2 z-20 w-56 rounded-[var(--r-md)] border border-border-default bg-surface-card p-2.5 text-[11px] shadow-[var(--shadow-lg)]"
          style={{ left: Math.min(Math.max(0, cx(active) - 112), Math.max(0, width - 224)) }}
        >
          <div className="font-bold text-ink-primary">{labels[active]}</div>
          <Row k="Incremental Sales" v={data.display.incremental_sales[active]} />
          <Row k="Trade Spend" v={data.display.trade_spend[active]} />
          {series.roi[active] === null ? (
            <div className="mt-1 text-ink-muted">ROI — no promotion / insufficient baseline</div>
          ) : (
            <>
              <Row k="ROI" v={`${(series.roi[active] as number).toFixed(1)}%`} />
              <Row k="Target ROI" v={`${targetRoi}%`} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="mt-1 flex justify-between gap-3">
      <span className="text-ink-muted">{k}</span>
      <span className="font-semibold tabular-nums text-ink-primary">{v}</span>
    </div>
  )
}
