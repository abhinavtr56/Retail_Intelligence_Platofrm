import { useState } from 'react'
import { Card, CardHeader, CardBody, Button, IconButton, Input, Pill, Table, Th, Td, Tr } from '../ui'
import { Icon, type IconName } from '../../icons'
import { Waterfall } from '../charts'
import { SaturationChart } from './SaturationChart'
import { SalesTrendChart } from './SalesTrendChart'
import { RegionVarianceBars } from './RegionVarianceBars'
import { KeyInsightsList, type NormalizedInsight } from './KeyInsightsList'
import type { IntelligencePageData } from '../../types/intelligence'

const WF_LEGEND = [
  { label: 'Positive', color: '#10B981' },
  { label: 'Negative', color: '#EF4444' },
  { label: 'Total', color: '#1F2937' },
  { label: 'Base', color: '#94A3B8' },
]

function WaterfallLegend() {
  return (
    <div className="mb-2 flex flex-wrap gap-4">
      {WF_LEGEND.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="h-3 w-3 rounded-sm" style={{ background: l.color }} />
          {l.label}
        </span>
      ))}
    </div>
  )
}

function AiCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-[var(--r-md)] border border-[rgba(124,92,255,0.2)] bg-[linear-gradient(135deg,rgba(124,92,255,0.06),rgba(79,124,255,0.04))] p-[10px_14px] text-[12.5px] leading-[1.5] text-ink-secondary [&_svg]:mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 [&_svg]:text-brand-violet">
      {children}
    </div>
  )
}

