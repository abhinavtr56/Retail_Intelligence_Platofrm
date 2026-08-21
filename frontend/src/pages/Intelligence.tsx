import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  Card,
  CardHeader,
  Dropdown,
  LiveStatus,
  Pill,
  Spinner,
  Tabs,
  useLiveStatus,
  useToast,
} from '../components/ui'
import { Icon } from '../icons'
import { ApiError } from '../lib/api'
import {
  useCoreFacts,
  useFactSection,
  useIntelligenceContext,
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
import type { InvestigationContext, Recommendation } from '../types/promotionIntelligence'

const TABS = [
  { key: '0', label: 'Synthesis' },
  { key: '1', label: 'Mechanism' },
  { key: '2', label: 'Drivers' },
  { key: '3', label: 'Where It Bites' },
  { key: '4', label: 'Portfolio' },
  { key: '5', label: 'Exposure' },
  { key: '6', label: 'Recommendations' },
]

// Core drives Synthesis/Mechanism/Drivers/Recommendations; the heavier
// dimension tables and risk load only when their own tab is opened.
const EXTRA_SECTION: (FactSection | null)[] = [null, null, null, 'dimensions', 'dimensions', 'risk', null]

const CHANNEL_NAMES: Record<string, string> = {
  CH001: 'E-commerce',
  CH002: 'Modern Trade',
  CH003: 'General Trade',
  CH004: 'B2B',
  CH005: 'Travel & Hospitality',
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Render the investigation's own filter object as something readable.
 *  Every dimension the scope carries is shown — an omitted one would make the
 *  page look broader than the figures actually are. */
function describeScope(scope: Record<string, unknown>): string {
  const parts: string[] = []
  const list = (v: unknown) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String)
  list(scope.channel).forEach((c) => parts.push(CHANNEL_NAMES[c] ?? c))
  for (const dim of ['region', 'state', 'city', 'retailer', 'category', 'brand', 'promotion_type'] as const) {
    list(scope[dim]).forEach((v) => parts.push(v))
  }
  const month = Number(scope.month)
  if (month >= 1 && month <= 12) parts.push(MONTHS[month])
  if (scope.year) parts.push(`F${String(scope.year).slice(2)}`)
  return parts.length ? parts.join(' · ') : 'whole business'
}

function SectionLoading({ loading }: { loading: boolean }) {
  return (
    <div className="grid min-h-[220px] place-items-center gap-3 text-center text-sm text-ink-muted">
      {loading ? (
        <>
          <Spinner className="h-5 w-5" />
          Computing this breakdown — the KPI engine runs once per group, so the first load takes a moment.
        </>
      ) : (
        'No data for this scope.'
      )}
    </div>
  )
}

/** Shown when no investigation has been run — this page has nothing to deepen. */
function NoInvestigation() {
  return (
    <Card className="fade-in mt-6">
      <div className="grid place-items-center gap-3 p-10 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-violet-50 text-brand-violet">
          <Icon name="sparkles" className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-extrabold">Start with an investigation</h2>
        <p className="max-w-[460px] text-[13px] leading-[1.6] text-ink-muted">
          Promotion Intelligence goes deeper on a root cause an investigation has already found — the mechanism behind it,
          where it bites hardest, and what it's worth. It needs an investigation to build on.
        </p>
        <Link
          to="/investigations"
          className="mt-1 inline-flex items-center gap-2 rounded-[var(--r-md)] bg-brand-violet px-4 py-2 text-[13px] font-semibold text-white"
        >
          <Icon name="search" className="h-4 w-4" /> Run an investigation
        </Link>
      </div>
    </Card>
  )
}

/** The investigation being deepened — scope, root cause, what its agents found. */
function InvestigationHeader({
  ctx,
  available,
  onPick,
}: {
  ctx: InvestigationContext
  available: { run_id: string; question: string; created_at: number }[]
  onPick: (runId: string) => void
}) {
  const when = new Date(ctx.created_at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const others = available.filter((a) => a.run_id !== ctx.run_id)
  return (
    <Card className="fade-in mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle p-[14px_18px]">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Pill tone="violet">Deepening your investigation from {when}</Pill>
            {ctx.investigation_type && <Pill tone="neutral">{ctx.investigation_type}</Pill>}
            <Pill tone="neutral">{describeScope(ctx.scope)}</Pill>
            {ctx.confidence != null && <Pill tone="success">{ctx.confidence}% confidence</Pill>}
          </div>
          <div className="text-[14px] font-bold leading-[1.4]">{ctx.question}</div>
          {ctx.root_cause && (
            <div className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-secondary">
              <span className="font-semibold text-ink-primary">Root cause found: </span>
              {ctx.root_cause}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {others.length > 0 && (
            <Dropdown
              selected={ctx.run_id}
              options={[
                { label: `${ctx.question.slice(0, 60)} (current)`, value: ctx.run_id },
                ...others.map((a) => ({ label: a.question.slice(0, 60), value: a.run_id })),
              ]}
              onSelect={(v) => onPick(v)}
              trigger={
                <Button variant="ghost" size="sm" className="cursor-pointer">
                  Switch investigation <Icon name="chevronDown" />
                </Button>
              }
            />
          )}
          <Link to="/investigations" className="whitespace-nowrap text-[12.5px] font-semibold text-brand-violet">
            ← Back to investigation
          </Link>
        </div>
      </div>
      {ctx.findings.length > 0 && (
        <div className="flex flex-wrap gap-2 p-[12px_18px]">
          {ctx.findings.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-surface-muted px-2.5 py-1 text-[11.5px] text-ink-secondary"
              title={f.headline}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  f.impact === 'negative' || f.impact === 'risk' ? 'bg-status-danger' : 'bg-status-success'
                }`}
              />
              {f.name}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

// Promotion Intelligence is the layer BELOW an investigation, not a second
// Command Center. It inherits the investigation's question and scope and
// explains the mechanism behind the root cause — which is why there is no
// independent filter bar here: re-scoping is what the Command Center is for.
export function Intelligence() {
  const navigate = useNavigate()
  const { show } = useToast()
  const live = useLiveStatus()

  const [tab, setTab] = useState(0)
  const [runId, setRunId] = useState<string | undefined>(undefined)
  // Which investigation to deepen. Undefined = the most recent one, which the
  // header states explicitly rather than leaving the user to guess.
  const [pickedRunId, setPickedRunId] = useState<string | undefined>(undefined)

  const { data: context, isLoading: ctxLoading } = useIntelligenceContext(pickedRunId)
  const investigation = context?.investigation ?? null
  const available = context?.available ?? []

  // Pick up an analysis already run against this investigation, so returning to
  // the page doesn't discard it (or pay for it twice).
  useEffect(() => {
    if (!runId && context?.analysis) setRunId(context.analysis.run_id)
  }, [context, runId])

  // Forward the investigation's scope verbatim. Narrowing it here would show
  // wider figures than the heading claims.
  const scope: IntelligenceScope = investigation?.scope ?? {}

  const { data: facts, isLoading: factsLoading } = useCoreFacts(scope)
  const extraSection = EXTRA_SECTION[tab] ?? null
  const { data: extra, isLoading: extraLoading } = useFactSection(scope, extraSection)

  const startAnalysis = useStartIntelligenceAnalysis()
  const { data: run } = useIntelligenceRun(runId)
  const analysis = run?.status === 'done' ? run.result?.analysis : undefined
  const result = run?.status === 'done' ? run.result : undefined
  const analysing = run?.status === 'running' || startAnalysis.isPending

  const runAnalysis = () => {
    if (!investigation) return
    setRunId(undefined)
    startAnalysis.mutate(
      { investigation_run_id: investigation.run_id },
      {
        onSuccess: (r) => {
          setRunId(r.id)
          show('Going deeper on the investigation…', { duration: 3000 })
        },
        onError: (e) => show(e instanceof ApiError ? e.message : "Couldn't start the analysis.", { duration: 4000 }),
      },
    )
  }

  const openInSimulation = (r: Recommendation) => {
    // Simulation Studio can't take parameters yet — say so rather than
    // pretending the handoff works.
    show(`Simulation Studio doesn't accept parameters yet · ${r.simulation.lever}: ${r.simulation.proposed_value}`, {
      duration: 4000,
    })
    navigate('/simulation')
  }

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Promotion Intelligence' }]

  if (ctxLoading) {
    return (
      <AppShell activeKey="intelligence" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center gap-3 text-sm text-ink-muted">
          <Spinner className="h-5 w-5" />
          Loading…
        </div>
      </AppShell>
    )
  }

  if (!investigation) {
    return (
      <AppShell activeKey="intelligence" crumbs={crumbs}>
        <NoInvestigation />
      </AppShell>
    )
  }

  const k = facts?.kpis
  const roi = k?.promotion_roi
  const belowTarget = roi != null && facts != null && roi < facts.target_roi_pct
  const gapToTarget = roi != null && facts != null ? Math.round((facts.target_roi_pct - roi) * 10) / 10 : null

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
            The mechanism behind the investigation's finding ·{' '}
            <strong className="text-ink-secondary">{describeScope(investigation.scope)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={result ? 'secondary' : 'primary'} onClick={runAnalysis} disabled={analysing}>
            <Icon name={analysing ? 'clock' : 'sparkles'} />{' '}
            {analysing ? 'Analysing…' : result ? 'Re-run analysis' : 'Go deeper'}
          </Button>
          <Button variant="primary" onClick={() => navigate('/simulation')}>
            <Icon name="flow" /> Proceed to Simulation
          </Button>
        </div>
      </div>

      <InvestigationHeader
        ctx={investigation}
        available={available}
        onPick={(id) => {
          setPickedRunId(id)
          setRunId(undefined) // the previous analysis belongs to the other investigation
          setTab(0)
        }}
      />

      {/* Scope KPIs — the investigation's own numbers, not a portfolio dashboard */}
      {facts && k && (
        <div className="mt-3.5 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
          {[
            { label: 'Trade Spend in scope', value: fmtCr(k.trade_spend), sub: describeScope(investigation.scope) },
            { label: 'Incremental Sales', value: fmtCr(k.incremental_sales), sub: 'target is 1.5× spend' },
            {
              label: 'Promotion ROI',
              value: fmtPct(roi),
              sub:
                gapToTarget != null && gapToTarget > 0
                  ? `${gapToTarget} pp below target`
                  : `target ${facts.target_roi_pct}%`,
              danger: belowTarget,
            },
            {
              label: 'Cannibalisation',
              value: fmtPct(k.cannibalization_rate),
              sub: 'share of lift taken from other SKUs',
            },
          ].map((c) => (
            <div key={c.label} className="rounded-[var(--r-lg)] border border-border-subtle bg-surface-card p-[12px_15px]">
              <div className="text-[11px] font-semibold text-ink-muted">{c.label}</div>
              <div
                className={`mt-1 text-xl font-extrabold [font-variant-numeric:tabular-nums] ${c.danger ? 'text-status-danger' : ''}`}
              >
                {c.value}
              </div>
              <div className="mt-0.5 text-[10.5px] leading-[1.4] text-ink-muted">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

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
              <div className="text-[13px] font-semibold">Going deeper on the investigation's finding</div>
              <div className="mt-0.5 flex flex-wrap gap-3 text-[11.5px] text-ink-muted">
                {(run?.specialists ?? []).map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        s.status === 'done'
                          ? 'bg-status-success'
                          : s.status === 'running'
                            ? 'bg-brand-violet'
                            : 'bg-border-strong'
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

      {factsLoading && !facts ? (
        <SectionLoading loading />
      ) : (
        <div key={tab} className="fade-in flex flex-col gap-4">
          {tab === 0 &&
            (analysis ? (
              <>
                <AiAnswerCard
                  question={investigation.question}
                  answer={{
                    confidence: analysis.confidence,
                    sources: 205920,
                    specialists: 2,
                    summary: analysis.headline,
                    text: analysis.narrative,
                  }}
                  streamKey={run?.id ?? 'none'}
                />
                {analysis.key_insights.length > 0 && <KeyInsightsGrid insights={analysis.key_insights} />}
              </>
            ) : (
              <Card className="fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3 p-[18px_20px]">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold">Go deeper on this finding</div>
                    <div className="mt-0.5 max-w-[560px] text-[12.5px] leading-[1.55] text-ink-muted">
                      The investigation found the cause. This layer explains the mechanism behind it, where it bites hardest,
                      and what it's worth — then recommends what to change.
                    </div>
                  </div>
                  <Button variant="primary" onClick={runAnalysis} disabled={analysing}>
                    <Icon name="sparkles" /> Go deeper
                  </Button>
                </div>
              </Card>
            ))}

          {tab === 1 && facts && (
            <>
              <Card className="fade-in">
                <CardHeader
                  title="Discount Saturation — the mechanism"
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
                    Each point is a real mechanic at its effective discount depth; dot size is share of trade spend.{' '}
                    {facts.saturation.saturation_depth_pct !== null ? (
                      <>
                        ROI drops below the {facts.saturation.target_roi_pct}% target from{' '}
                        <strong className="text-status-danger">{facts.saturation.saturation_depth_pct}% depth</strong> onward
                        and does not recover.
                      </>
                    ) : (
                      <>No depth in this scope falls below the {facts.saturation.target_roi_pct}% target.</>
                    )}
                  </p>
                </div>
              </Card>
              <Card className="fade-in">
                <CardHeader
                  title="Incremental Sales vs Target"
                  actions={
                    <Pill tone={facts.trend.months_below_target > 6 ? 'danger' : 'warning'}>
                      {facts.trend.months_below_target} months below
                    </Pill>
                  }
                />
                <div className="p-5 pt-3">
                  <TrendVsTarget trend={facts.trend} />
                </div>
              </Card>
              <DimensionTable title="By Mechanic" rows={facts.by_mechanic} nameHeader="Mechanic" />
            </>
          )}

          {tab === 2 && (
            <Card className="fade-in">
              <CardHeader
                title="Driver Decomposition"
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
                    Run "Go deeper" to break the root cause into weighted components.
                  </div>
                )}
              </div>
            </Card>
          )}

          {tab === 3 &&
            (extra?.by_channel ? (
              <>
                <DimensionTable title="By Channel" rows={extra.by_channel} nameHeader="Channel" />
                <DimensionTable title="By Region" rows={extra.by_region ?? []} nameHeader="Region" />
                <DimensionTable title="By Retailer" rows={extra.by_retailer ?? []} nameHeader="Retailer" />
              </>
            ) : (
              <SectionLoading loading={extraLoading} />
            ))}

          {tab === 4 &&
            (extra?.by_category ? (
              <>
                <DimensionTable title="By Category" rows={extra.by_category} nameHeader="Category" />
                <DimensionTable title="By Brand" rows={extra.by_brand ?? []} nameHeader="Brand" />
                <DimensionTable title="By Product" rows={extra.by_product ?? []} nameHeader="Product" />
              </>
            ) : (
              <SectionLoading loading={extraLoading} />
            ))}

          {tab === 5 && (extra?.risk ? <RiskPanel risk={extra.risk} /> : <SectionLoading loading={extraLoading} />)}

          {tab === 6 &&
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
                    <div className="text-[14px] font-bold">Recommendations need the deeper analysis</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-muted">
                      The Advisor turns the diagnosis into actions Simulation can model.
                    </div>
                  </div>
                  <Button variant="primary" onClick={runAnalysis} disabled={analysing}>
                    <Icon name="sparkles" /> {analysing ? 'Analysing…' : 'Go deeper'}
                  </Button>
                </div>
              </Card>
            ))}
        </div>
      )}
    </AppShell>
  )
}
