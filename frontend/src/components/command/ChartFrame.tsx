import type { ReactNode } from 'react'
import { Card, CardHeader, CardBody } from '../ui'
import { Icon } from '../../icons'
import { EmptyState, ErrorState, PanelSkeleton, Stale } from './States'

/** The shell every chart sits in.
 *
 *  It exists so loading, staleness, emptiness and failure are handled once,
 *  identically, for every chart — rather than each chart inventing its own and
 *  drifting. A chart component receives only data it can actually draw; the
 *  frame decides whether there is any.
 *
 *  Order matters: error beats empty beats loading. A failed request must never
 *  be reported as "no data for these filters", which would blame the user's
 *  filter for a backend problem. */
export function ChartFrame({
  title,
  hint,
  actions,
  isLoading,
  isFetching,
  error,
  onRetry,
  isEmpty,
  emptyMessage,
  footnote,
  height = 240,
  children,
}: {
  title: ReactNode
  /** Optional ⓘ explanation of what the chart shows. */
  hint?: string
  actions?: ReactNode
  isLoading: boolean
  isFetching: boolean
  error: unknown
  onRetry: () => void
  isEmpty: boolean
  emptyMessage?: string
  /** Shown under the chart — used for the truncation notice, so a Top-N view
   *  never implies it is the whole population. */
  footnote?: ReactNode
  height?: number
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            {title}
            {hint && (
              <span title={hint} className="cursor-help text-ink-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
                <Icon name="info" />
              </span>
            )}
          </span>
        }
        actions={actions}
      />
      <CardBody>
        {error ? (
          <ErrorState error={error} onRetry={onRetry} retrying={isFetching} compact />
        ) : isLoading ? (
          <PanelSkeleton height={height} />
        ) : isEmpty ? (
          <EmptyState message={emptyMessage} compact />
        ) : (
          <Stale when={isFetching}>{children}</Stale>
        )}
        {!error && !isLoading && !isEmpty && footnote && (
          <p className="mt-2 text-[11px] text-ink-muted">{footnote}</p>
        )}
      </CardBody>
    </Card>
  )
}

/** Top-N selector. 5 / 10 / 15 per the approved plan. */
export function TopNSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
      <span>Top</span>
      <div className="inline-flex overflow-hidden rounded-[var(--r-sm)] border border-border-subtle">
        {[5, 10, 15].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`cursor-pointer px-1.5 py-0.5 font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-violet ${
              value === n ? 'bg-brand-violet text-white' : 'text-ink-muted hover:bg-surface-hover hover:text-ink-primary'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
