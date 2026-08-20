import { useMemo, useState } from 'react'
import { useBreakdown, useTopPromotions } from '../../hooks/useCommandCenter'
import { useCommandFilters } from '../../store/commandFilters'
import { ChartFrame } from './ChartFrame'
import { RankedBar } from './RankedBar'
import type { BreakdownGroup } from '../../types/commandCenter'

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

/** The mechanics the SELECTED SCOPE actually ran, in ascending discount order.
 *
 *  Previously a hardcoded three-entry list of PR001/PR002/PR003. That list is
 *  why the 20% seasonal mechanic could never be selected here: it excluded, by
 *  construction, every mechanic whose discount is not carried in a regular
 *  offer code — the six 2024 seasonal offers that together ARE "20% Discount
 *  (Seasonal)", and the 2025 Buy3Get1.
 *
 *  Now derived from `by=promotion_mechanic`, whose groups carry the
 *  Promotion_Ids behind each mechanic. Selecting one scopes the channel query
 *  through the existing `promotion` list filter, so a mechanic made of six
 *  offers is one selection rather than six.
 *
 *  Sorted by the leading percentage in the mechanic name so the control reads
 *  5 -> 10 -> 15 -> 20; a mechanic with no percentage (Buy3Get1) sorts last. */
function mechanicRank(code: string): number {
  const pct = /^(\d+)%/.exec(code)
  return pct ? Number(pct[1]) : Number.POSITIVE_INFINITY
}

/** "5% Discount (Regular)" -> "5%", "Buy3Get1 (Seasonal)" -> "Buy3Get1". The
 *  header control is narrow, and the full label is in the card's hint. */
function shortMechanic(code: string): string {
  return code.replace(/\s*Discount$/, '')
}

/** M2 · Channel Performance — "which channel performs best at this discount?"
 *
 *  Not a Top-N ranking: every channel the scope contains is shown, ordered by
 *  Incremental Sales descending (the backend's own ordering for this metric).
 *  The discount control is a chart-level Offer filter that genuinely re-queries
 *  `/breakdown`; it does not relabel a fixed dataset. */
export function ChannelSection() {
  const [picked, setPicked] = useState<string | null>(null)
  const { symbol } = useDisplay()

  // Which mechanics the current Year holds, and the offers behind each.
  const mechanics = useBreakdown('promotion_mechanic', { limit: 50 })
  const levels = useMemo(
    () =>
      (mechanics.data?.groups ?? [])
        .filter((g) => (g.members?.length ?? 0) > 0)
        .map((g) => ({ code: g.code, label: g.label, promotions: g.members ?? [] }))
        .sort((a, b) => mechanicRank(a.code) - mechanicRank(b.code)),
    [mechanics.data],
  )
  // A mechanic the newly-selected year did not run falls back to the first one
  // available, so the card never sits on an empty selection.
  const level = levels.find((l) => l.code === picked) ?? levels[0]

  // Year is the Command Center's only global filter, so the mechanic is the
  // sole extra scope this card applies. limit 20 comfortably exceeds the five
  // channels, so nothing is truncated.
  //
  // Held while the mechanic list is PLACEHOLDER data. Without that, a year
  // switch fires this query against the previous year's offer ids — 2024 scope
  // carrying the six 2025 seasonal codes — because the mechanic query still
  // serves last year's groups until its own refetch lands. It self-corrected a
  // moment later, but it put one cross-year request on the wire, which is
  // exactly what the Year filter must never do.
  const q = useBreakdown('channel', {
    limit: 20,
    promotion: level?.promotions,
    enabled: Boolean(level) && !mechanics.isPlaceholderData,
  })
  const data = q.data

  return (
    <ChartFrame
      title="Channel Performance"
      hint={`Compares channel-level promotion performance at the selected promotion mechanic. Metrics: Incremental Sales, Trade Spend, ROI. Currently showing ${level?.label ?? '—'}.`}
      actions={
        <div className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span>Mechanic</span>
          <div
            className="inline-flex overflow-hidden rounded-[var(--r-sm)] border border-border-subtle"
            role="radiogroup"
            aria-label="Promotion mechanic"
          >
            {levels.map((d) => (
              <button
                key={d.code}
                type="button"
                role="radio"
                aria-checked={d.code === level?.code}
                onClick={() => setPicked(d.code)}
                className={`cursor-pointer px-1.5 py-0.5 font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-violet ${
                  d.code === level?.code
                    ? 'bg-brand-violet text-white'
                    : 'text-ink-muted hover:bg-surface-hover hover:text-ink-primary'
                }`}
              >
                {shortMechanic(d.code)}
              </button>
            ))}
          </div>
        </div>
      }
      isLoading={q.isLoading || mechanics.isLoading}
      isFetching={q.isFetching || mechanics.isFetching}
      error={q.error ?? mechanics.error}
      onRetry={() => {
        void mechanics.refetch()
        void q.refetch()
      }}
      isEmpty={!data || data.groups.length === 0}
      emptyMessage={`No ${level.label} discount activity in this scope.`}
      footnote="Ranked by Incremental Sales. Channels are compared, not summed."
    >
      {data && (
        <RankedBar
          groups={data.groups}
          rate={data.meta.exchange_rate}
          symbol={symbol}
          rowTooltip={(g) =>
            `${g.label}
Mechanic: ${level?.label ?? '—'}

` +
            `Incremental Sales: ${g.incremental_sales_display}
` +
            `Trade Spend: ${g.trade_spend_display}
` +
            `ROI: ${g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}`
          }
        />
      )}
    </ChartFrame>
  )
}

