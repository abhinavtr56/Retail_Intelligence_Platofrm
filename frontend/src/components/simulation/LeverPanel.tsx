import { Icon } from '../../icons'
import { Button, Select } from '../ui'
import { SELECT_OPTIONS } from './simulationEngine'
import type { LeverDef, LeverValues, Scenario, SelectDef, SelectValues } from '../../types/simulation'

// Ported from js/pages/simulation.js's `renderLevers`/`wireLeverInputs`/
// `wireSelectInputs` + css/tpo.css .sim-lever*/.sim-select/.sim-run-hint.
export function LeverPanel({
  leverDefs,
  selectDefs,
  scenario,
  pendingLevers,
  pendingSelects,
  onLeverChange,
  onSelectChange,
  onReset,
  onRun,
  runState,
}: {
  leverDefs: LeverDef[]
  selectDefs: SelectDef[]
  scenario: Scenario
  pendingLevers: LeverValues
  pendingSelects: SelectValues
  onLeverChange: (key: LeverDef['key'], value: number) => void
  onSelectChange: (key: SelectDef['key'], value: string) => void
  onReset: () => void
  onRun: () => void
  runState: 'idle' | 'running' | 'done'
}) {
  const leversDirty = leverDefs.some((l) => Math.abs(pendingLevers[l.key] - scenario.levers[l.key]) > 1e-6)
  const selectsDirty = selectDefs.some((s) => (pendingSelects[s.key] || '') !== (scenario.selects[s.key] || ''))
  const dirty = leversDirty || selectsDirty

  return (
    <div>
      <button onClick={onReset} className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet">
        ↺ Reset to scenario defaults
      </button>

      <div className="flex flex-col gap-3.5">
        {leverDefs.map((l) => {
          const v = pendingLevers[l.key]
          const base = scenario.levers[l.key]
          const changed = Math.abs(v - base) > 1e-6
          const pct = ((v - l.min) / (l.max - l.min)) * 100
          return (
            <div
              key={l.key}
              className={`rounded-[var(--r-md)] border p-2.5 transition-colors ${
                changed ? 'border-[rgba(245,158,11,0.5)] bg-[linear-gradient(180deg,rgba(245,158,11,0.05),rgba(245,158,11,0))]' : 'border-transparent'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-ink-secondary">
                  {l.label}
                  {changed && <span className="ml-0.5 text-[10px] text-status-warning"> ●</span>}
                </label>
                <input
                  type="number"
                  min={l.min}
                  max={l.max}
                  step={l.step}
                  value={v}
                  onChange={(e) => {
                    const nv = parseFloat(e.target.value)
                    if (!isNaN(nv)) onLeverChange(l.key, nv)
                  }}
                  className="w-14 rounded-[6px] border border-border-default p-[2px_6px] text-center text-xs font-bold text-ink-primary [font-variant-numeric:tabular-nums]"
                />
              </div>
              <input
                type="range"
                min={l.min}
                max={l.max}
                step={l.step}
                value={v}
                onChange={(e) => onLeverChange(l.key, parseFloat(e.target.value))}
                className="h-1 w-full cursor-pointer appearance-none rounded outline-none"
                style={{
                  background: `linear-gradient(to right, var(--brand-violet) 0%, var(--brand-violet) ${pct}%, var(--border-subtle) ${pct}%, var(--border-subtle) 100%)`,
                }}
              />
              <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
                <span>{l.min.toFixed(l.decimals)}</span>
                <span>{l.max.toFixed(l.decimals)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {selectDefs.map((s) => {
          const opts = SELECT_OPTIONS[s.key] ?? [scenario.selects[s.key] ?? s.value]
          return (
            <div key={s.key}>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">{s.label}</label>
              <Select value={pendingSelects[s.key] ?? s.value} onChange={(e) => onSelectChange(s.key, e.target.value)}>
                {opts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </div>
          )
        })}
      </div>

      <Button variant="primary" block onClick={onRun} disabled={runState !== 'idle'} className="mt-4">
        {runState === 'running' ? (
          <>Simulating…</>
        ) : runState === 'done' ? (
          <>
            <Icon name="check" /> Simulation Complete
          </>
        ) : (
          <>
            <Icon name="play" /> Run Simulation
          </>
        )}
      </Button>

      {dirty && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] p-[8px_12px] text-xs font-medium text-status-warning [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:shrink-0">
          <Icon name="info" />
          <span className="text-ink-secondary">Lever changes pending — click Run Simulation to recompute.</span>
        </div>
      )}
    </div>
  )
}

export function LeverStatusPill({ dirty }: { dirty: boolean }) {
  return dirty ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-warning-bg px-2.5 py-1 text-[11px] font-semibold text-status-warning [&_svg]:h-[11px] [&_svg]:w-[11px]">
      <Icon name="warning" /> Unsaved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-success-bg px-2.5 py-1 text-[11px] font-semibold text-status-success [&_svg]:h-[11px] [&_svg]:w-[11px]">
      <Icon name="check" /> In sync with scenario
    </span>
  )
}
