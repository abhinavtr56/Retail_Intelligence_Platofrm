import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardHeader, IconButton, Input, Kpi, Table, Th, Td, Tr } from '../components/ui'
import { Icon } from '../icons'
import { useReports } from '../hooks/useMisc'
import { useStoredDecisions } from '../hooks/useStore'
import { Pill, Spinner } from '../components/ui'

// Ported from js/pages/reports.js.
export function Reports() {
  const { data: D, isLoading } = useReports()
  const history = useStoredDecisions()
  const [q, setQ] = useState('')
  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Reports' }]

  if (isLoading || !D) {
    return (
      <AppShell activeKey="reports" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Reports…</div>
      </AppShell>
    )
  }

  const rows = D.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <AppShell activeKey="reports" crumbs={crumbs}>
      <div className="fade-in mb-5 flex items-end justify-between gap-4">
        <div>
          <h1>Reports</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Generated, scheduled and shared TPO reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Icon name="filter" /> All Types <Icon name="chevronDown" />
          </Button>
          <Button variant="primary">
            <Icon name="plus" /> New Report
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-4">
        <Kpi label="Total Reports" value={String(D.length)} delta={<><Icon name="file" /> across 4 categories</>} />
        <Kpi label="Generated Today" value={<span className="text-brand-violet">2</span>} delta={<><Icon name="arrowUp" /> +1 vs avg</>} deltaDirection="up" />
        <Kpi label="Scheduled" value="5" delta={<><Icon name="clock" /> next: tomorrow 9am</>} />
        <Kpi label="Shared This Week" value="8" delta={<><Icon name="users" /> 14 recipients</>} />
      </div>

      {/* B10: the first real, produced thing this page has ever listed. Every
          row below is a decision the store actually holds, retrievable by the
          id shown. The authored table underneath is unrelated and remains a
          known limitation — see the note on it. */}
      <Card className="fade-in mb-5">
        <CardHeader title="Saved decisions" />
        <div className="overflow-x-auto">
          {history.isPending ? (
            <div className="flex items-center gap-2 px-5 py-6 text-[12.5px] text-ink-muted">
              <Spinner /> Loading saved decisions…
            </div>
          ) : history.isError ? (
            <div className="px-5 py-6 text-[12.5px] text-ink-secondary">
              Could not load saved decisions — {history.error.message}
            </div>
          ) : !history.data?.decisions.length ? (
            <div className="px-5 py-6 text-[12.5px] leading-[1.55] text-ink-muted">
              No decision has been saved yet. Carry a scenario to the Decision Center and
              choose Save Decision.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Decision</Th>
                  <Th>Scenario</Th>
                  <Th>Version</Th>
                  <Th>Saved</Th>
                  <Th>Status</Th>
                  <Th>Data</Th>
                </tr>
              </thead>
              <tbody>
                {history.data.decisions.map((d) => (
                  <Tr key={d.decision_id} className="cursor-default hover:bg-transparent">
                    <Td emphasis>
                      <span className="font-mono text-[11.5px]">{d.decision_id}</span>
                    </Td>
                    <Td>{d.scenario_name ?? '—'}</Td>
                    <Td>{d.version}</Td>
                    <Td>{d.saved_at}</Td>
                    <Td>
                      <Pill tone="neutral">draft · not approved</Pill>
                    </Td>
                    <Td>
                      {d.stale ? (
                        <Pill tone="warning">stale</Pill>
                      ) : (
                        <span className="text-[11.5px] text-ink-muted">current</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="border-t border-border-subtle px-5 py-3 text-[11.5px] leading-[1.5] text-ink-muted">
            {history.data?.owner_note ??
              'Ownership is unverified. This application has no authentication.'}{' '}
            No decision here is approved — this project defines no approval criteria.
          </div>
        </div>
      </Card>

      <Card className="fade-in">
        <CardHeader title="All Reports" actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports..." className="max-w-[240px]" />} />
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Report Name</Th>
                <Th>Updated</Th>
                <Th>Owner</Th>
                <Th>Size</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.name} className="cursor-default hover:bg-transparent">
                  <Td emphasis>
                    <span className="mr-2.5 inline-flex min-w-[38px] items-center justify-center rounded-[var(--r-sm)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.04em] text-[#B91C1C]" style={{ background: r.type === 'PDF' ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)', color: r.type === 'PDF' ? '#B91C1C' : '#047857' }}>
                      {r.type}
                    </span>
                    {r.name}
                  </Td>
                  <Td>{r.updated}</Td>
                  <Td>{r.owner}</Td>
                  <Td>{r.size}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {/* B8: these narrated a download and a share that never
                          happened - the rows are authored JSON with no file
                          behind them. Disabled until there is something real to
                          hand over. */}
                      <IconButton icon="download" title="Download — not yet available" disabled />
                      <IconButton icon="arrowUpRight" title="Share — not yet available" disabled />
                      <IconButton icon="more" title="More — not yet available" disabled />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {/* B12: the rows above are authored sample content ported from the
              vanilla app — no file, owner or byte-size behind any of them. B9
              disabled their controls so nothing claims an action; this says
              what the list is, without inventing replacement data. */}
          <div className="border-t border-border-subtle px-5 py-3 text-[11.5px] leading-[1.5] text-ink-muted">
            Sample entries. No file, owner or size here is real — nothing in this
            application produces these reports yet. The saved decisions above are the
            records this platform actually stores.
          </div>
        </div>
      </Card>
    </AppShell>
  )
}
