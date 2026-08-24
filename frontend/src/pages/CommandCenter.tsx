import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  TpoKpiGrid,
  TpoKpiTile,
  AlertBanner,
  Table,
  Th,
  Td,
  Tr,
  Dropdown,
  LiveStatus,
  useLiveStatus,
  useToast,
} from '../components/ui'
import { Icon, type IconName } from '../icons'
import { InfoBlock, InfoPopover } from '../components/ui/InfoPopover'
import { calendarYear } from '../lib/labels'
import { FilterBar } from '../components/command/FilterBar'
import { PromotionMixCard } from '../components/command/PromotionMixCard'
import { RiskAlertsPanel } from '../components/command/RiskAlertsPanel'
import { topPriorityAlert } from '../components/command/riskRanking'
import { EmptyState as CcEmptyState, ErrorState, KpiSkeleton, PanelSkeleton, Stale } from '../components/command/States'
import { TrendPanels } from '../components/command/TrendPanels'
import {
  ChannelSection,
  RetailerDistributorSection,
  ProductSection,
  PromotionTypeSection,
  PromotionContributionSection,
  TopPerformingSection,
} from '../components/command/ChartSections'
import {
  useFilterOptions,
  useKpis,
  usePromotionMix,
  useBreakdown,
  useRiskAlerts,
  useTrend,
  useUnderperforming,
} from '../hooks/useCommandCenter'
import { useCommandFilters } from '../store/commandFilters'
import { ExportReportButton } from '../components/reports/ExportReportButton'
// The SAME CommandFilters -> API filter-dict converter the Simulation Studio
// posts with. Reused rather than rewritten: a second implementation is how an
// export starts describing a different selection from the screen.
import { toSimulationFilters as toReportScope } from '../hooks/useSimulation'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import type { RiskAlert, UnderperformingRow } from '../types/commandCenter'
import type { KpiCard } from '../types/commandCenter'

const GRANULARITIES = [
  { label: 'Weekly', value: 'week' as const },
  { label: 'Monthly', value: 'month' as const },
]

// Presentation only — which glyph and tint each card wears. The label, value,
// formula and delta all come from the backend; nothing here computes or
// re-formats a KPI.
const KPI_STYLE: Record<string, { icon: IconName; tint: string }> = {
  trade_spend: { icon: 'wallet', tint: 'lavender' },
  incremental_sales: { icon: 'barChart', tint: 'sky' },
  promotion_roi: { icon: 'target', tint: 'violet' },
  margin_impact: { icon: 'coins', tint: 'amber' },
  pei: { icon: 'gauge', tint: 'mint' },
  cannibalization_rate: { icon: 'cannib', tint: 'rose' },
}

const KPI_ORDER = [
  'trade_spend',
  'incremental_sales',
  'promotion_roi',
  'margin_impact',
  'pei',
  'cannibalization_rate',
]

const LOWER_IS_BETTER = new Set(['trade_spend', 'cannibalization_rate'])

/** The evidence line for the Cannibalization card, or null for every other
 *  card. Uses the tile's existing sub-label slot rather than adding a row to
 *  a fixed-height tile. */
function cannibalizationSub(card: KpiCard): string | null {
  if (card.key !== 'cannibalization_rate') return null
  const count = (n: number) => `${n.toLocaleString()} comparable event${n === 1 ? '' : 's'}`
  if (card.available) {
    return card.comparable_events == null ? null : `${card.delta_sub} · ${count(card.comparable_events)}`
  }
  const wider = card.measured_at
  if (!wider) return null
  return `${wider.display_value} across ${wider.scope_label} · ${count(wider.comparable_events)}`
}

// The API emits ONE concatenated Critical -> High -> Medium list and truncates
// the tail, so the top of the High band sits behind every Critical row and a
// small `limit` cannot reach it. The whole alert set for the scope is fetched
// and segmented client-side instead. React Query caches it per filter
// combination, so this is one request per scope, not per render.
const ALERT_FETCH_LIMIT = 100000

