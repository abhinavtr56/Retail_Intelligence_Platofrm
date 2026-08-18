// Wire types for /api/command-center/*. Mirrors app/tpo/service.py.
//
// Note what is NOT here: no KPI arithmetic. `value` is the canonical figure the
// backend computed and `display_value` is the string to render. The frontend
// never recomputes a KPI, never converts a currency and never applies a
// threshold — all three live in the backend so there is exactly one of each.

export type Unit = 'currency' | 'percent' | 'score'
export type Currency = 'INR' | 'USD'

export interface KpiInfo {
  name: string
  formula: string
  meaning: string
}

export interface KpiCard {
  key: string
  label: string
  unit: Unit
  /** Canonical, always in the base currency. Null when unavailable. */
  value: number | null
  /** Formatted for display, converted if (and only if) the KPI is monetary. */
  display_value: string
  previous_value: number | null
  delta: number | null
  delta_display: string
  delta_sub: string
  difference: number | null
  trend: 'up' | 'down' | null
  available: boolean
  unavailable_reason: string | null
  info: KpiInfo
}

export interface Meta {
  period: string
  period_label: string
  comparison_period: string | null
  currency: Currency
  base_currency: Currency
  exchange_rate: number
  target_roi_pct: number
  row_count: number
  filters_applied: Record<string, unknown>
}

export interface KpiResponse {
  kpis: Record<string, KpiCard>
  meta: Meta
}

export interface Option {
  code: string
  name: string
  type?: string
}

export interface FiltersResponse {
  years: number[]
  year_labels: Record<string, string>
  months: Option[]
  channels: Option[]
  retailers: Option[]
  /** False when the selected channel has no usable retailer values (B2B
   *  carries a blank Retailer on every store) — the control hides. */
  retailer_available: boolean
  regions: string[]
  states: string[]
  cities: string[]
  tiers: string[]
  distributors: string[]
  categories: string[]
  brands: string[]
  products: Option[]
  offers: Option[]
  promotion_types: string[]
  currencies: Currency[]
  selected: Record<string, unknown>
}

export interface TrendResponse {
  granularity: 'week' | 'month'
  labels: string[]
  series: {
    roi: (number | null)[]
    incremental_sales: number[]
    trade_spend: number[]
    target_roi: number[]
  }
  display: { incremental_sales: string[]; trade_spend: string[]; roi: string[] }
  meta: Meta
}

export interface RiskAlert {
  id: string
  severity: 'Critical' | 'High' | 'Medium'
  tone: 'danger' | 'warning' | 'info'
  title: string
  description: string
  roi_pct: number | null
  trade_spend: number
  trade_spend_display: string
  incremental_sales: number
  at_stake: number
  at_stake_display: string
  channel: string
  product: string
  week: string
  promotion_id: string
}

export interface RiskAlertsResponse {
  counts: {
    critical: number
    high: number
    medium: number
    target_achieved: number
    total_events: number
  }
  alerts: RiskAlert[]
  meta: Meta
}

export interface UnderperformingRow {
  promotion: string
  product: string
  channel: string
  period: string
  roi_pct: number
  roi_display: string
  vs_target_pp: number
  trade_spend: number
  trade_spend_display: string
  at_stake: number
  at_stake_display: string
  primary_cause: string
  action: string
  status: string
}

export interface UnderperformingResponse {
  rows: UnderperformingRow[]
  total: number
  meta: Meta
}

export interface MixSlice {
  code: string
  label: string
  type: string
  spend: number
  spend_display: string
  pct: number
  color: string
}

export interface PromotionMixResponse {
  slices: MixSlice[]
  total_spend: number
  total_spend_display: string
  meta: Meta
}

/** One value of a breakdown dimension, with every KPI computed for it by the
 *  frozen engine. Monetary fields are base-currency; `*_display` is converted. */
export interface BreakdownGroup {
  code: string
  label: string
  trade_spend: number
  trade_spend_display: string
  incremental_units: number | null
  incremental_sales: number | null
  incremental_sales_display: string
  roi: number | null
  margin_impact: number | null
  pei: number | null
  cannibalization: number | null
  /** Share of TRADE SPEND only — the one money measure that is additive.
   *  Incremental Sales is not, so it must never be shown as a share. */
  share_pct: number
}

export type BreakdownDimension =
  | 'channel' | 'retailer' | 'product' | 'category' | 'brand'
  | 'promotion' | 'promotion_type' | 'region' | 'state' | 'city'

export type BreakdownMetric = 'incremental_sales' | 'trade_spend' | 'incremental_units' | 'roi'

export interface BreakdownResponse {
  by: BreakdownDimension
  metric: BreakdownMetric
  groups: BreakdownGroup[]
  /** True when more groups exist than were returned — the UI must say so
   *  rather than implying the ranking is the whole population. */
  truncated: boolean
  total_groups: number
  meta: Meta
}
