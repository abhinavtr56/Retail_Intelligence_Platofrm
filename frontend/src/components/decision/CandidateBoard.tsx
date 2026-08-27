import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Dropdown,
  InfoBlock,
  InfoPopover,
  Pill,
  Spinner,
  useConfirm,
} from '../ui'
import { ExportReportButton } from '../reports/ExportReportButton'
import { Icon } from '../../icons'
import { useDecisionCandidateStore } from '../../store/decisionCandidates'
import { useGeneralOptimizationStore, type SimulationMode } from '../../store/generalOptimization'
import { bestWorst, explainWinner, rankCandidates } from '../../lib/decisionCandidates'
import type { CandidateSource, DecisionCandidate } from '../../types/decisionCandidate'

/** The candidate board — B-DC2.
 *
 *  WHAT THE DECISION CENTER IS FOR, once more than one scenario exists: not
 *  "here is the scenario you carried", but "here are the strategies we
 *  considered, and here is the case for one of them". The single-record view
 *  below this board is unchanged and still answers the deeper question about
 *  whichever candidate is selected.
 *
 *  IT COMPARES; IT DOES NOT COMPUTE. Every figure in the table is the string
 *  its own engine formatted, carried through the candidate model. The only
 *  thing produced here is the ORDER, and the rule that produced it is printed
 *  above the result.
 */
