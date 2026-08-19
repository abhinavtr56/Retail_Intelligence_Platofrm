import { useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, InfoBlock, InfoPopover } from '../ui'
import { DonutBreakdown } from '../charts'
import type { BreakdownResponse, PromotionMixResponse } from '../../types/commandCenter'

/** Promotion Mix by Mechanic, switchable between Trade Spend and Incremental
 *  Sales.
 *
 *  Values come from `/breakdown?by=promotion_mechanic`, which already returns
 *  BOTH metrics per mechanic — no new endpoint. Grouping by MECHANIC rather
 *  than by offer is what makes the 20% seasonal mechanic visible: it is six
 *  Promotion_Ids (PBNY24 … PBDI24) sharing one Promotion_Name, so grouping by
 *  offer scattered the largest 2024 mechanic across six slices and never named
 *  it. Colour still comes from `/promotion-mix` where a code matches, and
 *  falls back to the palette that mirrors service._MIX_COLORS otherwise.
 *
 *  Both metrics decompose exactly across mechanics in this dataset: the slices
 *  sum to the headline Trade Spend and Incremental Sales to the rupee (each
 *  promoted row belongs to exactly one mechanic). Shares are therefore taken
 *  against the sum of the slices, which IS the headline total, and they add up
 *  to 100%. The centre total is the KPI card's own display value for the same
 *  scope, so the donut and the card above it can never disagree.
 */

const METRICS = [
  { key: 'trade_spend' as const, label: 'Trade Spend' },
  { key: 'incremental_sales' as const, label: 'Incremental Sales' },
]
type MetricKey = (typeof METRICS)[number]['key']

const HINT: Record<MetricKey, string> = {
  trade_spend: 'Share of total trade spend by promotion mechanic.',
  incremental_sales: 'Share of total incremental sales by promotion mechanic.',
}

export function PromotionMixCard({
  mix,
  breakdown,
  tradeSpendTotal,
  incrementalSalesTotal,
  emptyState,
}: {
  mix: PromotionMixResponse | undefined
  breakdown: BreakdownResponse | undefined
  /** Formatted headline totals, straight from the KPI cards. */
  tradeSpendTotal: string
  incrementalSalesTotal: string
  emptyState: React.ReactNode
}) {
  const [metric, setMetric] = useState<MetricKey>('trade_spend')

  const segments = useMemo(() => {
    if (!breakdown?.groups.length) return []
    const style = new Map((mix?.slices ?? []).map((s) => [s.code, s]))
    const valued = breakdown.groups.map((g, i) => ({
      code: g.code,
      label: style.get(g.code)?.label ?? g.label,
      color: style.get(g.code)?.color ?? PALETTE[i % PALETTE.length],
      // null means the metric is undefined for that offer in this scope — it
      // contributes nothing to the total rather than being dropped silently.
      amount: (metric === 'trade_spend' ? g.trade_spend : g.incremental_sales) ?? 0,
      display: metric === 'trade_spend' ? g.trade_spend_display : g.incremental_sales_display,
    }))
    // Share is of the selected metric's own total — never carried over from
    // the other metric.
    const total = valued.reduce((sum, v) => sum + v.amount, 0)
    return valued
      .sort((a, b) => b.amount - a.amount)
      .map((v) => ({
        key: v.label,
        pct: total ? Math.round((v.amount / total) * 1000) / 10 : 0,
        color: v.color,
        value: v.display,
      }))
  }, [breakdown, mix, metric])

  const centerValue = metric === 'trade_spend' ? tradeSpendTotal : incrementalSalesTotal
  const centerLabel = metric === 'trade_spend' ? 'Total Spend' : 'Total Inc. Sales'

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            Promotion Mix by Mechanic
            <InfoPopover label="About Promotion Mix" title="Promotion Mix">
              <InfoBlock label="Shows">{HINT[metric]}</InfoBlock>
            </InfoPopover>
          </span>
        }
        actions={
          <div
            className="inline-flex overflow-hidden rounded-[var(--r-sm)] border border-border-subtle"
            role="radiogroup"
            aria-label="Promotion Mix metric"
          >
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={`cursor-pointer px-2 py-0.5 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-violet ${
                  metric === m.key
                    ? 'bg-brand-violet text-white'
                    : 'text-ink-muted hover:bg-surface-hover hover:text-ink-primary'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        {segments.length > 0 ? (
          <DonutBreakdown
            segments={segments}
            size={168}
            stroke={26}
            centerValue={centerValue}
            centerLabel={centerLabel}
          />
        ) : (
          emptyState
        )}
      </CardBody>
    </Card>
  )
}

/** Fallback only — used if an offer appears in the breakdown but not in the
 *  mix response. Mirrors service._MIX_COLORS. */
const PALETTE = ['#7C5CFF', '#4F7CFF', '#14B8A6', '#F59E0B', '#EF4444', '#9CA3AF']
