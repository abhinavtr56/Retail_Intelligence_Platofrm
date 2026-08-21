import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  Card,
  CardHeader,
  Dropdown,
  IconButton,
  LiveStatus,
  Pill,
  Spinner,
  Tabs,
  useConfirm,
  useLiveStatus,
  useToast,
} from '../components/ui'
import { Icon } from '../icons'
import { ApiError } from '../lib/api'
import {
  useCoreFacts,
  useFactSection,
  useIntelligenceRun,
  useStartIntelligenceAnalysis,
  type FactSection,
  type IntelligenceScope,
} from '../hooks/usePromotionIntelligence'
import { AiAnswerCard } from '../components/intelligence/AiAnswerCard'
import { SaturationChart } from '../components/promotionIntelligence/SaturationChart'
import {
  DimensionTable,
  DriversPanel,
  KeyInsightsGrid,
  RecommendationsPanel,
  RiskPanel,
  TrendVsTarget,
  fmtCr,
  fmtPct,
} from '../components/promotionIntelligence/panels'
import type { Recommendation } from '../types/promotionIntelligence'

const YEARS = [2025, 2024]
const CHANNELS = [
  { label: 'All channels', value: '' },
  { label: 'Modern Trade', value: 'CH002' },
  { label: 'General Trade', value: 'CH003' },
  { label: 'E-commerce', value: 'CH001' },
  { label: 'B2B', value: 'CH004' },
  { label: 'Travel & Hospitality', value: 'CH005' },
]
const REGIONS = ['All regions', 'North', 'South', 'East', 'West', 'Central']

function SectionLoading({ loading }: { loading: boolean }) {
  return (
    <div className="grid min-h-[220px] place-items-center gap-3 text-sm text-ink-muted">
      {loading ? (
        <>
          <Spinner className="h-5 w-5" />
          Computing this breakdown… the KPI engine runs once per group, so the first load takes a moment.
        </>
      ) : (
        'No data for this scope.'
      )}
    </div>
  )
}

const TABS = [
  { key: '0', label: 'Overview' },
  { key: '1', label: 'Saturation' },
  { key: '2', label: 'Recommendations' },
  { key: '3', label: 'Drivers' },
  { key: '4', label: 'Channels & Regions' },
  { key: '5', label: 'Portfolio' },
  { key: '6', label: 'Risk' },
]

