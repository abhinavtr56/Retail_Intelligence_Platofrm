import { Button, CardBody, Spinner } from '../ui'
import { Icon } from '../../icons'
import { useStoredDecisions } from '../../hooks/useStore'
import type { StoredDecisionSummary } from '../../types/store'

/** Every decision this server has stored — B10's list, finally connected.
 *
 *  REAL ROWS OR NO ROWS. Each line below is one row of `GET /api/store/decisions`,
 *  which reads the `decisions` table and joins its current version. Nothing is
 *  authored: an empty store renders the empty state, not a sample.
 *
 *  HEADERS ONLY. The list endpoint deliberately returns no record payloads, so
 *  opening one is a second request by id. That is what keeps this cheap when the
 *  store holds hundreds and what guarantees the record shown is read back from
 *  the store rather than reconstructed from a summary.
 *
 *  FRESHNESS IS PER ROW. Every row carries the dataset fingerprint its version
 *  was computed against, compared server-side with the dataset this process has
 *  loaded. A stale row is a historical record and says so; it is never
 *  recomputed to make the list look uniform.
 *
 *  NO OWNER COLUMN. This application has no authentication, so every row's owner
 *  is null and inventing a "Created by" column would fabricate attribution.
 */
export function DecisionHistory({
  currentDecisionId,
  onOpen,
}: {
  currentDecisionId: string | null
  onOpen: (decisionId: string) => void
}) {
  const history = useStoredDecisions()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
        <h3 className="text-[15px] font-bold">Decision History</h3>
        <span className="text-[11px] text-ink-muted">
          {history.data ? `${history.data.decisions.length} stored` : 'Every decision saved here'}
        </span>
      </div>
      <CardBody>
        {history.isPending ? (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
            <Spinner /> <span>Reading the store…</span>
          </div>
        ) : history.isError ? (
          <div className="text-[12.5px] leading-[1.6] text-ink-secondary">
            Could not read the decision store — {history.error.message}. Nothing on this page has
            changed.
          </div>
        ) : !history.data || history.data.decisions.length === 0 ? (
          <div className="text-[12.5px] leading-[1.6] text-ink-muted">
            No decision has been saved yet. Saving one stores it here, with the dataset it was
            computed against, and it stays retrievable after a reload.
          </div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <Th>Decision ID</Th>
                    <Th>Scenario</Th>
                    <Th>Version</Th>
                    <Th>Saved</Th>
                    <Th>Status</Th>
                    <Th>Data</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {history.data.decisions.map((row) => (
                    <HistoryRow
                      key={row.decision_id}
                      row={row}
                      isCurrent={row.decision_id === currentDecisionId}
                      onOpen={() => onOpen(row.decision_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 border-t border-border-subtle pt-2.5 text-[11px] leading-[1.5] text-ink-muted">
              {history.data.owner_note}
            </div>
          </>
        )}
      </CardBody>
    </>
  )
}

function HistoryRow({
  row,
  isCurrent,
  onOpen,
}: {
  row: StoredDecisionSummary
  isCurrent: boolean
  onOpen: () => void
}) {
  return (
    <tr className="border-b border-border-subtle last:border-b-0">
      <td className="py-2.5 pr-3 align-middle">
        <span className="font-mono text-[11.5px] font-semibold text-ink-primary">
          {row.decision_id}
        </span>
      </td>
      <td className="py-2.5 pr-3 align-middle text-[12.5px] text-ink-secondary">
        {row.scenario_name ?? '—'}
      </td>
      <td className="py-2.5 pr-3 align-middle text-[12.5px] text-ink-secondary [font-variant-numeric:tabular-nums]">
        v{row.version}
      </td>
      <td className="py-2.5 pr-3 align-middle text-[11.5px] text-ink-muted">{row.saved_at}</td>
      <td className="py-2.5 pr-3 align-middle">
        {/* The store's own status. It is 'draft' on every row because no
            approval workflow exists to produce another state. */}
        <span className="rounded-[4px] bg-surface-muted px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
          {row.status}
        </span>
      </td>
      <td className="py-2.5 pr-3 align-middle">
        <span
          className={`rounded-[4px] px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-[0.04em] ${
            row.stale
              ? 'bg-status-warning-bg text-status-warning'
              : 'bg-status-success-bg text-status-success'
          }`}
        >
          {row.stale ? 'Stale' : 'Current'}
        </span>
      </td>
      <td className="py-2.5 text-right align-middle">
        {isCurrent ? (
          <span className="text-[11.5px] font-semibold text-ink-muted">Showing</span>
        ) : (
          <Button variant="secondary" onClick={onOpen}>
            <Icon name="arrowRight" /> <span>Open</span>
          </Button>
        )}
      </td>
    </tr>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="pb-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
      {children}
    </th>
  )
}
