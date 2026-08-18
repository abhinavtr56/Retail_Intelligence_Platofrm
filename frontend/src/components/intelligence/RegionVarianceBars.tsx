import type { RegionVariance } from '../../types/intelligence'

// Ported from js/pages/intelligence.js's `renderRegionVariance` + css/tpo.css .rv-*.
export function RegionVarianceBars({ data }: { data: RegionVariance[] }) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.variance)))

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="p-[6px_8px] text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">Region</th>
          <th className="p-[6px_8px] text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">Variance</th>
          <th className="p-[6px_8px] text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted" />
        </tr>
      </thead>
      <tbody>
        {data.map((d) => {
          const isNeg = d.variance < 0
          const pct = (Math.abs(d.variance) / maxAbs) * 50
          return (
            <tr key={d.region} className="border-b border-border-subtle last:border-b-0">
              <td className="p-2 text-xs [font-variant-numeric:tabular-nums]">{d.region}</td>
              <td
                className={`p-2 text-xs font-bold [font-variant-numeric:tabular-nums] ${isNeg ? 'text-status-danger' : 'text-status-success'}`}
              >
                {isNeg ? '' : '+'}
                {d.variance.toFixed(1)}%
              </td>
              <td className="w-[60%] p-2">
                <div className="relative h-[14px] rounded-[3px] bg-surface-muted">
                  <div className="absolute bottom-0 left-1/2 top-0 w-px bg-border-strong" />
                  <div
                    className={`absolute bottom-0 top-0 rounded-[3px] transition-[width] duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isNeg
                        ? 'right-1/2 bg-[linear-gradient(90deg,#EF4444,#F87171)]'
                        : 'left-1/2 bg-[linear-gradient(90deg,#34D399,#10B981)]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
