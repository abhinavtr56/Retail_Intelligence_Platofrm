import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import { toQuery, useCommandFilters, type CommandFilters } from '../store/commandFilters'
import type {
  BreakdownDimension,
  BreakdownMetric,
  BreakdownResponse,
  Currency,
  FiltersResponse,
  KpiResponse,
  PromotionMixResponse,
  RiskAlertsResponse,
  TrendResponse,
  UnderperformingResponse,
} from '../types/commandCenter'

/** Every Command Center query keys off the SAME filter object, so React Query
 *  refetches all of them together whenever a filter moves. That is what keeps
 *  the cards, the chart, the alerts and the tables describing one scope —
 *  there is no path by which one panel can lag behind another. */
function useScope() {
  const filters = useCommandFilters((s) => s.filters)
  const currency = useCommandFilters((s) => s.currency)
  return { filters, currency }
}

function key(name: string, filters: CommandFilters, currency?: Currency) {
  return ['command-center', name, filters, currency ?? null] as const
}

export function useKpis() {
  const { filters, currency } = useScope()
  return useQuery({
    queryKey: key('kpis', filters, currency),
    queryFn: () => apiFetch<KpiResponse>(`/command-center/kpis?${toQuery(filters, currency)}`),
    placeholderData: (previous) => previous,
  })
}

/** Filter options depend on the selection but never on the currency — asking
 *  for them per currency would double the cache for identical answers. */
export function useFilterOptions() {
  const filters = useCommandFilters((s) => s.filters)
  return useQuery({
    queryKey: key('filters', filters),
    queryFn: () => apiFetch<FiltersResponse>(`/command-center/filters?${toQuery(filters)}`),
    placeholderData: (previous) => previous,
  })
}

export function useTrend(granularity: 'week' | 'month') {
  const { filters, currency } = useScope()
  return useQuery({
    queryKey: [...key('trend', filters, currency), granularity],
    queryFn: () =>
      apiFetch<TrendResponse>(
        `/command-center/trend?${toQuery(filters, currency)}&granularity=${granularity}`,
      ),
    placeholderData: (previous) => previous,
  })
}

export function useRiskAlerts(limit = 20) {
  const { filters, currency } = useScope()
  return useQuery({
    queryKey: [...key('risk-alerts', filters, currency), limit],
    queryFn: () =>
      apiFetch<RiskAlertsResponse>(`/command-center/risk-alerts?${toQuery(filters, currency)}&limit=${limit}`),
    placeholderData: (previous) => previous,
  })
}

export function useUnderperforming(limit = 20) {
  const { filters, currency } = useScope()
  return useQuery({
    queryKey: [...key('underperforming', filters, currency), limit],
    queryFn: () =>
      apiFetch<UnderperformingResponse>(
        `/command-center/underperforming-promotions?${toQuery(filters, currency)}&limit=${limit}`,
      ),
    placeholderData: (previous) => previous,
  })
}

export function usePromotionMix() {
  const { filters, currency } = useScope()
  return useQuery({
    queryKey: key('promotion-mix', filters, currency),
    queryFn: () =>
      apiFetch<PromotionMixResponse>(`/command-center/promotion-mix?${toQuery(filters, currency)}`),
    placeholderData: (previous) => previous,
  })
}

/** ONE hook for every ranking and scatter chart.
 *
 *  Deliberately not one hook per dimension: the filter state, currency and
 *  cache key are identical in each case, and duplicating them is how a chart
 *  ends up quietly querying a different scope from the KPI cards. */
export function useBreakdown(
  by: BreakdownDimension,
  { metric = 'incremental_sales', limit = 10 }: { metric?: BreakdownMetric; limit?: number } = {},
) {
  const { filters, currency } = useScope()
  return useQuery({
    queryKey: [...key('breakdown', filters, currency), by, metric, limit],
    queryFn: () =>
      apiFetch<BreakdownResponse>(
        `/command-center/breakdown?${toQuery(filters, currency)}&by=${by}&metric=${metric}&limit=${limit}`,
      ),
    placeholderData: (previous) => previous,
  })
}
