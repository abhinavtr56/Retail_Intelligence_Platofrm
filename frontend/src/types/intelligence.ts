import type { WaterfallItem } from '../components/charts'

export interface KeyInsight {
  title: string
  desc: string
  impact: string
  trend: 'up' | 'down'
  icon: string
}

export interface InsightAll {
  title: string
  desc: string
  impact: string
  ic: string
  tone: 'danger' | 'warning' | 'success'
}

export interface Driver {
  driver: string
  weight: number
  direction: 'Negative' | 'Positive'
  note: string
}

export interface Segment {
  name: string
  share: string
  roi: string
  trend: number
  status: 'On Track' | 'Watching' | 'Underperforming'
}

export interface RetailerRow {
  name: string
  region: string
  participation: string
  roiImpact: string
  status: 'Active' | 'Reduced' | 'Dropped'
}

export interface RegionDetail {
  region: string
  plan: number
  actual: number
  variance: number
  mainDriver: string
}

export interface SkuRow {
  sku: string
  category: string
  incSales: string
  roi: string
  flag: string
}

export interface SaturationCurve {
  points: { x: number; y: number }[]
  saturationX: number
  optimalRange: string
}

export interface IncSalesTrend {
  labels: string[]
  actual: number[]
  expected: number[]
  target: number[]
  note: string
}

export interface RegionVariance {
  region: string
  variance: number
}

export interface IntelligencePageData {
  title?: string
  subtitle?: string
  tabs: string[]
  waterfall: WaterfallItem[]
  waterfallNote: string
  keyInsights: KeyInsight[]
  saturationCurve: SaturationCurve
  incSalesTrend: IncSalesTrend
  regionVariance: RegionVariance[]
  regionNote: string
  drivers: Driver[]
  segments: Segment[]
  retailers: RetailerRow[]
  regionsDetail: RegionDetail[]
  skuLevel: SkuRow[]
  insightsAll: InsightAll[]
}

export interface IntelligenceAnswer {
  // B9 removed `confidence`. The synthesis carried an authored 82-87%; no
  // engine in this project produces a confidence figure.
  sources: number
  specialists: number
  summary: string
  text: string
}
