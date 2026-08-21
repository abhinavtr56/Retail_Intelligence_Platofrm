/** A compact enterprise slider.
 *
 *  A native `<input type="range">` wearing the platform's accent, rather than a
 *  hand-built track: it is keyboard-operable, screen-reader-labelled and
 *  touch-correct for free, and none of that is worth re-implementing for a
 *  visual difference nobody asked for.
 *
 *  The endpoints are always rendered. A slider whose range is not on screen
 *  invites the user to read the handle's position as a value rather than as a
 *  proportion, and both ends here are measured figures worth showing.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  minLabel,
  maxLabel,
  valueLabel,
  disabled = false,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  minLabel: string
  maxLabel: string
  /** The current value, already formatted. Shown beside the label so the
   *  number the user is choosing is never inferred from a handle position. */
  valueLabel: string
  disabled?: boolean
  hint?: string
  onChange: (value: number) => void
}) {
  // A zero-width range would put the handle in an undefined position; the
  // control is disabled instead, which is what a scope with no headroom is.
  const inert = disabled || max <= min

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
          {label}
        </label>
        <span className={`text-[13px] font-bold tabular-nums ${inert ? 'text-ink-muted' : 'text-ink-primary'}`}>
          {valueLabel}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <span className="shrink-0 text-[10.5px] tabular-nums text-ink-muted">{minLabel}</span>
        <input
          type="range"
          min={min}
          max={inert ? min + 1 : max}
          step={step}
          value={value}
          disabled={inert}
          aria-label={label}
          aria-valuetext={valueLabel}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border-default accent-brand-violet disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet focus-visible:ring-offset-2"
        />
        <span className="shrink-0 text-[10.5px] tabular-nums text-ink-muted">{maxLabel}</span>
      </div>

      {hint && <div className="mt-1.5 text-[11px] leading-[1.45] text-ink-muted">{hint}</div>}
    </div>
  )
}
