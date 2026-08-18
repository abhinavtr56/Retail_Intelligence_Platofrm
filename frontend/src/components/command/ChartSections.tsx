import { useState } from 'react'
import { useBreakdown } from '../../hooks/useCommandCenter'
import { useCommandFilters } from '../../store/commandFilters'
import { ChartFrame, TopNSelect } from './ChartFrame'
import { RankedBar } from './RankedBar'
import { ScatterQuadrant } from './ScatterQuadrant'
import type { BreakdownDimension } from '../../types/commandCenter'

/** The chart sections of the Command Center.
 *
 *  Every one reads the SAME filter state as the KPI cards, through the same
 *  `useBreakdown` hook. There is no chart-local filter copy and no second
 *  serialisation path, so a chart cannot silently describe a different scope
 *  from the cards above it. */

const SYMBOL = { INR: '₹', USD: '$' } as const

function useDisplay() {
  const currency = useCommandFilters((s) => s.currency)
  return { currency, symbol: SYMBOL[currency] }
}

/** A ranked breakdown chart. One component serves channel, retailer, offer,
 *  product and promotion type — they differ only by dimension and copy. */
function RankedSection({
  by,
  title,
  hint,
  defaultN = 10,
  showTopN = true,
  emptyMessage,
}: {
  by: BreakdownDimension
  title: string
  hint: string
  defaultN?: number
  showTopN?: boolean
  emptyMessage?: string
}) {
  const [limit, setLimit] = useState(defaultN)
  const { symbol } = useDisplay()
  const q = useBreakdown(by, { limit })
  const data = q.data

  return (
    <ChartFrame
      title={title}
      hint={hint}
      actions={showTopN ? <TopNSelect value={limit} onChange={setLimit} /> : undefined}
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={!data || data.groups.length === 0}
      emptyMessage={emptyMessage}
      footnote={
        data?.truncated
          ? `Showing top ${data.groups.length} of ${data.total_groups}. Ranked by Incremental Sales — not a share of the total.`
          : 'Ranked by Incremental Sales. Groups are compared, not summed.'
      }
    >
      {data && (
        <RankedBar groups={data.groups} rate={data.meta.exchange_rate} symbol={symbol} />
      )}
    </ChartFrame>
  )
}

/** M2 · Channel Performance.
 *
 *  Hidden when the scope holds a single channel: a one-bar ranking answers
 *  nothing the KPI cards have not already said. */
export function ChannelSection() {
  const q = useBreakdown('channel', { limit: 10 })
  if (q.data && q.data.total_groups < 2) return null
  return (
    <RankedSection
      by="channel"
      title="Channel Performance"
      hint="Incremental Sales and Trade Spend per channel, with ROI. A ranking — Incremental Sales is not additive across groups, so this is not a share of the total."
    />
  )
}

/** M4 · Trade Spend vs Return. */
export function SpendVsReturnSection() {
  const { symbol } = useDisplay()
  const q = useBreakdown('promotion', { limit: 30 })
  const data = q.data
  return (
    <ChartFrame
      title="Trade Spend vs Return"
      hint="Each offer positioned by what it cost and what it returned. Points below the dashed target line are not paying back. Point size is Incremental Sales."
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={!data || data.groups.filter((g) => g.roi !== null).length === 0}
      emptyMessage="No promotions with a measurable return in this scope."
      height={260}
      footnote="Offers with undefined ROI (no trade spend) are omitted rather than plotted at zero."
    >
      {data && (
        <ScatterQuadrant
          groups={data.groups}
          targetRoi={data.meta.target_roi_pct}
          rate={data.meta.exchange_rate}
          symbol={symbol}
        />
      )}
    </ChartFrame>
  )
}

/** M3 · Offer Performance. Labelled by Promotion_Description via the backend;
 *  never deduplicated by Promotion_Name. */
export function OfferSection() {
  return (
    <RankedSection
      by="promotion"
      title="Offer Performance"
      hint="Each promotion by Incremental Sales, with its Trade Spend and ROI. Ranked by Incremental Sales rather than ROI, because a small-spend promotion can post an extreme ROI on very little money."
    />
  )
}

/** N1 · Retailer Performance. Hidden where no retailer exists — B2B stores
 *  carry a blank Retailer, so the chart would be empty rather than informative. */
export function RetailerSection() {
  const q = useBreakdown('retailer', { limit: 10 })
  if (q.data && q.data.total_groups === 0) return null
  return (
    <RankedSection
      by="retailer"
      title="Retailer Performance"
      hint="Top retailers by Incremental Sales, with Trade Spend and ROI."
      emptyMessage="No retailers in this scope."
    />
  )
}

/** N2 · Promotion Type — two groups, so deliberately compact. */
export function PromotionTypeSection() {
  return (
    <RankedSection
      by="promotion_type"
      title="Regular vs Seasonal"
      hint="Promotion type comparison, from dim_promotion.Promotion_Type."
      showTopN={false}
    />
  )
}

/** N3 · Product Performance. Ranked by Incremental Sales, never ROI: with 36
 *  SKUs the small denominators make ROI rankings noise. */
export function ProductSection() {
  return (
    <RankedSection
      by="product"
      title="Product Performance"
      hint="Top products by Incremental Sales. Ranked by value rather than ROI, because small-volume SKUs produce extreme ROI on negligible spend."
    />
  )
}