// ============== TAB 0: OVERVIEW ==============
export function OverviewTab({ D, onGoTab }: { D: IntelligencePageData; onGoTab: (idx: number) => void }) {
  const insights: NormalizedInsight[] = D.keyInsights.map((k, i) => ({
    key: `${k.title}-${i}`,
    title: k.title,
    desc: k.desc,
    impact: k.impact,
    icon: k.icon as IconName,
    tone: k.impact.startsWith('High') ? 'danger' : 'warning',
    trend: k.trend,
  }))

  return (
    <>
      <div className="grid grid-cols-[2fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Promotion Contribution Analysis <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </span>
            }
            subtitle="Impact on Incremental Sales (₹ Cr)"
            actions={
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm">
                  Waterfall View <Icon name="chevronDown" />
                </Button>
                <IconButton icon="more" />
              </div>
            }
          />
          <CardBody>
            <WaterfallLegend />
            <Waterfall items={D.waterfall} height={340} />
            <AiCallout>
              <Icon name="sparkles" />
              <span>{D.waterfallNote}</span>
            </AiCallout>
          </CardBody>
        </Card>

        <Card className="fade-in">
          <CardHeader title={<span className="flex items-center gap-1.5">Key Insights <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" /></span>} />
          <div className="px-4.5 py-1.5">
            <KeyInsightsList items={insights} />
          </div>
          <div className="border-t border-border-subtle px-5 py-3">
            <button onClick={() => onGoTab(7)} className="text-[13px] font-semibold text-brand-violet">
              View All Insights →
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1.2fr_1.2fr] gap-4 max-[1280px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader title={<span className="flex items-center gap-1.5">Discount Saturation Curve <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" /></span>} />
          <CardBody>
            <SaturationChart data={D.saturationCurve} />
            <AiCallout>
              <Icon name="sparkles" />
              <span>
                <strong>Optimal discount range:</strong> {D.saturationCurve.optimalRange}
              </span>
            </AiCallout>
          </CardBody>
        </Card>
        <Card className="fade-in">
          <CardHeader
            title={<span className="flex items-center gap-1.5">Incremental Sales Trend <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" /></span>}
            actions={
              <Button variant="ghost" size="sm">
                Weekly <Icon name="chevronDown" />
              </Button>
            }
          />
          <CardBody>
            <SalesTrendChart data={D.incSalesTrend} />
            <AiCallout>
              <Icon name="sparkles" />
              <span>{D.incSalesTrend.note}</span>
            </AiCallout>
          </CardBody>
        </Card>
        <Card className="fade-in">
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Impact by Region <span className="text-xs text-ink-muted">(vs Plan)</span> <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </span>
            }
            actions={
              <Button variant="ghost" size="sm">
                % Variance <Icon name="chevronDown" />
              </Button>
            }
          />
          <CardBody>
            <RegionVarianceBars data={D.regionVariance} />
            <AiCallout>
              <Icon name="sparkles" />
              <span>{D.regionNote}</span>
            </AiCallout>
          </CardBody>
        </Card>
      </div>
    </>
  )
}

// ============== TAB 1: CONTRIBUTION ==============
export function ContributionTab({ D }: { D: IntelligencePageData }) {
  return (
    <Card className="fade-in">
      <CardHeader title="Detailed Contribution Analysis" subtitle="Full waterfall breakdown of all positive and negative contributors" />
      <CardBody>
        <WaterfallLegend />
        <Waterfall items={D.waterfall} height={400} />
        <AiCallout>
          <Icon name="sparkles" />
          <span>{D.waterfallNote}</span>
        </AiCallout>
      </CardBody>
    </Card>
  )
}

// ============== TAB 2: DRIVERS ==============
export function DriversTab({ D }: { D: IntelligencePageData }) {
  return (
    <Card className="fade-in">
      <CardHeader title="Top Drivers of Variance" subtitle="Ranked by % contribution to gap vs plan" />
      <CardBody>
        <div className="flex flex-col gap-3.5">
          {D.drivers.map((d, i) => (
            <div key={d.driver} className="grid grid-cols-[28px_1fr_130px] items-center gap-3.5 border-b border-dashed border-border-subtle py-3.5 last:border-b-0">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-violet-50 text-sm font-extrabold text-brand-violet">{i + 1}</div>
              <div>
                <div className="text-sm font-bold text-ink-primary">{d.driver}</div>
                <div className="mt-px text-xs text-ink-muted">{d.note}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-surface-muted">
                  <div
                    className={`h-full rounded-[3px] transition-[width] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      d.direction === 'Negative' ? 'bg-[linear-gradient(90deg,#F87171,#EF4444)]' : 'bg-[linear-gradient(90deg,#34D399,#10B981)]'
                    }`}
                    style={{ width: `${d.weight * 3}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-right">
                <span className="text-base font-extrabold text-ink-primary [font-variant-numeric:tabular-nums]">{d.weight}%</span>
                <Pill tone={d.direction === 'Negative' ? 'danger' : 'success'}>{d.direction}</Pill>
              </div>
            </div>
          ))}
        </div>
        <AiCallout>
          <Icon name="sparkles" />
          <span>Discount Depth and Retailer Participation together explain 52% of the variance — addressing these first will recover the most ground.</span>
        </AiCallout>
      </CardBody>
    </Card>
  )
}

// ============== TAB 3: SEGMENTS ==============
export function SegmentsTab({ D }: { D: IntelligencePageData }) {
  return (
    <Card className="fade-in">
      <CardHeader title="Category / Segment Performance" />
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Segment</Th>
              <Th>Spend Share</Th>
              <Th>ROI</Th>
              <Th>Trend vs Q1</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {D.segments.map((s) => (
              <Tr key={s.name} className="cursor-default hover:bg-transparent">
                <Td emphasis>{s.name}</Td>
                <Td>{s.share}</Td>
                <Td className="font-bold">{s.roi}</Td>
                <Td className={`font-bold ${s.trend < 0 ? 'text-status-danger' : 'text-status-success'}`}>
                  {s.trend < 0 ? '▼' : '▲'} {Math.abs(s.trend).toFixed(2)}
                </Td>
                <Td>
                  <Pill tone={s.status === 'On Track' ? 'success' : s.status === 'Watching' ? 'warning' : 'danger'} dot>
                    {s.status}
                  </Pill>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  )
}

// ============== TAB 4: RETAILERS ==============
export function RetailersTab({ D }: { D: IntelligencePageData }) {
  const [q, setQ] = useState('')
  const rows = D.retailers.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <Card className="fade-in">
      <CardHeader
        title="Retailer-Level Performance"
        actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search retailers..." className="max-w-[240px]" />}
      />
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Retailer</Th>
              <Th>Region</Th>
              <Th>Participation</Th>
              <Th>ROI Impact</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.name} className="cursor-default hover:bg-transparent">
                <Td emphasis>{r.name}</Td>
                <Td>{r.region}</Td>
                <Td>{r.participation}</Td>
                <Td className={`font-bold ${r.roiImpact.startsWith('-') ? 'text-status-danger' : 'text-status-success'}`}>{r.roiImpact}</Td>
                <Td>
                  <Pill tone={r.status === 'Active' ? 'success' : r.status === 'Reduced' ? 'warning' : 'danger'} dot>
                    {r.status}
                  </Pill>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="m-3.5">
        <AiCallout>
          <Icon name="sparkles" />
          <span>
            6 retailers (More Megastore, Spencer's, Spar Hypermarket, Easyday, Heritage Fresh, Shoprite) discontinued the promo by Week 4
            across 3 regions. Re-engaging them would recover an estimated ₹3.8 Cr.
          </span>
        </AiCallout>
      </div>
    </Card>
  )
}

// ============== TAB 5: REGIONS ==============
export function RegionsTab({ D }: { D: IntelligencePageData }) {
  return (
    <Card className="fade-in">
      <CardHeader title="Region-Level Performance" />
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>Region</Th>
              <Th>Plan (₹ Cr)</Th>
              <Th>Actual (₹ Cr)</Th>
              <Th>Variance</Th>
              <Th>Main Driver</Th>
            </tr>
          </thead>
          <tbody>
            {D.regionsDetail.map((r) => (
              <Tr key={r.region} className="cursor-default hover:bg-transparent">
                <Td emphasis>{r.region}</Td>
                <Td>{r.plan.toFixed(1)}</Td>
                <Td className="font-bold">{r.actual.toFixed(1)}</Td>
                <Td className={`font-bold ${r.variance < 0 ? 'text-status-danger' : 'text-status-success'}`}>
                  {r.variance > 0 ? '+' : ''}
                  {r.variance.toFixed(1)}%
                </Td>
                <Td>{r.mainDriver}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="m-3.5">
        <AiCallout>
          <Icon name="sparkles" />
          <span>{D.regionNote}</span>
        </AiCallout>
      </div>
    </Card>
  )
}

// ============== TAB 6: SKU LEVEL ==============
export function SkuLevelTab({ D }: { D: IntelligencePageData }) {
  const flagTone = (flag: string) =>
    flag === 'Top performer' ? 'success' : flag === 'On Track' ? 'info' : flag === 'Cannibalized' ? 'danger' : 'warning'

  return (
    <Card className="fade-in">
      <CardHeader title="SKU-Level Performance" actions={<Button variant="secondary" size="sm" disabled title="SKU export is not yet available"><Icon name="download" /> Export — not yet available</Button>} />
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Category</Th>
              <Th>Incremental Sales</Th>
              <Th>ROI</Th>
              <Th>Flag</Th>
            </tr>
          </thead>
          <tbody>
            {D.skuLevel.map((s) => (
              <Tr key={s.sku} className="cursor-default hover:bg-transparent">
                <Td emphasis>{s.sku}</Td>
                <Td>{s.category}</Td>
                <Td className="font-bold">{s.incSales}</Td>
                <Td>{s.roi}</Td>
                <Td>
                  <Pill tone={flagTone(s.flag)} dot>
                    {s.flag}
                  </Pill>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  )
}

// ============== TAB 7: ALL INSIGHTS ==============
export function InsightsTab({ D }: { D: IntelligencePageData }) {
  const items: NormalizedInsight[] = D.insightsAll.map((k, i) => ({
    key: `${k.title}-${i}`,
    title: k.title,
    desc: k.desc,
    impact: k.impact,
    icon: k.ic as IconName,
    tone: k.tone,
  }))

  return (
    <Card className="fade-in">
      <CardHeader title={`All Insights (${D.insightsAll.length})`} actions={<span className="text-sm text-ink-muted">Ranked by impact</span>} />
      <div className="px-4.5 py-1.5">
        <KeyInsightsList items={items} />
      </div>
    </Card>
  )
}
