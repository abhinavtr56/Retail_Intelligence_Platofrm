import { Icon } from '../../icons'
import { Spinner } from '../ui'
import type { ScenarioState } from '../../store/simulationScenarios'

/** The scenario selector — stateful containers that report their own state.
 *
 *  A card shows what its scenario IS and whether it has been run. It carries
 *  no KPI, no delta and no "Recommended" or "Best" badge: there is no
 *  recommendation engine in this project, and claiming an improvement before
 *  anything has been compared would be the mock studio all over again.
 *
 *  A simulated card names the treatment it was run at, which is the one thing
 *  that distinguishes two scenarios over the same scope.
 */
export function ScenarioRow({
  scenarios,
  activeId,
  onSelect,
  onAdd,
}: {
  scenarios: ScenarioState[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div className="fade-in grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {scenarios.map((scenario) => {
        const active = scenario.id === activeId
        return (
          <button
            key={scenario.id}
            onClick={() => onSelect(scenario.id)}
            className={`flex flex-col gap-2 rounded-[var(--r-lg)] border-[1.5px] bg-surface-card p-[14px_16px] text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px ${
              active
                ? 'border-brand-violet shadow-[0_0_0_3px_rgba(124,92,255,0.10),var(--shadow-sm)]'
                : 'border-border-default'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-ink-primary">{scenario.name}</div>
                <div className="truncate text-[11px] text-ink-muted">{scenario.sub_label}</div>
              </div>
              <StatusPill scenario={scenario} />
            </div>
            <div className="text-[11px] leading-[1.45] text-ink-muted">{summary(scenario)}</div>
          </button>
        )
      })}

      <button
        onClick={onAdd}
        className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r-lg)] border-[1.5px] border-dashed border-border-strong bg-transparent p-[14px_16px] text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-brand-violet hover:text-brand-violet [&_svg]:h-3.5 [&_svg]:w-3.5"
      >
        <Icon name="plus" /> Add Scenario
      </button>
    </div>
  )
}

function summary(scenario: ScenarioState): string {
  if (scenario.kind === 'measured') return 'Observed from the data in this scope.'
  if (scenario.running) return 'Running against the KPI engine…'
  if (scenario.error) return 'Last run failed. Adjust and try again.'
  if (scenario.simulation) {
    const { uplift, treatment, discount_pct } = scenario.simulation
    return `${treatment} at ${discount_pct}% · approved uplift ${(uplift.low * 100).toFixed(0)}–${(uplift.high * 100).toFixed(0)}%`
  }
  return 'Pick an approved treatment and run it.'
}

function StatusPill({ scenario }: { scenario: ScenarioState }) {
  if (scenario.kind === 'measured') {
    return (
      <Pill tone="success">
        <Icon name="checkCircle" /> Measured
      </Pill>
    )
  }
  if (scenario.running) {
    return (
      <Pill tone="muted">
        <Spinner /> Running
      </Pill>
    )
  }
  if (scenario.error) {
    return <Pill tone="danger">Failed</Pill>
  }
  if (scenario.status === 'simulated') {
    return (
      <Pill tone="success">
        <Icon name="checkCircle" /> Simulated
      </Pill>
    )
  }
  return <Pill tone="muted">Not simulated</Pill>
}

function Pill({ tone, children }: { tone: 'success' | 'muted' | 'danger'; children: React.ReactNode }) {
  const styles = {
    success: 'bg-status-success-bg text-status-success',
    muted: 'bg-surface-muted text-ink-muted',
    danger: 'bg-status-danger-bg text-status-danger',
  }[tone]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-[4px] px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] [&_svg]:h-2.5 [&_svg]:w-2.5 ${styles}`}
    >
      {children}
    </span>
  )
}
