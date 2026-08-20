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
  TopPromotionsResponse,
  TrendResponse,
  UnderperformingResponse,
} from '../types/commandCenter'

/** TWO SCOPES, DELIBERATELY.
 *
 *  KPI CARDS answer "what do the numbers look like for exactly this
 *  selection", so they receive the FULL global filter payload — year, channel,
 *  retailer and everything under More Filters.
 *
 *  CHARTS answer "how did promotions behave over the year", and each carries
 *  its own local control (granularity, discount level, severity, metric) for
 *  the cut it is about. They receive ONLY `{year, currency}` plus that chart's
 *  own parameters. Their query strings are assembled explicitly rather than by
 *  walking the filter object, so a dimension cannot leak in: what is not named
 *  is not sent.
 *
 *  That split is the whole point — the detailed dimensions are what make a
 *  chart request expensive, and they are exactly what the charts do not use.
 *  It also means chart caches survive a Channel or Product change untouched.
 *
 *  Every query keys off the scope it actually uses, so React Query refetches
 *  precisely the panels a given filter can affect and no others.
 */
function useScope() {
  const filters = useCommandFilters((s) => s.filters)
  const year = useCommandFilters((s) => s.filters.year)
  const currency = useCommandFilters((s) => s.currency)
  // The default year is only known once /filters has answered. Until then the
  // store still reads `year: null`, which is a VALID scope (All Years) — so
  // without this gate every panel would fetch the whole two-year dataset and
  // then immediately refetch the real year, doubling first-load traffic.
  const initialised = useCommandFilters((s) => s.initialised)
  return { filters, year, currency, enabled: initialised }
}

/** `year` omitted entirely means All Years — the backend reads an absent year
 *  as unconstrained and aggregates 2024 + 2025 through the same KPI logic. It
 *  is never sent as an empty string, which would be a different request. */
function commandQuery(
  year: number | null,
  currency?: Currency,
  extra?: Record<string, string | number | string[] | undefined>,
): string {
  const params = new URLSearchParams()
  if (year !== null && year !== undefined) params.set('year', String(year))
  if (currency) params.set('currency', currency)
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v === undefined) continue
    // A list is REPEATED, not joined: the API models every list filter as
    // `?key=a&key=b` (routers/command_center.ListParam), which is how one
    // promotion mechanic made of six offers is expressed with no new contract.
    if (Array.isArray(v)) v.forEach((item) => params.append(k, item))
    else params.set(k, String(v))
  }
  return params.toString()
}

/** Cache key for a chart: the year scope only, so a Channel or Product change
 *  cannot invalidate it. */
function key(name: string, year: number | null, currency?: Currency) {
  return ['command-center', name, year ?? 'all', currency ?? null] as const
}

/** Cache key for a KPI-scoped query: every filter, because every filter moves
 *  the answer. */
function fullKey(name: string, filters: CommandFilters, currency?: Currency) {
  return ['command-center', name, filters, currency ?? null] as const
}

export function useKpis() {
  const { filters, currency, enabled } = useScope()
  return useQuery({
    queryKey: fullKey('kpis', filters, currency),
    queryFn: () => apiFetch<KpiResponse>(`/command-center/kpis?${toQuery(filters, currency)}`),
    enabled,
    placeholderData: (previous) => previous,
  })
}

/** Filter options depend on the selection but never on the currency — asking
 *  for them per currency would double the cache for identical answers. */
/** Filter options depend on the whole selection — that is what makes the
 *  dropdowns cascade — but never on the currency. */
export function useFilterOptions() {
  const filters = useCommandFilters((s) => s.filters)
  return useQuery({
    queryKey: fullKey('filters', filters),
    queryFn: () => apiFetch<FiltersResponse>(`/command-center/filters?${toQuery(filters)}`),
    placeholderData: (previous) => previous,
  })
}

export function useTrend(granularity: 'week' | 'month') {
  const { year, currency, enabled } = useScope()
  return useQuery({
    queryKey: [...key('trend', year, currency), granularity],
    queryFn: () =>
      apiFetch<TrendResponse>(`/command-center/trend?${commandQuery(year, currency, { granularity })}`),
    enabled,
    placeholderData: (previous) => previous,
  })
}

export function useRiskAlerts(limit = 20) {
  const { year, currency, enabled } = useScope()
  return useQuery({
    queryKey: [...key('risk-alerts', year, currency), limit],
    queryFn: () =>
      apiFetch<RiskAlertsResponse>(`/command-center/risk-alerts?${commandQuery(year, currency, { limit })}`),
    enabled,
    placeholderData: (previous) => previous,
  })
}

export function useUnderperforming(limit = 20) {
  const { year, currency, enabled } = useScope()
  return useQuery({
    queryKey: [...key('underperforming', year, currency), limit],
    queryFn: () =>
      apiFetch<UnderperformingResponse>(
        `/command-center/underperforming-promotions?${commandQuery(year, currency, { limit })}`,
      ),
    enabled,
    placeholderData: (previous) => previous,
  })
}

export function usePromotionMix() {
  const { year, currency, enabled } = useScope()
  return useQuery({
    queryKey: key('promotion-mix', year, currency),
    queryFn: () =>
      apiFetch<PromotionMixResponse>(`/command-center/promotion-mix?${commandQuery(year, currency)}`),
    enabled,
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
  {
    metric = 'incremental_sales',
    limit = 10,
    promotion,
    enabled: callerEnabled = true,
  }: {
    metric?: BreakdownMetric
    limit?: number
    /** One offer code, or the set of codes behind one promotion mechanic. */
    promotion?: string | string[]
    /** Hold the request until the caller has what it needs to scope it. */
    enabled?: boolean
  } = {},
) {
  const { year, currency, enabled } = useScope()
  // `promotion` is a CHART-LEVEL scope (the Channel card's discount level), not
  // a global filter. It is the only dimension any Command Center request sends
  // besides year.
  return useQuery({
    queryKey: [...key('breakdown', year, currency), by, metric, limit, promotion ?? null],
    queryFn: () =>
      apiFetch<BreakdownResponse>(
        `/command-center/breakdown?${commandQuery(year, currency, { by, metric, limit, promotion })}`,
      ),
    enabled: enabled && callerEnabled,
    placeholderData: (previous) => previous,
  })
}

export function useTopPromotions(limit = 100) {
  const { year, currency, enabled } = useScope()
  return useQuery({
    queryKey: [...key('top-promotions', year, currency), limit],
    queryFn: () =>
      apiFetch<TopPromotionsResponse>(
        `/command-center/top-promotions?${commandQuery(year, currency, { limit })}`,
      ),
    enabled,
    placeholderData: (previous) => previous,
  })
}