// Same reason as the alerts: `/underperforming-promotions` ranks by At Stake
// DESC, so the worst-ROI promotions are NOT at the head of its list. The full
// set for the scope is fetched and re-ranked here.
const UNDERPERFORMING_FETCH_LIMIT = 100000

// How many ranked rows are rendered. The card reports the true total in its
// header; this only bounds the DOM, and the scroller reaches every one of them.
const UNDERPERFORMING_ROWS = 25

// Three rows above the fold, the rest inside the scroller. Sized so the card
// keeps a fixed height whatever the row count.
const UNDERPERFORMING_VIEWPORT_PX = 252

export function CommandCenter() {
  const [granularity, setGranularity] = useState<'week' | 'month'>('week')
  const { show } = useToast()
  const navigate = useNavigate()
  const live = useLiveStatus()
  const queryClient = useQueryClient()

  const initialise = useCommandFilters((s) => s.initialise)
  const initialised = useCommandFilters((s) => s.initialised)
  const reset = useCommandFilters((s) => s.reset)
  // Read-only, for the RCA hand-off below. The Command Center's own filter
  // state is never written from here — the hand-off copies it.
  const filters = useCommandFilters((s) => s.filters)
  const startFromCommandCenter = useActiveInvestigationStore((s) => s.startFromCommandCenter)

  const options = useFilterOptions()
  const kpis = useKpis()
  const trend = useTrend(granularity)
  const alerts = useRiskAlerts(ALERT_FETCH_LIMIT)
  const underperforming = useUnderperforming(UNDERPERFORMING_FETCH_LIMIT)
  // Both metrics per MECHANIC for the Promotion Mix toggle.
  //
  // Was `by=promotion`, which is why the 20% seasonal mechanic never appeared
  // here: it is not one offer but six (PBNY24 … PBDI24), so the largest
  // mechanic in 2024 was split into six slices each smaller than the 5%
  // Discount slice and was never named. `by=promotion_mechanic` groups them on
  // dim_promotion.Promotion_Name, which is what the Promotion Contribution
  // card already does. 50 comfortably exceeds the five mechanics.
  const mixBreakdown = useBreakdown('promotion_mechanic', { limit: 50 })
  const mix = usePromotionMix()

  // Highest-impact underperformers: worst ROI first, larger Trade Spend
  // breaking ties. Computed from the API's own rows — no row is hardcoded and
  // nothing is recomputed, only re-ordered.
  const worstPromotions = useMemo(
    () =>
      [...(underperforming.data?.rows ?? [])]
        .sort((a, b) => (a.roi_pct ?? 0) - (b.roi_pct ?? 0) || b.trade_spend - a.trade_spend)
        .slice(0, UNDERPERFORMING_ROWS),
    [underperforming.data],
  )

  // Default the period to the most recent year the data actually contains,
  // rather than to a hardcoded year that a future extract might not have.
  useEffect(() => {
    const years = options.data?.years
    if (years?.length) initialise(Math.max(...years))
  }, [options.data?.years, initialise])

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Command Center' }]

  const refreshing =
    kpis.isFetching || trend.isFetching || alerts.isFetching || underperforming.isFetching || mix.isFetching

  const handleRefresh = () => {
    show('Refreshing all data sources...', { duration: 1500 })
    queryClient.invalidateQueries({ queryKey: ['command-center'] }).then(() => {
      live.reset()
      show('Data refreshed · all systems healthy', { duration: 2000 })
    })
  }

  // First load: lay out the real grid in skeleton form so the page does not
  // jump when data lands, and so nothing reads as a value before it is one.
  // `initialised` is part of the condition, not just a nicety: the data queries
  // are disabled until the default year is known, so `kpis.isLoading` is false
  // in that window and the page would fall through to the error branch.
  if (!initialised || options.isLoading || kpis.isLoading) {
    return (
      <AppShell activeKey="command" crumbs={crumbs}>
        <div className="relative">
          <div className="cc-ambient" aria-hidden="true" />
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em]">TPO Command Center</h1>
              <p className="mt-1.5 text-sm text-ink-muted">Loading the latest promotion performance…</p>
            </div>
          </div>
          <div className="mt-[18px]">
            <TpoKpiGrid>
              {KPI_ORDER.map((key, i) => (
                <KpiSkeleton key={key} delayMs={i * 50} />
              ))}
            </TpoKpiGrid>
          </div>
          <span className="sr-only" role="status">Loading Command Center</span>
        </div>
      </AppShell>
    )
  }

  const error = options.error ?? kpis.error
  if (error || !kpis.data || !options.data) {
    return (
      <AppShell activeKey="command" crumbs={crumbs}>
        <ErrorState
          error={error ?? new Error('No data returned')}
          retrying={options.isFetching || kpis.isFetching}
          onRetry={() => {
            void options.refetch()
            void kpis.refetch()
          }}
        />
      </AppShell>
    )
  }

  const meta = kpis.data.meta
  const counts = alerts.data?.counts
  // Highest-priority risk in the CURRENT scope: Critical before High before
  // Medium, then worst ROI, then largest stake. Derived from the data, so it
  // follows every filter change and names no promotion in code.
  const headline = topPriorityAlert(alerts.data?.alerts)

  // No rows for this filter combination. Show the filter bar (so the user can
  // undo it) and say so plainly — never a grid of "0"s, which would read as a
  // genuine result.
  const isEmpty = meta.row_count === 0

  /** THE COMMAND CENTER -> RCA HAND-OFF (B3.2).
   *
   *  These three call sites already held the clicked entity and threw it away,
   *  navigating with nothing. They now hand over the Command Center's own
   *  validated FilterState, narrowed only by identifiers the source ACTUALLY
   *  provides.
   *
   *  BOTH SOURCES CARRY THE EVENT'S CODES — promotion, product and channel —
   *  so all three narrow the scope. That is what makes a row's ROI and the
   *  Simulation Studio's Current Plan describe the same population: a -3.6%
   *  alert is one SKU in one channel, and handing over an unnarrowed selection
   *  made Simulation answer for the whole promotion instead.
   *
   *  THE WEEK IS A LABEL AND STAYS ONE. It identifies the event but cannot
   *  scope it: Incremental Sales is measured against the non-promoted rows of
   *  the selection, the promoted week has none, and a week-narrowed scope
   *  reports -100% instead of the row's own ROI. Display names ("Modern
   *  Trade", not "CH002") likewise stay in `labels` — turning one back into a
   *  code by guessing would select different rows from the ones clicked.
   *
   *  Nothing here recomputes anything, and the Command Center's own filter
   *  state is not mutated — the hand-off is a copy.
   */
  const handOffAlert = (alert: RiskAlert) => {
    startFromCommandCenter({
      origin: 'risk_alert',
      label: alert.title,
      filters: {
        ...filters,
        promotion: [alert.promotion_id],
        product: [alert.product_id],
        channel: [alert.channel_id],
      },
      identifiers: {
        promotion_id: alert.promotion_id,
        product_id: alert.product_id,
        channel_id: alert.channel_id,
      },
      labels: { product: alert.product, channel: alert.channel, week: alert.week },
    })
    navigate('/investigations')
  }

  const handOffPromotion = (row: UnderperformingRow) => {
    startFromCommandCenter({
      origin: 'underperforming',
      label: row.promotion,
      // The current selection narrowed by the three codes this event genuinely
      // carries. The PERIOD SELECTION IS LEFT ALONE on purpose: an event's
      // Incremental Sales is measured against the baseline of the whole
      // selection, so changing the period window would move the baseline and
      // the drill-down would answer a different question from the row that was
      // clicked. `row.period` is a week and stays a label — FilterState has no
      // week, so the scope reaches this (promotion, product, channel) and
      // pools whatever weeks it traded in.
      filters: {
        ...filters,
        promotion: [row.promotion_id],
        product: [row.product_id],
        channel: [row.channel_id],
      },
      identifiers: {
        promotion_id: row.promotion_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
      },
      labels: { product: row.product, channel: row.channel, period: row.period },
    })
    navigate('/investigations')
  }

  return (
    <AppShell activeKey="command" crumbs={crumbs}>
      {/* Decorative ambient wash behind the header — the "lights" feel, kept to
          two very low-alpha radial gradients. */}
      <div className="cc-ambient" aria-hidden="true" />
      <div className="fade-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[30px] font-extrabold tracking-[-0.025em] leading-[1.1]">TPO Command Center</h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            Real-time overview of promotions, performance and risks · {calendarYear(meta.period)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <FilterBar options={options.data} onRefresh={handleRefresh} refreshing={refreshing} />
          {/* EXPORTS WHAT THE SCREEN IS SHOWING. `scope` is read at click time
              from the same `commandFilters` store every card, chart and table on
              this page reads, so a report can never describe a different
              selection from the one on screen. */}
          <ExportReportButton
            module="command-center"
            scope={() => toReportScope(useCommandFilters.getState().filters)}
            currency={meta.currency}
            disabled={isEmpty}
            disabledReason="This filter selection matches no sales rows, so there is nothing to report."
          />
        </div>
      </div>

      {isEmpty ? (
        <Card className="mt-[18px]">
          <CcEmptyState
            hint="Try removing a filter, or clear them all to return to the full scope."
            onClear={reset}
          />
        </Card>
      ) : (
      <>
      <Stale when={refreshing}>
      <div className="mt-[18px]">
        <TpoKpiGrid>
          {KPI_ORDER.map((key, i) => {
            const card: KpiCard | undefined = kpis.data.kpis[key]
            if (!card) return null
            const style = KPI_STYLE[key]
            return (
              <TpoKpiTile
                key={key}
                label={card.label}
                value={card.display_value}
                delta={card.delta_display}
                // Cannibalization carries its evidence: how many comparable
                // events stood behind the rate, or -- when this selection
                // cannot support one -- the narrowest wider scope that can,
                // named so it is never read as this selection's own figure.
                deltaSub={calendarYear(cannibalizationSub(card) ?? (card.available ? card.delta_sub : (card.unavailable_reason ?? card.delta_sub)))}
                trend={card.trend}
                icon={style.icon}
                tint={style.tint}
                delayMs={i * 60}
                info={card.info}
                unit={card.unit}
                lowerIsBetter={LOWER_IS_BETTER.has(key)}
              />
            )
          })}
        </TpoKpiGrid>
      </div>

      {headline && (
        <AlertBanner
          title={headline.title}
          desc={`${headline.description} ${headline.at_stake_display} at stake.`}
          ctaTo="/investigations"
          onClick={() => handOffAlert(headline)}
        />
      )}

      <div className="mt-[18px] grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4 max-[1280px]:grid-cols-1">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Promotion Performance Trend
                <InfoPopover label="About Promotion Performance Trend" title="Promotion Performance Trend">
                  <InfoBlock label="Incremental Sales">Actual Sales − Baseline Sales</InfoBlock>
                  <InfoBlock label="Trade Spend">Discount Value + Promotion Cost</InfoBlock>
                  <InfoBlock label="ROI">(Incremental Sales − Trade Spend) ÷ Trade Spend × 100</InfoBlock>
                  <InfoBlock label="Target ROI">{meta.target_roi_pct}%</InfoBlock>
                </InfoPopover>
              </span>
            }
            actions={
              <Dropdown
                selected={GRANULARITIES.find((g) => g.value === granularity)?.label ?? 'Weekly'}
                options={GRANULARITIES.map((g) => ({ label: g.label }))}
                onSelect={(picked) => {
                  const next = GRANULARITIES.find((g) => g.label === picked)
                  if (next) setGranularity(next.value)
                }}
                trigger={
                  <Button variant="ghost" size="sm" className="cursor-pointer">
                    {GRANULARITIES.find((g) => g.value === granularity)?.label} <Icon name="chevronDown" />
                  </Button>
                }
              />
            }
          />
          <CardBody>
            {/* Three business series, all lines, plus the dashed reference. The
                swatches mirror the stroke colours in TrendPanels. */}
            <div className="mb-2 flex flex-wrap gap-4 pb-2">
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm bg-brand-violet" />} label={`Incremental Sales (${meta.currency})`} />
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm bg-status-danger" />} label={`Trade Spend (${meta.currency})`} />
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm" style={{ background: '#14B8A6' }} />} label="ROI (%)" />
              <LegendItem
                swatch={<span className="h-0 w-[18px] border-t-2 border-dashed border-ink-muted" />}
                label={`Target ROI (${meta.target_roi_pct}%)`}
              />
            </div>
            {trend.isLoading ? (
              <PanelSkeleton height={300} />
            ) : trend.error ? (
              <ErrorState error={trend.error} onRetry={() => void trend.refetch()} retrying={trend.isFetching} compact />
            ) : trend.data && trend.data.labels.length > 0 ? (
              <Stale when={trend.isFetching}>
                {/* Symbol AND rate both come from the trend response. Taking
                    the symbol from the KPI response instead let the two
                    disagree mid-switch — the axis briefly rendered ₹ against
                    USD-converted numbers while the slower query settled. */}
                <TrendPanels
                  data={trend.data}
                  rate={trend.data.meta.exchange_rate}
                  symbol={trend.data.meta.currency === 'USD' ? '$' : '₹'}
                  granularity={granularity}
                  /* Sized to the height the grid row actually gives this card
                     (its Risk Alerts sibling drives it). At the previous 320
                     the plot stopped ~88px short of the card's own border. */
                  height={408}
                />
              </Stale>
            ) : (
              <CcEmptyState compact message="No promotions in this selection." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Risk Alerts"
            subtitle={`Below the ${meta.target_roi_pct}% ROI target`}
            actions={
              <div className="flex items-center gap-2">
                {counts && (
                  <span className="text-[11px] font-semibold text-ink-muted">
                    {counts.target_achieved} of {counts.total_events} at target
                  </span>
                )}
                <InfoPopover label="About Risk Alerts" title="Risk alert rule">
                  <InfoBlock label="Severity">
                    Critical &lt; 25%
                    <br />
                    High 25–40%
                    <br />
                    Medium 40–{meta.target_roi_pct}%
                    <br />
                    Target ≥ {meta.target_roi_pct}%
                  </InfoBlock>
                  <InfoBlock label="Ranking">
                    Highest stake first
                    <br />
                    ROI as tie-breaker
                  </InfoBlock>
                </InfoPopover>
              </div>
            }
          />
          {alerts.data && alerts.data.alerts.length > 0 ? (
            <RiskAlertsPanel
              data={alerts.data}
              onSelect={(a) => {
                show(`Opening "${a.title}" investigation...`, { duration: 1500 })
                window.setTimeout(() => handOffAlert(a), 700)
              }}
            />
          ) : (
            <CardBody className="px-5 py-1.5">
              <EmptyState message="Every promotion in this selection is at or above target." />
            </CardBody>
          )}
        </Card>
      </div>

      <div className="mt-[18px] grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4 max-[1280px]:grid-cols-1">
        <Card>
          <CardHeader
            title="Top Underperforming Promotions"
            actions={
              underperforming.data ? (
                <span className="text-[11px] font-semibold text-ink-muted">
                  {underperforming.data.total} below {meta.target_roi_pct}% target
                </span>
              ) : null
            }
          />
          {/* Fixed-height internal scroller: the worst three sit above the fold
              and the rest scroll INSIDE the card, so neither the card nor the
              page grid grows with the row count. `overflow-x` stays on the same
              element so a narrow viewport still scrolls the table sideways. */}
          <div
            // Tighter horizontal cell padding than the shared Table default
            // (18px), scoped to this table only: eight columns at the default
            // spend 288px on padding alone and pushed the Action control out of
            // view behind a horizontal scrollbar.
            className="overflow-auto rounded-b-[var(--r-lg)] [&_td]:!px-2.5 [&_th]:!px-2.5"
            style={{ maxHeight: UNDERPERFORMING_VIEWPORT_PX }}
          >
            <Table>
              <thead className="sticky top-0 z-10 bg-surface-muted">
                <tr>
                  <Th>Promotion</Th>
                  {/* The event grain is promotion x product x channel x week.
                      Without Product on screen, three SKUs of one promotion in
                      one channel and week read as one row repeated with
                      different numbers. */}
                  <Th>Product</Th>
                  <Th>Channel</Th>
                  <Th>Period</Th>
                  <Th className="text-right">ROI</Th>
                  <Th className="text-right">Trade Spend</Th>
                  <Th>Primary Cause</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {worstPromotions.map((p, i) => (
                  <Tr
                    key={`${p.promotion}-${p.period}-${p.product}-${i}`}
                    onClick={() => {
                      show(`Drilling into "${p.promotion}"...`, { duration: 1500 })
                      window.setTimeout(() => handOffPromotion(p), 700)
                    }}
                  >
                    <Td emphasis className="max-w-[120px] truncate" title={p.promotion}>
                      {p.promotion}
                    </Td>
                    <Td className="max-w-[130px] truncate" title={p.product}>{p.product}</Td>
                    <Td className="max-w-[110px] truncate" title={p.channel}>{p.channel}</Td>
                    <Td className="whitespace-nowrap">{p.period}</Td>
                    <Td
                      className={`text-right font-bold tabular-nums ${
                        (p.roi_pct ?? 0) < 0 ? 'text-status-danger' : 'text-ink-primary'
                      }`}
                    >
                      {p.roi_display}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{p.trade_spend_display}</Td>
                    <Td className="max-w-[130px] truncate" title={p.primary_cause}>
                      {p.primary_cause}
                    </Td>
                    <Td>
                      {/* The recommended action rides as the tooltip so the
                          control stays one line — the row itself already opens
                          the RCA view, and this makes that affordance explicit. */}
                      <span
                        title={p.action}
                        className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] px-2 py-1 text-[11.5px] font-semibold text-brand-violet transition-colors duration-150 hover:bg-brand-violet-50 [&_svg]:h-3 [&_svg]:w-3"
                      >
                        Ask why
                        <Icon name="arrowRight" />
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {worstPromotions.length === 0 && (
              <EmptyState message="No promotion in this selection is below target." />
            )}
          </div>
        </Card>

        <PromotionMixCard
          mix={mix.data}
          breakdown={mixBreakdown.data}
          tradeSpendTotal={kpis.data.kpis.trade_spend?.display_value ?? '—'}
          incrementalSalesTotal={kpis.data.kpis.incremental_sales?.display_value ?? '—'}
          emptyState={<EmptyState message="No promotional spend in this selection." />}
        />
      </div>

      {/* ---- Chart sections. Each reads the same filter state as the cards. ---- */}
      <div className="mt-[18px] grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <ChannelSection />
        <TopPerformingSection />
      </div>
      <div className="mt-[18px] grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <RetailerDistributorSection />
        <PromotionContributionSection />
      </div>
      <div className="mt-[18px] grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <ProductSection />
        <PromotionTypeSection />
      </div>
      </Stale>
      </>
      )}
    </AppShell>
  )
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
      {swatch}
      {label}
    </span>
  )
}

/** Shown when a filter combination genuinely has no data. Saying so is the
 *  point — the alternative is a chart of zeros that reads as a real result. */
function EmptyState({ message }: { message: string }) {
  return <div className="grid min-h-[120px] place-items-center px-4 text-center text-xs text-ink-muted">{message}</div>
}
