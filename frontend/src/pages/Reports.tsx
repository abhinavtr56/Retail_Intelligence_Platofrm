import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardHeader, IconButton, Input, Kpi, Table, Th, Td, Tr, useToast } from '../components/ui'
import { Icon } from '../icons'
import { useReports } from '../hooks/useMisc'

// Ported from js/pages/reports.js.
export function Reports() {
  const { data: D, isLoading } = useReports()
  const { show } = useToast()
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
                      <IconButton icon="download" title="Download" onClick={() => show(`Downloading "${r.name}"...`)} />
                      <IconButton icon="arrowUpRight" title="Share" onClick={() => show(`Sharing "${r.name}"...`)} />
                      <IconButton icon="more" onClick={() => show('More options')} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </AppShell>
  )
}