// Rebuilt against the live backend (/api/promotion-intelligence). Charts and
// tables render from the deterministic `facts` endpoint, which is instant and
// unbilled; the narrative, drivers and recommendations come from the Analyst +
// Advisor pair and are only fetched when the user asks for them.
export function Intelligence() {
  const navigate = useNavigate()
  const { show } = useToast()
  const confirm = useConfirm()
  const live = useLiveStatus()

  const [year, setYear] = useState<number>(2025)
  const [channel, setChannel] = useState<string>('')
  const [region, setRegion] = useState<string>('')
  const [tab, setTab] = useState(0)
  const [runId, setRunId] = useState<string | undefined>(undefined)

  const scope: IntelligenceScope = {
    year,
    ...(channel ? { channel } : {}),
    ...(region ? { region } : {}),
  }
  // Core drives Overview + Saturation and always loads. The heavier dimension
  // tables and risk are fetched only when their own tab is opened.
  const EXTRA_SECTION: (FactSection | null)[] = [null, null, null, null, 'dimensions', 'dimensions', 'risk']
  const { data: facts, isLoading, isError, error } = useCoreFacts(scope)
  const extraSection = EXTRA_SECTION[tab] ?? null
  const { data: extra, isLoading: extraLoading } = useFactSection(scope, extraSection)
  const startAnalysis = useStartIntelligenceAnalysis()
  const { data: run } = useIntelligenceRun(runId)
  const analysis = run?.status === 'done' ? run.result?.analysis : undefined
  const result = run?.status === 'done' ? run.result : undefined
  const analysing = run?.status === 'running' || startAnalysis.isPending

  const scopeLabel = [
    CHANNELS.find((c) => c.value === channel)?.label ?? 'All channels',
    region || 'All regions',
    `F${String(year).slice(2)}`,
  ].join(' · ')

  const question = `What is driving promotion performance in ${scopeLabel}, and what should we change?`

  const runAnalysis = () => {
    setRunId(undefined)
    startAnalysis.mutate(
      { question, filters: { year, ...(channel ? { channel: [channel] } : {}), ...(region ? { region: [region] } : {}) } },
      {
        onSuccess: (r) => {
          setRunId(r.id)
          show('Analyst and Advisor are reviewing the portfolio…', { duration: 3000 })
        },
        onError: (e) => show(e instanceof ApiError ? e.message : "Couldn't start the analysis.", { duration: 4000 }),
      },
    )
  }

  const openInSimulation = (r: Recommendation) => {
    // Simulation Studio doesn't accept parameters yet — carry the intent over
    // rather than pretending the handoff is wired.
    show(`Simulation Studio doesn't accept parameters yet · ${r.simulation.lever}: ${r.simulation.proposed_value}`, {
      duration: 4000,
    })
    navigate('/simulation')
  }

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Promotion Intelligence' }]

  if (isLoading) {
    return (
      <AppShell activeKey="intelligence" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5" />
          Loading promotion intelligence…
        </div>
      </AppShell>
    )
  }

  if (isError || !facts) {
    return (
      <AppShell activeKey="intelligence" crumbs={crumbs}>
        <div className="mt-6 rounded-[var(--r-md)] bg-status-danger-bg p-[12px_16px] text-[13px] text-[#B91C1C]">
          Couldn't load the data — {error instanceof ApiError ? error.message : 'is the backend running?'}
        </div>
      </AppShell>
    )
  }

  const k = facts.kpis
  const whole = facts.whole_business_kpis
  const roi = k.promotion_roi
  const belowTarget = roi != null && roi < facts.target_roi_pct

  return (
    <AppShell activeKey="intelligence" crumbs={crumbs}>
      <div className="fade-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em]">
              Promotion Intelligence <Icon name="sparkles" className="h-5 w-5 text-brand-violet" />
            </h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            Causal understanding over the TPO star schema · <strong className="text-ink-secondary">{scopeLabel}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            selected={String(year)}
            options={YEARS.map((y) => ({ label: `F${String(y).slice(2)}`, value: String(y) }))}
            onSelect={(v) => setYear(Number(v))}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                <Icon name="calendar" /> F{String(year).slice(2)} <Icon name="chevronDown" />
              </Button>
            }
          />
          <Dropdown
            selected={channel}
            options={CHANNELS}
            onSelect={(v) => setChannel(v)}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                {CHANNELS.find((c) => c.value === channel)?.label ?? 'All channels'} <Icon name="chevronDown" />
              </Button>
            }
          />
          <Dropdown
            selected={region || 'All regions'}
            options={REGIONS.map((r) => ({ label: r }))}
            onSelect={(v) => setRegion(v === 'All regions' ? '' : v)}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                {region || 'All regions'} <Icon name="chevronDown" />
              </Button>
            }
          />
          <Button variant="primary" onClick={runAnalysis} disabled={analysing}>
            <Icon name={analysing ? 'clock' : 'sparkles'} /> {analysing ? 'Analysing…' : 'Run AI analysis'}
          </Button>
          <Dropdown
            selected=""
            options={[{ label: 'Export report' }, { label: 'Share with team' }, { label: 'Schedule refresh' }]}
            onSelect={(val) =>
              confirm({
                title: val,
                body: 'Not wired up yet — this is a placeholder action.',
                primaryText: 'OK',
                onConfirm: () => show(`${val} — not implemented`),
              })
            }
            trigger={<IconButton icon="more" title="More" />}
          />
        </div>
      </div>

      {/* KPI strip — always available, no model needed */}
      <div className="mt-4 grid grid-cols-5 gap-3 max-[1100px]:grid-cols-3 max-[700px]:grid-cols-2">
        {[
          { label: 'Trade Spend', value: fmtCr(k.trade_spend), sub: `whole business ${fmtCr(whole.trade_spend)}` },
          { label: 'Incremental Sales', value: fmtCr(k.incremental_sales), sub: `target ×1.5 of spend` },
          {
            label: 'Promotion ROI',
            value: fmtPct(roi),
            sub: `target ${facts.target_roi_pct}% · business ${fmtPct(whole.promotion_roi)}`,
            danger: belowTarget,
          },
          { label: 'Margin Impact', value: fmtPct(k.margin_impact), sub: 'vs baseline' },
          { label: 'Cannibalisation', value: fmtPct(k.cannibalization_rate), sub: `business ${fmtPct(whole.cannibalization_rate)}` },
        ].map((c) => (
          <div key={c.label} className="rounded-[var(--r-lg)] border border-border-subtle bg-surface-card p-[12px_15px]">
            <div className="text-[11px] font-semibold text-ink-muted">{c.label}</div>
            <div
              className={`mt-1 text-xl font-extrabold [font-variant-numeric:tabular-nums] ${c.danger ? 'text-status-danger' : 'text-ink-primary'}`}
            >
              {c.value}
            </div>
            <div className="mt-0.5 text-[10.5px] leading-[1.4] text-ink-muted">{c.sub}</div>
          </div>
        ))}
      </div>

      {run?.status === 'error' && (
        <div className="mt-3.5 rounded-[var(--r-md)] bg-status-danger-bg p-[10px_14px] text-[12.5px] text-[#B91C1C]">
          Analysis failed — {run.error}
        </div>
      )}

      {analysing && (
        <Card className="fade-in mt-3.5">
          <div className="flex items-center gap-3 p-[14px_18px]">
            <Spinner className="h-4 w-4 text-brand-violet" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">Running AI analysis over {scopeLabel}</div>
              <div className="mt-0.5 flex flex-wrap gap-3 text-[11.5px] text-ink-muted">
                {(run?.specialists ?? []).map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        s.status === 'done' ? 'bg-status-success' : s.status === 'running' ? 'bg-brand-violet' : 'bg-border-strong'
                      }`}
                    />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-4">
        <Tabs tabs={TABS} active={String(tab)} onChange={(key) => setTab(Number(key))} />
      </div>

      <div key={tab} className="fade-in flex flex-col gap-4">
        {tab === 0 && (
          <>
            {analysis ? (
              <AiAnswerCard
                question={question}
                answer={{
                  confidence: analysis.confidence,
                  sources: 205920,
                  specialists: 2,
                  summary: analysis.headline,
                  text: analysis.narrative,
                }}
                streamKey={run?.id ?? 'none'}
              />
            ) : (
              <Card className="fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3 p-[16px_20px]">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold">No AI analysis for this scope yet</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-muted">
                      Charts and tables below are live already. Run the analysis for a narrative, ranked drivers and recommendations.
                    </div>
                  </div>
                  <Button variant="primary" onClick={runAnalysis} disabled={analysing}>
                    <Icon name="sparkles" /> Run AI analysis
                  </Button>
                </div>
              </Card>
            )}

            {analysis && analysis.key_insights.length > 0 && <KeyInsightsGrid insights={analysis.key_insights} />}

            <Card className="fade-in">
              <CardHeader
                title="Incremental Sales vs Target"
                actions={<Pill tone={facts.trend.months_below_target > 6 ? 'danger' : 'warning'}>{facts.trend.months_below_target} months below</Pill>}
              />
              <div className="p-5 pt-3">
                <TrendVsTarget trend={facts.trend} />
              </div>
            </Card>

            <DimensionTable title="Performance by Mechanic" rows={facts.by_mechanic} nameHeader="Mechanic" />
          </>
        )}

        {tab === 1 && (
          <>
            <Card className="fade-in">
              <CardHeader
                title="Discount Saturation Curve"
                actions={
                  <div className="flex items-center gap-2">
                    {facts.saturation.monotonic_decline && <Pill tone="danger">ROI falls at every step</Pill>}
                    <Pill tone="success">Optimal {facts.saturation.optimal_range}</Pill>
                  </div>
                }
              />
              <div className="p-5 pt-3">
                <SaturationChart curve={facts.saturation} />
                <p className="mt-3 text-[12.5px] leading-[1.6] text-ink-secondary">
                  Each point is a real mechanic, plotted at its effective discount depth. Dot size is share of trade spend.{' '}
                  {facts.saturation.saturation_depth_pct !== null ? (
                    <>
                      ROI drops below the {facts.saturation.target_roi_pct}% target from{' '}
                      <strong className="text-status-danger">{facts.saturation.saturation_depth_pct}% depth</strong> onward and does
                      not recover.
                    </>
                  ) : (
                    <>No depth in this scope falls below the {facts.saturation.target_roi_pct}% target.</>
                  )}
                </p>
              </div>
            </Card>
            <DimensionTable title="Mechanic Detail" rows={facts.by_mechanic} nameHeader="Mechanic" />
          </>
        )}

        {tab === 2 &&
          (result ? (
            <RecommendationsPanel
              recommendations={result.recommendations}
              doNotDo={result.do_not_do}
              combined={result.expected_combined_impact}
              onSimulate={openInSimulation}
            />
          ) : (
            <Card className="fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3 p-[18px_20px]">
                <div>
                  <div className="text-[14px] font-bold">Recommendations need the AI analysis</div>
                  <div className="mt-0.5 text-[12.5px] text-ink-muted">
                    The Advisor turns the diagnosis into actions with simulation parameters.
                  </div>
                </div>
                <Button variant="primary" onClick={runAnalysis} disabled={analysing}>
                  <Icon name="sparkles" /> {analysing ? 'Analysing…' : 'Run AI analysis'}
                </Button>
              </div>
            </Card>
          ))}

        {tab === 3 && (
          <Card className="fade-in">
            <CardHeader
              title="Performance Drivers"
              actions={analysis ? <Pill tone="violet">{analysis.confidence}% confidence</Pill> : undefined}
            />
            <div className="p-5">
              {analysis ? (
                <>
                  <DriversPanel drivers={analysis.drivers} />
                  {analysis.uncertainties.length > 0 && (
                    <div className="mt-4 rounded-[var(--r-md)] bg-surface-muted p-[12px_14px]">
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                        What this analysis cannot determine
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {analysis.uncertainties.map((u, i) => (
                          <li key={i} className="text-[12px] leading-[1.5] text-ink-secondary">
                            · {u}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-[13px] text-ink-muted">
                  Run the AI analysis to rank drivers by contribution.
                </div>
              )}
            </div>
          </Card>
        )}

        {tab === 4 &&
          (extra?.by_channel ? (
            <>
              <DimensionTable title="By Channel" rows={extra.by_channel} nameHeader="Channel" />
              <DimensionTable title="By Region" rows={extra.by_region ?? []} nameHeader="Region" />
              <DimensionTable title="By Retailer" rows={extra.by_retailer ?? []} nameHeader="Retailer" />
            </>
          ) : (
            <SectionLoading loading={extraLoading} />
          ))}

        {tab === 5 &&
          (extra?.by_category ? (
            <>
              <DimensionTable title="By Category" rows={extra.by_category} nameHeader="Category" />
              <DimensionTable title="By Brand" rows={extra.by_brand ?? []} nameHeader="Brand" />
              <DimensionTable title="By Product" rows={extra.by_product ?? []} nameHeader="Product" />
            </>
          ) : (
            <SectionLoading loading={extraLoading} />
          ))}

        {tab === 6 && (extra?.risk ? <RiskPanel risk={extra.risk} /> : <SectionLoading loading={extraLoading} />)}
      </div>
    </AppShell>
  )
}