export function CandidateBoard({
  exportScope,
  exportOptions,
  onApprove,
  canApprove,
  approveHint,
  approving,
  hasRecord,
}: {
  /** The scope a report is generated against, resolved at click time by the
   *  page that owns it. */
  exportScope: () => Record<string, unknown>
  /** The record payloads, when a record exists. The board's own comparison is
   *  merged in below — one export carries both. */
  exportOptions: () => Record<string, unknown>
  /** Record the selected decision through the page's existing save path. */
  onApprove: () => void
  canApprove: boolean
  approveHint: string
  approving: boolean
  /** True when a governed record is on screen below the board. An empty board
   *  can still have one — a decision reopened from history — and that record
   *  must stay exportable. */
  hasRecord: boolean
}) {
  const candidates = useDecisionCandidateStore((s) => s.candidates)
  const selectedId = useDecisionCandidateStore((s) => s.selectedId)
  const select = useDecisionCandidateStore((s) => s.select)
  const remove = useDecisionCandidateStore((s) => s.remove)
  const clearBoard = useDecisionCandidateStore((s) => s.clear)
  const navigate = useNavigate()
  const confirm = useConfirm()
  const setMode = useGeneralOptimizationStore((s) => s.setMode)

  /** Where scenarios come from. Three of the four are MODES of one page, so
   *  going there means setting the mode as well as the route — the studio
   *  remembers the last mode selected, and landing on the wrong one would show
   *  a workspace that cannot produce what was asked for. */
  const goToSource = (value: string) => {
    if (value === 'intelligence') {
      navigate('/intelligence')
      return
    }
    setMode(value as SimulationMode)
    navigate('/simulation')
  }

  const addMenu = (
    <Dropdown
      selected=""
      options={[
        { label: 'Simulation Studio — model a treatment', value: 'investigation' },
        { label: 'General Optimization — allocate a budget', value: 'general' },
        { label: 'Target Rescue — recover a target', value: 'rescue' },
        { label: 'Promotion Intelligence — start from a finding', value: 'intelligence' },
      ]}
      onSelect={goToSource}
      trigger={
        <Button variant="primary" className="cursor-pointer">
          <Icon name="plus" /> Add Scenario
        </Button>
      }
    />
  )

  if (candidates.length === 0) {
    return (
      <EmptyBoard
        addMenu={addMenu}
        exportControl={
          // NOTHING TO EXPORT IS A DISABLED CONTROL WITH A REASON, never a
          // report generated out of an empty board. A record reopened from
          // history still exports on its own.
          <ExportReportButton
            module="decision-center"
            scope={exportScope}
            options={exportOptions}
            label="Export"
            disabled={!hasRecord}
            disabledReason="Add at least one scenario before exporting."
          />
        }
      />
    )
  }

  const ranking = rankCandidates(candidates)
  const winner = candidates.find((c) => c.id === ranking.winnerId) ?? null
  const why = explainWinner(candidates, ranking)
  const metricKeys = Array.from(new Set(candidates.flatMap((c) => c.metrics.map((m) => m.key))))

  /** THE BOARD, AS A REPORT PAYLOAD.
   *
   *  Read at click time and built from what is on screen right now — the same
   *  scenarios, the same display strings, the same ranking. Nothing is
   *  recomputed for the export and nothing stale can reach it, because there is
   *  no cached copy to go stale. Merged with whatever record payloads the page
   *  supplies, so one control exports both halves. */
  const boardOptions = () => ({
    ...exportOptions(),
    comparison_board: {
      metric_labels: metricKeys.map(
        (key) => candidates.flatMap((c) => c.metrics).find((m) => m.key === key)?.label ?? key,
      ),
      scenarios: candidates.map((c) => ({
        name: c.name,
        source: c.sourceLabel,
        scope: c.scopeLabel,
        plan: c.plan.map((f) => `${f.label}: ${f.display}`).join(' · '),
        basis: c.basis,
        metrics: Object.fromEntries(
          c.metrics.map((m) => [
            m.label,
            // The absence travels too: a metric its module could not produce
            // exports as the reason, never as a blank that reads as zero.
            m.available ? m.display : (m.unavailable_reason ?? 'Not produced by this module'),
          ]),
        ),
      })),
      recommendation: winner
        ? {
            name: winner.name,
            source: winner.sourceLabel,
            points: `${ranking.totals.find((t) => t.id === winner.id)?.points ?? 0} of ${
              ranking.criteria.length * (candidates.length - 1)
            }`,
            tie_break: ranking.tieBreak ?? '',
            rule: ranking.rule,
          }
        : { name: '', blocked: ranking.blocked ?? '', rule: ranking.rule },
      why: { strengths: why.strengths, caveats: why.caveats },
    },
  })

  const clearAll = () =>
    confirm({
      title: 'Clear all scenarios?',
      body:
        `This removes all ${candidates.length} scenarios from the comparison board. Each one ` +
        'stays in the module that produced it, and saved decisions are not affected.',
      primaryText: 'Clear',
      secondaryText: 'Cancel',
      icon: 'warning',
      onConfirm: clearBoard,
    })

  return (
    <>
      <Card className="fade-in mt-4">
        <CardHeader
          title={`${candidates.length} Scenario${candidates.length === 1 ? '' : 's'}`}
          subtitle="Added from Simulation Studio, General Optimization, Target Rescue and the measured plan. Removing one here leaves the original untouched in its own module."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {addMenu}
              <Button variant="secondary" onClick={clearAll}>
                <Icon name="x" /> Clear
              </Button>
              {/* ONE export control for this page. It generates into the Report
                  Center — the same flow every other module uses — and carries
                  the board plus the decision record when one exists. */}
              <ExportReportButton
                module="decision-center"
                scope={exportScope}
                options={boardOptions}
                label="Export"
              />
            </div>
          }
        />
        <CardBody>
          <div className="grid grid-cols-3 gap-3 max-[1180px]:grid-cols-2 max-[720px]:grid-cols-1">
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                selected={c.id === selectedId}
                recommended={c.id === ranking.winnerId}
                onSelect={() => select(c.id)}
                onRemove={() => remove(c.id)}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="fade-in mt-[18px]">
        <CardHeader
          title="Scenario Comparison"
          subtitle="Every figure is the one its own module computed. A metric a module does not produce is left blank rather than filled in."
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="sticky left-0 bg-surface-card px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">
                  Metric
                </th>
                {candidates.map((c) => (
                  <th key={c.id} className="min-w-[150px] px-4 py-2.5 text-right text-[11.5px] font-bold text-ink-primary">
                    <div className="truncate" title={c.name}>{c.name}</div>
                    <div className="mt-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
                      {c.sourceLabel}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricKeys.map((key) => {
                const { bestId, worstId } = bestWorst(candidates, key)
                const label = candidates.flatMap((c) => c.metrics).find((m) => m.key === key)?.label ?? key
                const direction = candidates.flatMap((c) => c.metrics).find((m) => m.key === key)?.direction
                return (
                  <tr key={key} className="border-b border-border-subtle last:border-b-0">
                    <td className="sticky left-0 bg-surface-card px-4 py-2.5 text-left text-ink-secondary">
                      {label}
                      {direction && direction !== 'neutral' && (
                        <span className="ml-1.5 text-[10px] text-ink-muted">
                          {direction === 'higher' ? '↑ better' : '↓ better'}
                        </span>
                      )}
                    </td>
                    {candidates.map((c) => {
                      const m = c.metrics.find((x) => x.key === key)
                      if (!m) {
                        return (
                          <td key={c.id} className="px-4 py-2.5 text-right text-ink-muted" title="This module does not produce this metric.">
                            not produced
                          </td>
                        )
                      }
                      if (!m.available) {
                        return (
                          <td key={c.id} className="px-4 py-2.5 text-right text-ink-muted" title={m.unavailable_reason ?? undefined}>
                            unavailable
                          </td>
                        )
                      }
                      const tone =
                        c.id === bestId ? 'text-status-success' : c.id === worstId ? 'text-status-danger' : 'text-ink-primary'
                      return (
                        <td key={c.id} className={`px-4 py-2.5 text-right font-semibold tabular-nums ${tone}`}>
                          {m.display}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {/* NO RISK ROW. The risk engine returns checks and a status, not a
                  score, and a "Risk" column beside ROI and Trade Spend read as a
                  fourth number to trade off. The assessment lives in Simulation
                  Studio's Risk & Governance panel, in full and unchanged. */}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="fade-in mt-[18px]">
        <CardHeader
          title="Recommended scenario"
          subtitle="Ranked on the metrics these scenarios have in common — a deterministic comparison, not a model."
          actions={
            <InfoPopover label="How the ranking works" title="Ranking rule" width={340}>
              <InfoBlock label="Rule">{ranking.rule}</InfoBlock>
              <div className="mt-1.5 text-[10.5px] leading-[1.4] text-ink-muted">
                No model is called and no service ranks these scenarios. This is arithmetic over the
                figures each module already produced, and every point it awards is shown below.
              </div>
            </InfoPopover>
          }
        />
        <CardBody>
          {winner ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="violet">{winner.sourceLabel}</Pill>
                <span className="text-[15px] font-extrabold text-ink-primary">{winner.name}</span>
                <span className="text-[12px] text-ink-muted">
                  {ranking.totals.find((t) => t.id === winner.id)?.points} of{' '}
                  {ranking.criteria.length * (candidates.length - 1)} available points
                </span>
              </div>
              <div className="mt-1 text-[12px] text-ink-muted">{winner.scopeLabel}</div>

              {/* RECORDING THE DECISION is the existing save path, unchanged:
                  it assembles the governed record and stores it server-side,
                  which is what puts a row in Decision History. It is offered
                  only for a scenario that HAS such a record — the optimizer,
                  Target Rescue and the measured plan produce none of the
                  payloads it is built from, and the hint says so instead of
                  the button failing on press. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={onApprove} disabled={!canApprove || approving}>
                  {approving ? <Spinner /> : <Icon name="checkCircle" />}
                  <span>{approving ? 'Recording…' : 'Approve & record decision'}</span>
                </Button>
                {!canApprove && <span className="text-[11.5px] text-ink-muted">{approveHint}</span>}
              </div>
              {ranking.tieBreak && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-surface-muted px-2 py-1 text-[11.5px] text-ink-secondary">
                  <Icon name="info" className="h-3 w-3 text-ink-muted" /> {ranking.tieBreak}
                </div>
              )}

              <div className="mt-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                  Why this plan is recommended
                </div>
                {why.strengths.length > 0 ? (
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {why.strengths.map((line, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px] leading-[1.55] text-ink-secondary">
                        <Icon name="checkCircle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1.5 text-[12.5px] text-ink-muted">
                    It leads on points without beating any single scenario outright on a metric.
                  </div>
                )}
              </div>

              {why.caveats.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                    Where it does not lead
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {why.caveats.map((line, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px] leading-[1.55] text-ink-secondary">
                        <Icon name="alertTriangle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-[12.5px] leading-[1.6] text-ink-secondary">{ranking.blocked}</div>
          )}

          {ranking.criteria.length > 0 && (
            <div className="mt-4 overflow-x-auto border-t border-border-subtle pt-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                Points awarded
              </div>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-border-subtle text-ink-muted">
                    <th className="px-3 py-1.5 text-left font-semibold">Criterion</th>
                    {candidates.map((c) => (
                      <th key={c.id} className="min-w-[110px] px-3 py-1.5 text-right font-semibold">
                        <span className="truncate">{c.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.criteria.map((criterion) => (
                    <tr key={criterion.key} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-3 py-1.5 text-ink-secondary">
                        {criterion.label}{' '}
                        <span className="text-[10px] text-ink-muted">
                          {criterion.direction === 'higher' ? '↑' : '↓'}
                        </span>
                      </td>
                      {candidates.map((c) => (
                        <td key={c.id} className="px-3 py-1.5 text-right tabular-nums text-ink-secondary">
                          {criterion.points[c.id] ?? 0}
                          <span className="ml-1 text-[10.5px] text-ink-muted">{criterion.values[c.id]}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-border-default">
                    <td className="px-3 py-1.5 font-bold text-ink-primary">Total</td>
                    {candidates.map((c) => (
                      <td key={c.id} className="px-3 py-1.5 text-right font-bold tabular-nums text-ink-primary">
                        {ranking.totals.find((t) => t.id === c.id)?.points ?? 0}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  )
}

const SOURCE_TONE: Record<CandidateSource, 'violet' | 'success' | 'warning' | 'neutral'> = {
  measured: 'neutral',
  simulation: 'violet',
  optimization: 'success',
  rescue: 'warning',
}

function CandidateCard({
  candidate,
  selected,
  recommended,
  onSelect,
  onRemove,
}: {
  candidate: DecisionCandidate
  selected: boolean
  recommended: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={`rounded-[var(--r-lg)] border p-[14px_16px] transition-colors ${
        selected ? 'border-brand-violet bg-brand-violet-50/40' : 'border-border-subtle bg-surface-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={SOURCE_TONE[candidate.source]}>{candidate.sourceLabel}</Pill>
          {recommended && <Pill tone="success">Recommended</Pill>}
        </div>
        <button
          onClick={onRemove}
          aria-label={`Remove ${candidate.name} from the Decision Center`}
          title="Remove from the Decision Center — the scenario stays in its own module"
          className="shrink-0 text-ink-muted hover:text-status-danger [&_svg]:h-3.5 [&_svg]:w-3.5"
        >
          <Icon name="x" />
        </button>
      </div>

      <div className="mt-2 text-[13.5px] font-bold text-ink-primary">{candidate.name}</div>
      <div className="mt-0.5 text-[11px] text-ink-muted">{candidate.scopeLabel}</div>

      {candidate.plan.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-dashed border-border-default pt-2">
          {candidate.plan.slice(0, 4).map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="text-ink-muted">{f.label}</span>
              <span className="truncate font-semibold text-ink-secondary" title={f.display}>{f.display}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-muted">{candidate.sourceLabel.toLowerCase()}</span>
        <button
          onClick={onSelect}
          className="text-[12px] font-semibold text-brand-violet disabled:text-ink-muted"
          disabled={selected}
        >
          {selected ? 'Viewing' : 'View'}
        </button>
      </div>
    </div>
  )
}

function EmptyBoard({
  addMenu,
  exportControl,
}: {
  addMenu: React.ReactNode
  exportControl: React.ReactNode
}) {
  return (
    <Card className="fade-in mt-4">
      <div className="grid place-items-center gap-3 p-10 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-violet-50 text-brand-violet">
          <Icon name="target" className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-extrabold">No scenarios selected</h2>
        <p className="max-w-[520px] text-[13px] leading-[1.6] text-ink-muted">
          Add scenarios from Investigation, Optimization, Target Rescue, or Simulation Studio to
          compare them here. Each module keeps its own scenario — this page holds a copy for the
          comparison and nothing more.
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {addMenu}
          {exportControl}
        </div>
      </div>
    </Card>
  )
}