/** M4 · Top Performing Promotions.
 *
 *  The positive counterpart to the Underperforming table, at the same
 *  promotion EVENT grain (promotion x product x channel x week).
 *
 *  RANKING is ROI descending — but a raw ROI ranking is useless here, and the
 *  reason is structural rather than a data artefact. With the approved
 *  economics, ROI = u(1-d) / ((1+u)(d+c)) - 1, so the shallowest discount
 *  always wins: PR001 invests 8% of base revenue and returns ~78%, while the
 *  seasonal mechanics invest 23-28% and return ~30%. Ranked naively, all ten
 *  rows are "5% Discount" at every spend threshold. Three guards fix that
 *  without touching a single number:
 *
 *  1. MEANINGFUL IMPACT — drop events below the MEDIAN Trade Spend of the
 *     eligible population. Computed from the data on every render, never a
 *     hardcoded rupee figure, so it follows the year filter and the currency.
 *  2. DEDUPE on promotion + channel + period, keeping the best ROI. Without it
 *     three rows of "5% Discount · B2B · 2025-W14" (different products) read as
 *     three findings when they are one.
 *  3. DIVERSITY — a HARD cap of two rows per MECHANIC (5%/10%/15% Discount,
 *     20% Discount seasonal, Buy3Get1 seasonal). Capping by promotion NAME was
 *     not enough: the six seasonal events of one year are six different names
 *     but ONE mechanic. The cap is not relaxed to reach ten — doing so simply
 *     returned the spare slots to 5% Discount, which is what put four of it in
 *     a ten-row list. It never promotes a lower-ROI event ahead of a
 *     higher-ROI one; it only removes the surplus.
 *
 *  EXCLUSIONS: the endpoint already drops events with an undefined ROI, and
 *  because `roi_percent` is null exactly when Trade Spend is zero, that is also
 *  the zero-spend filter. Negative ROI is kept as-is and simply loses.
 */
const TOP_N = 10

/** A HARD maximum of rows any one mechanic may occupy. Not a soft preference:
 *  spare slots are left empty rather than handed back to a mechanic already at
 *  the cap, which is what previously filled four of ten rows with 5% Discount. */
const PER_MECHANIC_CAP = 2

/** The mechanic behind one promotion event. PR001/2/3 carry the percentage in
 *  their own display name; the seasonal events do not — their mechanic is a
 *  property of the YEAR they ran in (2024 seasonal is the 20% price cut, 2025
 *  seasonal is Buy3Get1). Read off the event's PERIOD, which is authoritative,
 *  rather than the year suffix in its display name. Labels match the mechanic
 *  names the Promotion Contribution card shows, so the two cards agree. */
const SEASONAL_MECHANIC_BY_YEAR: Record<string, string> = {
  '2024': '20% Discount (Seasonal)',
  '2025': 'Buy3Get1 (Seasonal)',
}

function promotionMechanic(row: { promotion: string; period: string }): string {
  const explicit = /^(\d+)%/.exec(row.promotion)
  if (explicit) return `${explicit[1]}% Discount`
  return SEASONAL_MECHANIC_BY_YEAR[row.period.slice(0, 4)] ?? 'Seasonal'
}

