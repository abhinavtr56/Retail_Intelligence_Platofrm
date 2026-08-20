/** The Simulation Studio contract — Phase A.
 *
 *  Mirrors backend/app/tpo/simulation.py. Every figure is computed by the
 *  validated KPI engine; the frontend renders what it is given and calculates
 *  nothing. The old `Scenario`/`LeverValues`/`ImpactRow` shapes that carried
 *  the client-side coefficient model are gone with it.
 *
 *  `value` is null — never 0 — for any KPI the selection cannot support, and
 *  `unavailable_reason` says why. Render the reason, not a zero.
 */

/** The one filter contract, mirroring backend FilterState. Identical to the
 *  Command Center's `CommandFilters` by design: the two modules must select
 *  the same rows for the same selection. */
export interface SimulationFilters {
  year: number | null
  month: number | null
  channel: string[]
  retailer: string[]
  region: string[]
  state: string[]
  city: string[]
  tier: string[]
  distributor: string[]
  category: string[]
  brand: string[]
  product: string[]
  promotion: string[]
  promotion_type: string[]
}

/** The levers the backend accepts. Retailer Incentive and Inventory Allocation
 *  are absent because no dataset in the project backs them — the API rejects
 *  them rather than silently ignoring them. */
export interface LeverValues {
  discount_pct?: number | null
  duration_weeks?: number | null
  spend_amount?: number | null
}

export type LeverKey = keyof LeverValues

export interface LeverDefinition {
  key: LeverKey
  label: string
  unit: 'percent' | 'weeks' | 'currency'
  available: boolean
  unavailable_reason: string | null
  value: number | null
  display_value: string | null
  min: number | null
  max: number | null
  step: number
  decimals: number
  /** The measurement this lever's default and range were anchored on. Shown to
   *  the user so a slider position is never an unexplained number. */
  basis: string | null
}

export interface SimulationKpi {
  key: string
  label: string
  unit: string
  value: number | null
  display_value: string
  available: boolean
  unavailable_reason: string | null
  formula: string
}

export type SimulationKpiKey =
  | 'trade_spend'
  | 'incremental_units'
  | 'incremental_sales'
  | 'roi_percent'
  | 'margin_percent'
  | 'cannibalization'
  | 'pei'

export interface SimulationRunRequest {
  filters: Partial<SimulationFilters>
  levers?: LeverValues | null
  scenario_name?: string | null
  currency?: string
}

export interface SimulationRunResponse {
  scenario: {
    name: string
    source: 'measured'
    phase: string
    /** False for the whole of Phase A. The one flag that separates a measured
     *  baseline from a modelled scenario. */
    modelled: boolean
  }
  scope: {
    period: string
    period_label: string
    filters_applied: Record<string, unknown>
    row_count: number
    promoted_row_count: number
    promoted_weeks: number
    median_promotion_weeks: number
    has_data: boolean
  }
  levers: {
    submitted: LeverValues | null
    /** False in Phase A — the levers were recorded, not modelled. */
    applied: boolean
    note: string
    definitions: LeverDefinition[]
  }
  kpis: Record<SimulationKpiKey, SimulationKpi>
  meta: {
    currency: string
    base_currency: string
    exchange_rate: number
    target_roi_pct: number
    phase: string
  }
}
