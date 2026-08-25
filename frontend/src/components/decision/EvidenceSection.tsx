import { CardBody } from '../ui'
import { InfoPopover } from '../ui/InfoPopover'
import type { DecisionRecord } from '../../types/decision'
import type { StoredDecision } from '../../types/store'

/** Evidence and provenance — where every figure on this page came from.
 *
 *  THIS IS THE TRACEABILITY SURFACE, and it is deliberately a section rather
 *  than a tooltip. A decision a person will cite in a meeting has to be
 *  findable afterwards: the id, the version, the investigation it came out of,
 *  the scenario it describes and the exact dataset it was computed against all
 *  belong on the page, not behind a hover.
 *
 *  IDS THAT DO NOT EXIST YET SAY SO. Before a save there is no decision id and
 *  no version, and this section prints "Not saved" rather than a placeholder
 *  that could be mistaken for a real reference.
 *
 *  STALE IS REPORTED, NEVER RESOLVED. When the stored fingerprint differs from
 *  the dataset this server has loaded, the row says so and the values on the
 *  page stay exactly as they were saved. Nothing is recomputed.
 */
export function EvidenceSection({
  record,
  stored,
}: {
  record: DecisionRecord
  stored: StoredDecision | null
}) {
  const p = record.provenance
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Evidence &amp; Provenance</h3>
        <span className="text-[11px] text-ink-muted">
          {stored ? 'Traceable to the stored record' : 'Not yet saved'}
        </span>
      </div>
      <CardBody>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-x-6 gap-y-3">
          <Row label="Decision ID" value={stored?.decision_id} fallback="Not saved" mono />
          <Row
            label="Version"
            value={stored ? `v${stored.version} of ${stored.current_version}` : null}
            fallback="Not saved"
          />
          <Row
            label="Investigation ID"
            value={stored?.investigation_id ?? record.investigation.investigation_id}
            fallback="Not assigned"
            reason={record.investigation.investigation_id_unavailable_reason}
            mono
          />
          <Row
            label="Scenario ID"
            value={stored?.scenario_id ?? record.scenario.scenario_id}
            fallback="Not assigned"
            mono
          />
          <Row label="Scenario" value={stored?.scenario_name ?? record.scenario.name} />
          <Row label="Saved at" value={stored?.saved_at} fallback="Not saved" />
          <Row
            label="Recommendation policy"
            value={p.recommendation_policy_version ? `v${p.recommendation_policy_version}` : null}
          />
          <Row label="Risk policy" value={p.risk_policy_version ? `v${p.risk_policy_version}` : null} />
          <Row label="KPI engine" value={p.kpi_engine} />
          <Row label="Response rule" value={p.response_rule} />
        </div>

        {/* --- the dataset the numbers were computed against */}
        <div className="mt-4 border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
              Dataset
            </div>
            {stored && (
              <span
                className={`rounded-[4px] px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${
                  stored.stale
                    ? 'bg-status-warning-bg text-status-warning'
                    : 'bg-status-success-bg text-status-success'
                }`}
              >
                {stored.stale ? 'Stale' : 'Current'}
              </span>
            )}
          </div>
          {stored ? (
            <>
              <div className="mt-1 break-all font-mono text-[11px] text-ink-secondary">
                {stored.dataset_version}
              </div>
              {stored.stale && (
                <>
                  <div className="mt-1 break-all font-mono text-[11px] text-ink-muted">
                    current · {stored.current_dataset_version}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-muted">
                    {stored.stale_reason}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="mt-1 text-[12px] leading-[1.5] text-ink-muted">
              A dataset fingerprint is recorded when the decision is saved. This record has not
              been saved, so there is nothing to compare against.
            </div>
          )}
        </div>

        {/* --- what it was assembled from */}
        <div className="mt-4 border-t border-border-subtle pt-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            Assembled from
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.assembled_from.map((source) => (
              <span
                key={source}
                className="rounded-[var(--r-pill)] bg-surface-muted px-2.5 py-1 font-mono text-[10.5px] text-ink-secondary"
              >
                {source}
              </span>
            ))}
          </div>
          <div className="mt-2 text-[11px] leading-[1.5] text-ink-muted">{p.method}</div>
        </div>

        {stored?.owner_note && (
          <div className="mt-3 text-[11px] leading-[1.5] text-ink-muted">{stored.owner_note}</div>
        )}
      </CardBody>
    </>
  )
}

function Row({
  label,
  value,
  fallback = '—',
  reason,
  mono,
}: {
  label: string
  value?: string | number | null
  fallback?: string
  reason?: string | null
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      {value !== null && value !== undefined && value !== '' ? (
        <div
          className={`mt-0.5 break-words text-[12.5px] font-bold text-ink-primary ${
            mono ? 'font-mono text-[11.5px] font-semibold' : ''
          }`}
        >
          {value}
        </div>
      ) : (
        <div className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-ink-muted">
          {fallback}
          {reason && (
            <InfoPopover label={`Why ${label} is unavailable`} title={label} width={288}>
              <div className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">{reason}</div>
            </InfoPopover>
          )}
        </div>
      )}
    </div>
  )
}
