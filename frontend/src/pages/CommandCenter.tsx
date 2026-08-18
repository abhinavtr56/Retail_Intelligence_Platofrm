import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Pill,
  TpoKpiGrid,
  TpoKpiTile,
  AlertBanner,
  RiskList,
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
import { DonutBreakdown } from '../components/charts'
import { FilterBar } from '../components/command/FilterBar'
import { EmptyState as CcEmptyState, ErrorState, KpiSkeleton, PanelSkeleton, Stale } from '../components/command/States'
import { TrendPanels } from '../components/command/TrendPanels'
import {
  ChannelSection,
  OfferSection,
  ProductSection,
  PromotionTypeSection,
  RetailerSection,
  SpendVsReturnSection,
} from '../components/command/ChartSections'
import {
  useFilterOptions,
  useKpis,
  usePromotionMix,
  useRiskAlerts,
  useTrend,
  useUnderperforming,
} from '../hooks/useCommandCenter'
import { useCommandFilters } from '../store/commandFilters'
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

const SEVERITY_ICON: Record<string, IconName> = {
  Critical: 'warning',
  High: 'alertTriangle',
  Medium: 'trendingDown',
}

export function CommandCenter() {
  const [granularity, setGranularity] = useState<'week' | 'month'>('week')
  const { show } = useToast()
  const navigate = useNavigate()
  const live = useLiveStatus()
  const queryClient = useQueryClient()

  const initialise = useCommandFilters((s) => s.initialise)
  const reset = useCommandFilters((s) => s.reset)

  const options = useFilterOptions()
  const kpis = useKpis()
  const trend = useTrend(granularity)
  const alerts = useRiskAlerts(8)
  const underperforming = useUnderperforming(8)
  const mix = usePromotionMix()

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
  if (options.isLoading || kpis.isLoading) {
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
          <div className="mt-4">
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
  const headline = alerts.data?.alerts[0]

  // No rows for this filter combination. Show the filter bar (so the user can
  // undo it) and say so plainly — never a grid of "0"s, which would read as a
  // genuine result.
  const isEmpty = meta.row_count === 0

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
            Real-time overview of promotions, performance and risks · {meta.period}
          </p>
        </div>
        <div>
          <FilterBar options={options.data} onRefresh={handleRefresh} refreshing={refreshing} />
        </div>
      </div>

      {isEmpty ? (
        <Card className="mt-4">
          <CcEmptyState
            hint="Try removing a filter, or clear them all to return to the full scope."
            onClear={reset}
          />
        </Card>
      ) : (
      <>
      <Stale when={refreshing}>
      <div className="mt-4">
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
                deltaSub={card.available ? card.delta_sub : (card.unavailable_reason ?? card.delta_sub)}
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
          onClick={() => navigate('/investigations')}
        />
      )}

      <div className="mt-[18px] grid grid-cols-[1.7fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Promotion Performance Trend <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
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
            <div className="mb-2 flex flex-wrap gap-4 pb-2">
              <LegendItem swatch={<span className="h-2.5 w-3.5 rounded-sm bg-brand-violet/60" />} label={`Incremental Sales (${meta.currency})`} />
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm bg-status-danger" />} label={`Trade Spend (${meta.currency})`} />
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm bg-brand-violet" />} label="ROI (%)" />
              <LegendItem
                swatch={<span className="h-0 w-[18px] border-t-2 border-dashed border-brand-violet" />}
                label={`Target ROI (${meta.target_roi_pct}%)`}
              />
            </div>
            {trend.isLoading ? (
              <PanelSkeleton height={300} />
            ) : trend.error ? (
              <ErrorState error={trend.error} onRetry={() => void trend.refetch()} retrying={trend.isFetching} compact />
            ) : trend.data && trend.data.labels.length > 0 ? (
              <Stale when={trend.isFetching}>
                <TrendPanels
                  data={trend.data}
                  rate={trend.data.meta.exchange_rate}
                  symbol={meta.currency === 'USD' ? '$' : '₹'}
                />
              </Stale>
            ) : (
              <CcEmptyState compact message="No promotions in this selection." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Top Risk Alerts"
            actions={
              counts ? (
                <span className="text-[11px] font-semibold text-ink-muted">
                  {counts.critical}C · {counts.high}H · {counts.medium}M
                </span>
              ) : null
            }
          />
          <CardBody className="px-4 py-1.5">
            {alerts.data && alerts.data.alerts.length > 0 ? (
              <RiskList
                items={alerts.data.alerts.map((a) => ({
                  title: a.title,
                  desc: `${a.product} · ${a.channel} · ROI ${a.roi_pct?.toFixed(1)}% · ${a.at_stake_display} at stake`,
                  severity: a.severity,
                  ic: SEVERITY_ICON[a.severity] ?? 'warning',
                  tone: a.tone,
                }))}
                onSelect={(r) => {
                  show(`Opening "${r.title}" investigation...`, { duration: 1500 })
                  window.setTimeout(() => navigate('/investigations'), 700)
                }}
              />
            ) : (
              <EmptyState message="Every promotion in this selection is at or above target." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-[18px] grid grid-cols-[1.7fr_1fr] gap-4 max-[1280px]:grid-cols-1">
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
          <div className="overflow-x-auto rounded-b-[var(--r-lg)]">
            <Table>
              <thead>
                <tr>
                  <Th>Promotion</Th>
                  <Th>Channel</Th>
                  <Th>Period</Th>
                  <Th>ROI</Th>
                  <Th>vs Target</Th>
                  <Th>Trade Spend</Th>
                  <Th>Primary Cause</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {underperforming.data?.rows.map((p, i) => (
                  <Tr
                    key={`${p.promotion}-${p.period}-${p.product}-${i}`}
                    onClick={() => {
                      show(`Drilling into "${p.promotion}"...`, { duration: 1500 })
                      window.setTimeout(() => navigate('/investigations'), 700)
                    }}
                  >
                    <Td emphasis>{p.promotion}</Td>
                    <Td>{p.channel}</Td>
                    <Td>{p.period}</Td>
                    <Td>{p.roi_display}</Td>
                    <Td className={p.vs_target_pp < 0 ? 'font-bold text-status-danger' : 'font-bold text-status-success'}>
                      {p.vs_target_pp > 0 ? '+' : ''}
                      {p.vs_target_pp.toFixed(1)} pp
                    </Td>
                    <Td>{p.trade_spend_display}</Td>
                    <Td>{p.primary_cause}</Td>
                    <Td>
                      <Pill tone="danger" dot>
                        {p.action}
                      </Pill>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {underperforming.data && underperforming.data.rows.length === 0 && (
              <EmptyState message="No promotion in this selection is below target." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Promotion Mix by Offer (Spend %)" />
          <CardBody>
            {mix.data && mix.data.slices.length > 0 ? (
              <DonutBreakdown
                segments={mix.data.slices.map((s) => ({ key: s.label, pct: s.pct, color: s.color }))}
                size={168}
                stroke={26}
                centerValue={mix.data.total_spend_display}
                centerLabel="Total Spend"
              />
            ) : (
              <EmptyState message="No promotional spend in this selection." />
            )}
          </CardBody>
        </Card>
      </div>

      {/* ---- Chart sections. Each reads the same filter state as the cards. ---- */}
      <div className="mt-[18px] grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <ChannelSection />
        <SpendVsReturnSection />
      </div>
      <div className="mt-[18px] grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <OfferSection />
        <RetailerSection />
      </div>
      <div className="mt-[18px] grid grid-cols-[1.7fr_1fr] gap-4 max-[1100px]:grid-cols-1">
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
