import { useMemo, useState } from 'react'
import { Pill } from '../ui'
import { Icon, type IconName } from '../../icons'
import { SEVERITIES, rankByImpact, type Severity } from './riskRanking'
import type { RiskAlert, RiskAlertsResponse } from '../../types/commandCenter'

/** Top Risk Alerts, segmented by severity.
 *
 *  Severity picks the segment; financial impact orders it. Within the selected
 *  band the five events with the most money At Stake are shown, with the weaker
 *  ROI breaking ties.
 *
 *  The full alert set for the scope is still fetched rather than a truncated
 *  page: the API emits one concatenated Critical -> High -> Medium list and
 *  truncates the tail, so the top of the High band sits behind every Critical
 *  and cannot be reached by a small `limit`. Nothing is recomputed here — every
 *  ROI, stake and severity is the value the backend produced.
 */

const SEVERITY_ICON: Record<Severity, IconName> = {
  Critical: 'warning',
  High: 'alertTriangle',
  Medium: 'trendingDown',
}

const TONE_BG: Record<RiskAlert['tone'], string> = {
  danger: 'var(--status-danger-bg)',
  warning: 'var(--status-warning-bg)',
  info: 'var(--status-info-bg)',
}
const TONE_FG: Record<RiskAlert['tone'], string> = {
  danger: 'var(--status-danger)',
  warning: 'var(--status-warning)',
  info: 'var(--status-info)',
}

/** "ROI below target — Diwali Special 25" -> "Diwali Special 25". The API
 *  builds the title from the promotion name; this recovers it rather than
 *  repeating the string. */
function promotionOf(alert: RiskAlert): string {
  const dash = alert.title.indexOf('—')
  return dash === -1 ? alert.title : alert.title.slice(dash + 1).trim()
}

const PER_SEGMENT = 5

export function RiskAlertsPanel({
  data,
  onSelect,
}: {
  data: RiskAlertsResponse
  onSelect?: (alert: RiskAlert) => void
}) {
  const [severity, setSeverity] = useState<Severity>('Critical')

  const counts: Record<Severity, number> = {
    Critical: data.counts.critical,
    High: data.counts.high,
    Medium: data.counts.medium,
  }

  // Default to the most severe band that actually has alerts, so the panel
  // never opens on an empty segment when e.g. nothing is Critical.
  const active = counts[severity] > 0 ? severity : (SEVERITIES.find((s) => counts[s] > 0) ?? severity)

  const rows = useMemo(
    () => data.alerts.filter((a) => a.severity === active).sort(rankByImpact).slice(0, PER_SEGMENT),
    [data.alerts, active],
  )

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-1 border-b border-border-subtle px-5 py-2.5"
        role="tablist"
        aria-label="Alert severity"
      >
        {SEVERITIES.map((s) => {
          const on = s === active
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={counts[s] === 0}
              onClick={() => setSeverity(s)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--r-md)] px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet disabled:cursor-not-allowed disabled:opacity-40 ${
                on
                  ? 'bg-brand-violet text-white'
                  : 'text-ink-muted hover:bg-surface-hover hover:text-ink-primary'
              }`}
            >
              {s}
              <span className={on ? 'text-white/75' : 'text-ink-disabled'}>{counts[s]}</span>
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <div className="grid min-h-[120px] place-items-center px-4 text-center text-xs text-ink-muted">
          No {active.toLowerCase()} alerts in this selection.
        </div>
      ) : (
        <div className="flex flex-col px-5">
          {rows.map((a, i) => {
            const roi = a.roi_pct ?? 0
            return (
              <div
                key={a.id}
                onClick={() => onSelect?.(a)}
                className="fade-in-up grid cursor-pointer grid-cols-[36px_1fr_auto] items-center gap-2.5 rounded-lg border-b border-border-subtle py-3 transition-colors duration-150 last:border-b-0 hover:bg-surface-hover"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div
                  className="grid h-9 w-9 place-items-center rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
                  style={{ background: TONE_BG[a.tone], color: TONE_FG[a.tone] }}
                >
                  <Icon name={SEVERITY_ICON[a.severity]} />
                </div>

                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-ink-primary">{promotionOf(a)}</div>
                  <div className="mt-0.5 truncate text-[11.5px] text-ink-muted">
                    {a.product} · {a.channel} · {a.week}
                  </div>
                  <div className="mt-1 flex items-center gap-2.5 text-[11px] tabular-nums">
                    <span className={roi < 0 ? 'font-bold text-status-danger' : 'font-bold text-ink-primary'}>
                      ROI {roi.toFixed(1)}%
                    </span>
                    <span className="truncate text-ink-muted">{a.at_stake_display} at stake</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Pill tone={a.tone}>{a.severity}</Pill>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-brand-violet [&_svg]:h-3 [&_svg]:w-3">
                    Ask why
                    <Icon name="arrowRight" />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
