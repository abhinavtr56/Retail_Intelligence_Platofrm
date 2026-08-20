import { Icon } from '../../icons'
import { Button } from '../ui'
import type { LeverDefinition, LeverKey, LeverValues } from '../../types/simulation'

/** The TPO levers.
 *
 *  Every definition — label, range, default, step — arrives from the backend
 *  anchored on a MEASUREMENT of the selected scope, and each one states the
 *  measurement it came from in `basis`. Nothing about a lever is decided here.
 *
 *  Two levers the old panel offered are gone: Retailer Incentive (no dataset
 *  splits retailer support out of Promotion_Cost) and Inventory Allocation
 *  (the project holds no inventory data at all). A control with nothing behind
 *  it is not shown, and the API rejects both keys rather than accepting them
 *  into a void.
 */
export function LeverPanel({
  definitions,
  values,
  note,
  onChange,
  onReset,
  onRun,
  running,
  dirty,
}: {
  definitions: LeverDefinition[]
  values: LeverValues
  note: string
  onChange: (key: LeverKey, value: number) => void
  onReset: () => void
  onRun: () => void
  running: boolean
  dirty: boolean
}) {
  return (
    <div>
      <button
        onClick={onReset}
        disabled={!dirty}
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet disabled:cursor-not-allowed disabled:text-ink-muted"
      >
        ↺ Reset to measured values
      </button>

      <div className="flex flex-col gap-3.5">
        {definitions.map((lever) => (
          <LeverControl key={lever.key} lever={lever} value={values[lever.key] ?? null} onChange={onChange} />
        ))}
      </div>

      <Button variant="primary" block onClick={onRun} disabled={running} className="mt-4">
        {running ? <>Calculating…</> : <><Icon name="play" /> Run Simulation</>}
      </Button>

      {/* The honest status. Stated by the backend, rendered verbatim — the
          frontend does not get to soften or reword what the API says about
          its own limits. */}
      <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] p-[8px_12px] text-xs [&_svg]:mt-px [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:shrink-0 [&_svg]:text-status-warning">
        <Icon name="info" />
        <span className="text-ink-secondary">{note}</span>
      </div>
    </div>
  )
}

function LeverControl({
  lever,
  value,
  onChange,
}: {
  lever: LeverDefinition
  value: number | null
  onChange: (key: LeverKey, value: number) => void
}) {
  if (!lever.available || lever.min === null || lever.max === null) {
    return (
      <div className="rounded-[var(--r-md)] border border-border-subtle bg-surface-muted p-2.5">
        <div className="text-xs font-semibold text-ink-secondary">{lever.label}</div>
        <div className="mt-1 text-[11px] leading-[1.5] text-ink-muted">{lever.unavailable_reason}</div>
      </div>
    )
  }

  const current = value ?? lever.value ?? lever.min
  const changed = lever.value !== null && Math.abs(current - lever.value) > 1e-6
  const span = lever.max - lever.min
  const pct = span > 0 ? ((current - lever.min) / span) * 100 : 0

  return (
    <div
      className={`rounded-[var(--r-md)] border p-2.5 transition-colors ${
        changed
          ? 'border-[rgba(245,158,11,0.5)] bg-[linear-gradient(180deg,rgba(245,158,11,0.05),rgba(245,158,11,0))]'
          : 'border-transparent'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-ink-secondary">
          {lever.label}
          {changed && <span className="ml-0.5 text-[10px] text-status-warning"> ●</span>}
        </label>
        <input
          type="number"
          min={lever.min}
          max={lever.max}
          step={lever.step}
          value={current}
          onChange={(e) => {
            const next = parseFloat(e.target.value)
            if (!isNaN(next)) onChange(lever.key, next)
          }}
          className="w-24 rounded-[6px] border border-border-default p-[2px_6px] text-center text-xs font-bold text-ink-primary [font-variant-numeric:tabular-nums]"
        />
      </div>
      <input
        type="range"
        min={lever.min}
        max={lever.max}
        step={lever.step}
        value={current}
        onChange={(e) => onChange(lever.key, parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded outline-none"
        style={{
          background: `linear-gradient(to right, var(--brand-violet) 0%, var(--brand-violet) ${pct}%, var(--border-subtle) ${pct}%, var(--border-subtle) 100%)`,
        }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
        <span>{format(lever.min, lever)}</span>
        <span>{format(lever.max, lever)}</span>
      </div>
      {lever.basis && <div className="mt-1.5 text-[10.5px] leading-[1.45] text-ink-muted">{lever.basis}</div>}
    </div>
  )
}

/** Slider endpoints only. Currency arrives in base units and would render as
 *  76574223, so the two ends are abbreviated; the backend's `display_value`
 *  covers the anchor itself. */
function format(value: number, lever: LeverDefinition): string {
  if (lever.unit !== 'currency') return value.toFixed(lever.decimals)
  if (Math.abs(value) >= 1e7) return `${(value / 1e7).toFixed(1)} Cr`
  if (Math.abs(value) >= 1e5) return `${(value / 1e5).toFixed(1)} L`
  return value.toFixed(0)
}
