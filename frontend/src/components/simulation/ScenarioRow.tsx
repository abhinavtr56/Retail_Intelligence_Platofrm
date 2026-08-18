import { Icon } from '../../icons'
import type { Scenario } from '../../types/simulation'

// Ported from js/pages/simulation.js's `renderScenarioRow` + css/tpo.css .sim-sc-*.
export function ScenarioRow({
  scenarios,
  activeKey,
  onSelect,
  onAdd,
}: {
  scenarios: Scenario[]
  activeKey: string
  onSelect: (key: string) => void
  onAdd: () => void
}) {
  return (
    <div className="fade-in mb-4.5 grid grid-cols-[1fr_1fr_1fr_auto] gap-3 max-[1100px]:grid-cols-1">
      {scenarios.map((s) => (
        <div
          key={s.key}
          onClick={() => onSelect(s.key)}
          className={`grid cursor-pointer grid-cols-[14px_1fr_auto] items-center gap-2.5 rounded-[var(--r-lg)] border-[1.5px] bg-surface-card p-[14px_18px] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px ${
            s.key === activeKey ? 'border-brand-violet shadow-[0_0_0_3px_rgba(124,92,255,0.10),var(--shadow-sm)]' : 'border-border-default'
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.dotColor }} />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-ink-primary">{s.name}</div>
            <div className="text-[11px] text-ink-muted">{s.sub}</div>
          </div>
          {s.recommended && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] bg-status-success-bg px-2 py-[3px] text-[10px] font-extrabold tracking-[0.04em] text-status-success">
              <span className="h-[5px] w-[5px] animate-[pulseDot_1.4s_ease-in-out_infinite] rounded-full bg-status-success" /> Recommended
            </span>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--r-lg)] border-[1.5px] border-dashed border-border-strong bg-transparent p-[14px_18px] text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-brand-violet hover:text-brand-violet [&_svg]:h-3.5 [&_svg]:w-3.5"
      >
        <Icon name="plus" /> Add Scenario
      </button>
    </div>
  )
}