/** The whole eligible population, because the threshold is its MEDIAN: any
 *  prefix of an ROI-sorted list is biased towards small spends and would put
 *  the median in the wrong place. */
const TOP_FETCH_LIMIT = 100000

export function TopPerformingSection() {
  const q = useTopPromotions(TOP_FETCH_LIMIT)

  const rows = useMemo(() => {
    const eligible = (q.data?.rows ?? []).filter(
      (r) => r.roi_pct !== null && Number.isFinite(r.roi_pct) && r.trade_spend > 0,
    )
    if (!eligible.length) return []

    const spends = eligible.map((r) => r.trade_spend).sort((a, b) => a - b)
    const mid = spends.length >> 1
    const median = spends.length % 2 ? spends[mid] : (spends[mid - 1] + spends[mid]) / 2

    const ranked = eligible
      .filter((r) => r.trade_spend >= median)
      .sort((a, b) => b.roi_pct - a.roi_pct || b.trade_spend - a.trade_spend)

    const seen = new Set<string>()
    const deduped = ranked.filter((r) => {
      const k = `${r.promotion}|${r.channel}|${r.period}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    // The cap is never relaxed. A single year runs four mechanics, so a year
    // scope yields eight rows and All Years ten; a SHORTER, honest list beats
    // handing the spare slots back to the mechanic that already dominates.
    const used = new Map<string, number>()
    const picked = deduped.filter((r) => {
      const m = promotionMechanic(r)
      const n = used.get(m) ?? 0
      if (n >= PER_MECHANIC_CAP) return false
      used.set(m, n + 1)
      return true
    })
    return picked.slice(0, TOP_N)
  }, [q.data])

  const peak = rows.length ? Math.max(rows[0].roi_pct, 1) : 1

  return (
    <ChartFrame
      title="Top Performing Promotions"
      hint="Top performing promotions ranked by ROI among meaningful-impact promotions."
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={rows.length === 0}
      emptyMessage="No promotion with a measurable return in this scope."
      height={260}
      footnote={`${rows.length} promotions ranked by ROI, among those at or above median Trade Spend. At most ${PER_MECHANIC_CAP} per mechanic.`}
    >
      {/* Fixed viewport so the card keeps the exact height it had as the
          scatter chart; any rows beyond the fold scroll inside the card. */}
      <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: 268 }}>
        {rows.map((r, i) => (
          <div
            key={`${r.promotion}-${r.channel}-${r.period}-${i}`}
            className="group"
            title={
              `${r.promotion}
${r.channel} · ${r.period}

` +
              `ROI: ${r.roi_display}
` +
              `Trade Spend: ${r.trade_spend_display}
` +
              `Incremental Sales: ${r.incremental_sales_display}`
            }
          >
            <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="min-w-0 truncate font-semibold text-ink-primary">
                <span className="mr-1.5 tabular-nums text-ink-disabled">{i + 1}</span>
                {r.promotion}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-status-success">{r.roi_display}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-primary/[0.05]">
              <div
                className="h-full rounded-full bg-brand-violet transition-[width] duration-300 group-hover:brightness-110"
                style={{ width: `${Math.max(0, Math.min(100, (r.roi_pct / peak) * 100))}%` }}
              />
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10.5px] text-ink-muted">
              <span className="min-w-0 truncate">
                {r.channel} · {r.period}
              </span>
              <span className="shrink-0 tabular-nums">
                Spend {r.trade_spend_display} · Inc. Sales {r.incremental_sales_display}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  )
}


/** M3 · Retailer & Distributor Performance.
 *
 *  One card, two populations and three metrics — all served by the existing
 *  `/breakdown` endpoint, which already computes every KPI per dimension value
 *  through the frozen engine. Nothing is recomputed here; the client only
 *  re-orders, because the API ranks by the metric alone and this card wants
 *  ROI as the tie-break.
 *
 *  The full group list is fetched (31 retailers, not 5) so that tie-break has a
 *  real pool: taking the API's own top five would already have discarded the
 *  rows a tie could promote.
 */
const METRICS = [
  { key: 'trade_spend' as const, label: 'Trade Spend' },
  { key: 'incremental_sales' as const, label: 'Incremental Sales' },
  { key: 'roi' as const, label: 'ROI' },
]
type MetricKey = (typeof METRICS)[number]['key']

const TOP_ROWS = 10

/** The two dimensions this card merges. Both are real breakdown dimensions on
 *  the existing endpoint — nothing is derived from the other. */
const SOURCES = [
  { by: 'retailer' as const, type: 'Retailer' as const },
  { by: 'distributor' as const, type: 'Distributor' as const },
]
type EntityType = (typeof SOURCES)[number]['type']

type Entity = BreakdownGroup & { type: EntityType }

function metricValue(g: BreakdownGroup, metric: MetricKey): number | null {
  return metric === 'trade_spend' ? g.trade_spend : metric === 'roi' ? g.roi : g.incremental_sales
}

function metricDisplay(g: BreakdownGroup, metric: MetricKey): string {
  if (metric === 'roi') return g.roi === null ? '—' : `${g.roi.toFixed(1)}%`
  return metric === 'trade_spend' ? g.trade_spend_display : g.incremental_sales_display
}

/** Metric selector. One segmented control, so the card has a single top
 *  control and the rows below are the only ranking. */
function MetricSelect({ value, onChange }: { value: MetricKey; onChange: (v: MetricKey) => void }) {
  return (
    <div
      className="inline-flex h-[23px] items-stretch overflow-hidden rounded-[var(--r-sm)] border border-border-subtle"
      role="radiogroup"
      aria-label="Performance metric"
    >
      {METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          role="radio"
          aria-checked={value === m.key}
          onClick={() => onChange(m.key)}
          className={`cursor-pointer px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-violet ${
            value === m.key
              ? 'bg-brand-violet text-white'
              : 'text-ink-muted hover:bg-surface-hover hover:text-ink-primary'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

/** Retailer & Distributor Performance — ONE ranked list over both entity types.
 *
 *  Retailers and distributors are ranked against each other on the selected
 *  metric, so the list is whatever the data puts in the top ten. There is no
 *  quota per type: if a type has one qualifying entity it contributes one row,
 *  and if it has none it contributes none. Nothing is synthesised to fill the
 *  list — the rows are exactly the groups the breakdown endpoint returns for
 *  `by=retailer` and `by=distributor`.
 *
 *  The two dimensions are fetched separately because they ARE separate
 *  dimensions on the endpoint; the merge is a client-side sort over two real
 *  responses, never one dimension relabelled as the other. */
export function RetailerDistributorSection() {
  const [metric, setMetric] = useState<MetricKey>('incremental_sales')

  // `metric` goes to the server so each side is ordered by the same measure the
  // card ranks on; `limit` is the endpoint's maximum, so the merged Top 10 is
  // chosen from the whole population rather than from two pre-truncated heads.
  const retailers = useBreakdown('retailer', { metric, limit: 50 })
  const distributors = useBreakdown('distributor', { metric, limit: 50 })

  const rows = useMemo(() => {
    const merged: Entity[] = [
      ...(retailers.data?.groups ?? []).map((g) => ({ ...g, type: 'Retailer' as const })),
      ...(distributors.data?.groups ?? []).map((g) => ({ ...g, type: 'Distributor' as const })),
    ]
    return merged
      .filter((g) => metricValue(g, metric) !== null)
      .sort(
        (a, b) =>
          (metricValue(b, metric) ?? 0) - (metricValue(a, metric) ?? 0) ||
          (b.roi ?? 0) - (a.roi ?? 0) ||
          (b.incremental_sales ?? 0) - (a.incremental_sales ?? 0),
      )
      .slice(0, TOP_ROWS)
  }, [retailers.data, distributors.data, metric])

  // Bars scale against the leader of the CURRENT metric, so the chart always
  // reads as a ranking of what is selected.
  const peak = rows.length ? Math.abs(metricValue(rows[0], metric) ?? 1) || 1 : 1

  const metricLabel = METRICS.find((m) => m.key === metric)?.label
  // The population both dimensions actually hold, from the API's own counts
  // rather than from the pages it returned.
  const total = (retailers.data?.total_groups ?? 0) + (distributors.data?.total_groups ?? 0)

  const isLoading = retailers.isLoading || distributors.isLoading
  const isFetching = retailers.isFetching || distributors.isFetching
  const error = retailers.error ?? distributors.error

  return (
    <ChartFrame
      title="Retailer & Distributor Performance"
      hint="Top 10 retailers and distributors ranked by the selected performance metric."
      controls={<MetricSelect value={metric} onChange={setMetric} />}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error}
      onRetry={() => {
        void retailers.refetch()
        void distributors.refetch()
      }}
      isEmpty={rows.length === 0}
      emptyMessage="No retailers or distributors with measurable performance in this scope."
      footnote={
        total > rows.length
          ? `Top ${rows.length} of ${total} retailers and distributors by ${metricLabel}. ROI breaks ties.`
          : `All ${total} retailers and distributors in this scope, ranked by ${metricLabel}. ROI breaks ties.`
      }
    >
      {/* gap-2.5 and the row structure are the ranked lists' own spacing, so
          this card and the ones beside it read as one system. */}
      <div className="flex flex-col gap-2.5">
        {rows.map((g, i) => (
          <div
            key={`${g.type}:${g.code}`}
            className="group"
            title={[
              `${g.label} (${g.type})`,
              '',
              `Trade Spend: ${g.trade_spend_display}`,
              `Incremental Sales: ${g.incremental_sales_display}`,
              `ROI: ${g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}`,
            ].join('\n')}
          >
            <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="tabular-nums text-ink-disabled">{i + 1}</span>
                <span className="truncate font-semibold text-ink-primary">{g.label}</span>
                {/* Type is a quiet qualifier, not a second ranking: it says
                    which population the row came from without competing with
                    the name or the numbers. */}
                <span className="shrink-0 rounded-[var(--r-sm)] border border-border-subtle px-1 py-px text-[10px] font-semibold text-ink-muted">
                  {g.type}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-bold text-ink-primary">{metricDisplay(g, metric)}</span>
                {/* ROI stays on every row whatever the ranking metric, so a
                    leader on spend is never mistaken for a leader on return.
                    Ranking BY ROI already prints it in the value slot, so the
                    second copy is dropped rather than shown twice. */}
                {metric !== 'roi' && (
                  <>
                    {' · '}
                    <span
                      className={
                        g.roi === null ? 'text-ink-muted'
                        : g.roi < 0 ? 'font-semibold text-status-danger'
                        : 'font-semibold text-status-success'
                      }
                    >
                      {g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}
                    </span>
                  </>
                )}
              </span>
            </div>
            {/* h-2.5 — the same bar height as the ranked lists beside it. */}
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-ink-primary/[0.05]">
              <div
                className="h-full rounded-full bg-brand-violet transition-[width] duration-300 group-hover:brightness-110"
                style={{
                  width: `${Math.max(0, Math.min(100, (Math.abs(metricValue(g, metric) ?? 0) / peak) * 100))}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  )
}


/** N1 · Promotion Contribution — where Incremental Sales and Trade Spend sit
 *  across promotion MECHANICS.
 *
 *  Mechanic, not offer: `by=promotion_mechanic` groups on
 *  dim_promotion.Promotion_Name, so the six seasonal offers of a year collapse
 *  into the single mechanic they all run ("20% Discount" in 2024, "Buy3Get1"
 *  in 2025). The mechanics a year did not run simply do not appear.
 *
 *  A COMPOSITION, and legitimately so — unlike most breakdowns on this page.
 *  The endpoint's own warning is that Incremental Sales is not reliably
 *  additive, because the baseline is re-derived per selection. For an offer
 *  dimension it is: every group is measured against the same non-promoted
 *  rows, so the mechanics reconcile to the headline KPI exactly (verified to
 *  0.0000% on both metrics, both years and All Years). The percentage below is
 *  therefore a real share of the total, computed on the values the backend
 *  returned — not a second calculation of them. */

const CONTRIBUTION_METRICS = [
  { key: 'incremental_sales' as const, label: 'Incremental Sales' },
  { key: 'trade_spend' as const, label: 'Trade Spend' },
]
type ContributionMetric = (typeof CONTRIBUTION_METRICS)[number]['key']

export function PromotionContributionSection() {
  const [metric, setMetric] = useState<ContributionMetric>('incremental_sales')
  const q = useBreakdown('promotion_mechanic', { metric, limit: 50 })

  const { rows, total } = useMemo(() => {
    const groups = q.data?.groups ?? []
    const value = (g: BreakdownGroup) =>
      metric === 'trade_spend' ? (g.trade_spend ?? 0) : (g.incremental_sales ?? 0)
    // The backend already ranked by `metric`; sorting here keeps the card
    // correct even if a future response arrives in another order.
    const ordered = [...groups].sort((a, b) => value(b) - value(a))
    return { rows: ordered, total: ordered.reduce((sum, g) => sum + value(g), 0) }
  }, [q.data, metric])

  const value = (g: BreakdownGroup) =>
    metric === 'trade_spend' ? (g.trade_spend ?? 0) : (g.incremental_sales ?? 0)
  const display = (g: BreakdownGroup) =>
    metric === 'trade_spend' ? g.trade_spend_display : g.incremental_sales_display
  const metricLabel = CONTRIBUTION_METRICS.find((m) => m.key === metric)?.label
  const peak = rows.length ? value(rows[0]) || 1 : 1

  return (
    <ChartFrame
      fill
      title="Promotion Contribution"
      hint="Shows how Incremental Sales or Trade Spend is distributed across promotion mechanics."
      controls={
        <div
          className="inline-flex h-[23px] items-stretch overflow-hidden rounded-[var(--r-sm)] border border-border-subtle"
          role="radiogroup"
          aria-label="Contribution metric"
        >
          {CONTRIBUTION_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={`cursor-pointer px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-violet ${
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
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={rows.length === 0}
      emptyMessage="No promotion mechanics ran in this scope."
      footnote={`${rows.length} mechanics · ${metricLabel} shares total 100% of the scope.`}
    >
      {/* Four or five mechanics against a ten-row neighbour: distributing them
          over the stretched height keeps the card filled and the spacing even,
          and the taller bar is what a chart with this few categories wants. */}
      <div className="flex flex-1 flex-col justify-between gap-3.5">
        {rows.map((g, i) => {
          const share = total ? (value(g) / total) * 100 : 0
          return (
            <div
              key={g.code}
              className="group"
              title={[
                g.label,
                '',
                `Trade Spend: ${g.trade_spend_display}`,
                `Incremental Sales: ${g.incremental_sales_display}`,
                `ROI: ${g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}`,
              ].join('\n')}
            >
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="tabular-nums text-ink-disabled">{i + 1}</span>
                  <span className="truncate font-semibold text-ink-primary">{g.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-bold text-ink-primary">{display(g)}</span>
                  {' · '}
                  <span className="font-semibold text-ink-muted">{share.toFixed(1)}%</span>
                </span>
              </div>
              {/* Bars are scaled against the LEADER, not against the total, so
                  the widths stay readable when one mechanic carries a third of
                  the money. The share is the number to the right. */}
              <div className="mt-1.5 h-10 w-full overflow-hidden rounded-[var(--r-sm)] bg-ink-primary/[0.05]">
                <div
                  className="h-full rounded-[var(--r-sm)] bg-brand-violet transition-[width] duration-300 group-hover:brightness-110"
                  style={{ width: `${Math.max(0, Math.min(100, (value(g) / peak) * 100))}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </ChartFrame>
  )
}

/** The three metrics both cards below rank on. Shared so the two controls are
 *  the same control, in the same order, with the same labels. */
const PERF_METRICS = [
  { key: 'incremental_sales' as const, label: 'Incremental Sales' },
  { key: 'trade_spend' as const, label: 'Trade Spend' },
  { key: 'roi' as const, label: 'ROI' },
]
type PerfMetric = (typeof PERF_METRICS)[number]['key']

function perfValue(g: BreakdownGroup, metric: PerfMetric): number | null {
  return metric === 'trade_spend' ? g.trade_spend : metric === 'roi' ? g.roi : g.incremental_sales
}

function perfDisplay(g: BreakdownGroup, metric: PerfMetric): string {
  if (metric === 'roi') return g.roi === null ? '—' : `${g.roi.toFixed(1)}%`
  return metric === 'trade_spend' ? g.trade_spend_display : g.incremental_sales_display
}

/** The metric selector shared by the two cards below. */
function PerfMetricSelect({
  value,
  onChange,
  label,
}: {
  value: PerfMetric
  onChange: (v: PerfMetric) => void
  label: string
}) {
  return (
    <div
      className="inline-flex h-[23px] items-stretch overflow-hidden rounded-[var(--r-sm)] border border-border-subtle"
      role="radiogroup"
      aria-label={label}
    >
      {PERF_METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          role="radio"
          aria-checked={value === m.key}
          onClick={() => onChange(m.key)}
          className={`cursor-pointer px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-violet ${
            value === m.key
              ? 'bg-brand-violet text-white'
              : 'text-ink-muted hover:bg-surface-hover hover:text-ink-primary'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

const PRODUCT_ROWS = 10

/** N2 · Regular vs Seasonal Performance — the two promotion types side by side.
 *
 *  A COMPARISON of two groups, not a ranking of many, so it is drawn as two
 *  aligned bars on one shared scale: the bars are directly comparable in length
 *  because they share a maximum, which a pair of independently-scaled bars
 *  would not be.
 *
 *  The share is real. Promotion type is an offer dimension, so both groups are
 *  measured against the same non-promoted rows and the two add back to the
 *  headline KPI exactly (verified to 0.0000% on Incremental Sales and Trade
 *  Spend, both years and All Years).
 *
 *  ROI CARRIES NO SHARE. It is a ratio, not a quantity: "Regular is 89% of the
 *  combined ROI" would be an arithmetic accident, not a fact about the
 *  business. For ROI the card states the gap in percentage points instead. */
export function PromotionTypeSection() {
  const [metric, setMetric] = useState<PerfMetric>('incremental_sales')
  const q = useBreakdown('promotion_type', { metric, limit: 50 })

  const groups = useMemo(() => {
    const rows = [...(q.data?.groups ?? [])]
    // Regular first, always — the card is a fixed comparison, so the two rows
    // must not swap places when the ranking metric changes.
    return rows.sort((a, b) => (a.code === 'Regular' ? -1 : b.code === 'Regular' ? 1 : 0))
  }, [q.data])

  const isShareable = metric !== 'roi'
  const total = isShareable
    ? groups.reduce((sum, g) => sum + (perfValue(g, metric) ?? 0), 0)
    : 0
  const peak = Math.max(...groups.map((g) => Math.abs(perfValue(g, metric) ?? 0)), 1)
  const metricLabel = PERF_METRICS.find((m) => m.key === metric)?.label

  const [lead, trail] = [...groups].sort(
    (a, b) => (perfValue(b, metric) ?? 0) - (perfValue(a, metric) ?? 0),
  )
  const gapPts =
    lead && trail ? (perfValue(lead, metric) ?? 0) - (perfValue(trail, metric) ?? 0) : null

  return (
    <ChartFrame
      fill
      title="Regular vs Seasonal Performance"
      hint="Compares regular and seasonal promotion contribution and return."
      controls={
        <PerfMetricSelect value={metric} onChange={setMetric} label="Comparison metric" />
      }
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={groups.length === 0}
      emptyMessage="No promotions in this scope."
      footnote={
        isShareable
          ? `Share of ${metricLabel}; the two types total 100% of the scope.`
          : gapPts !== null && lead
            ? `ROI is a ratio, so it carries no share — ${lead.code} leads by ${gapPts.toFixed(1)} pts.`
            : 'ROI is a ratio, so it carries no share.'
      }
    >
      {/* justify-CENTER, not space-between: two bars flung to the top and
          bottom of a tall card cannot be compared at a glance, which is the
          only thing this card exists to do. The pair stays adjacent and the
          stretched height is absorbed evenly above and below it. */}
      <div className="flex flex-1 flex-col justify-center gap-5">
        {groups.map((g) => {
          const value = perfValue(g, metric) ?? 0
          const share = total ? (value / total) * 100 : null
          return (
            <div
              key={g.code}
              className="group"
              title={[
                `${g.code} promotions`,
                '',
                `Trade Spend: ${g.trade_spend_display}`,
                `Incremental Sales: ${g.incremental_sales_display}`,
                `ROI: ${g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}`,
              ].join('\n')}
            >
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="truncate font-semibold text-ink-primary">{g.code}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-bold text-ink-primary">{perfDisplay(g, metric)}</span>
                  {share !== null && (
                    <>
                      {' · '}
                      <span className="font-semibold text-ink-muted">{share.toFixed(1)}%</span>
                    </>
                  )}
                </span>
              </div>
              {/* Both bars share `peak`, so their lengths are comparable. */}
              <div className="mt-1.5 h-14 w-full overflow-hidden rounded-[var(--r-sm)] bg-ink-primary/[0.05]">
                <div
                  className={`h-full rounded-[var(--r-sm)] transition-[width] duration-300 group-hover:brightness-110 ${
                    g.code === 'Regular' ? 'bg-brand-violet' : 'bg-status-info'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (Math.abs(value) / peak) * 100))}%` }}
                />
              </div>
              {/* ROI stays visible whatever the ranking metric, so a type that
                  carries the most money is never read as the best return.
                  Ranking BY ROI already prints it above, so the second copy is
                  dropped rather than shown twice. */}
              {metric !== 'roi' && (
                <div className="mt-1 text-[11px] text-ink-muted">
                  ROI{' '}
                  <span
                    className={
                      g.roi === null ? 'text-ink-muted'
                      : g.roi < 0 ? 'font-semibold text-status-danger'
                      : 'font-semibold text-status-success'
                    }
                  >
                    {g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ChartFrame>
  )
}

/** N3 · Product Performance — the top ten SKUs on the selected metric.
 *
 *  A RANKING, never a composition: Incremental Sales is re-baselined per
 *  selection, so ten of thirty-six products do not sum to anything meaningful
 *  and no share is shown. ROI rides on every row whatever the ranking metric,
 *  because a SKU can lead on spend and still be the worst return in the list. */
export function ProductSection() {
  const [metric, setMetric] = useState<PerfMetric>('incremental_sales')
  // The full population, so the tie-break below chooses from all 36 products
  // rather than from a head the server already cut at ten.
  const q = useBreakdown('product', { metric, limit: 50 })

  const rows = useMemo(() => {
    const groups = q.data?.groups ?? []
    return [...groups]
      .filter((g) => perfValue(g, metric) !== null)
      .sort(
        (a, b) =>
          (perfValue(b, metric) ?? 0) - (perfValue(a, metric) ?? 0) ||
          (b.roi ?? 0) - (a.roi ?? 0) ||
          (b.incremental_sales ?? 0) - (a.incremental_sales ?? 0),
      )
      .slice(0, PRODUCT_ROWS)
  }, [q.data, metric])

  const peak = rows.length ? Math.abs(perfValue(rows[0], metric) ?? 1) || 1 : 1
  const metricLabel = PERF_METRICS.find((m) => m.key === metric)?.label
  const total = q.data?.total_groups ?? rows.length

  return (
    <ChartFrame
      title="Product Performance"
      hint="Top 10 products ranked by the selected performance metric."
      controls={<PerfMetricSelect value={metric} onChange={setMetric} label="Performance metric" />}
      isLoading={q.isLoading}
      isFetching={q.isFetching}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={rows.length === 0}
      emptyMessage="No products with measurable performance in this scope."
      footnote={`Top ${rows.length} of ${total} products by ${metricLabel}. ROI breaks ties. A ranking, not a share of the total.`}
    >
      <div className="flex flex-col gap-2.5">
        {rows.map((g, i) => (
          <div
            key={g.code}
            className="group"
            title={[
              g.label,
              '',
              `Trade Spend: ${g.trade_spend_display}`,
              `Incremental Sales: ${g.incremental_sales_display}`,
              `ROI: ${g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}`,
            ].join('\n')}
          >
            <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="tabular-nums text-ink-disabled">{i + 1}</span>
                <span className="truncate font-semibold text-ink-primary">{g.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-bold text-ink-primary">{perfDisplay(g, metric)}</span>
                {/* Ranking BY ROI already prints it in the value slot, so the
                    second copy is dropped rather than shown twice. */}
                {metric !== 'roi' && (
                  <>
                    {' · '}
                    <span
                      className={
                        g.roi === null ? 'text-ink-muted'
                        : g.roi < 0 ? 'font-semibold text-status-danger'
                        : 'font-semibold text-status-success'
                      }
                    >
                      {g.roi === null ? '—' : `${g.roi.toFixed(1)}%`}
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-ink-primary/[0.05]">
              <div
                className="h-full rounded-full bg-brand-violet transition-[width] duration-300 group-hover:brightness-110"
                style={{
                  width: `${Math.max(0, Math.min(100, (Math.abs(perfValue(g, metric) ?? 0) / peak) * 100))}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  )
}
