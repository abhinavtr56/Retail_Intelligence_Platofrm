import { AppShell } from '../components/layout/AppShell'
import { Button, Card, Kpi, Pill, BrandLogo, useToast } from '../components/ui'
import { Icon } from '../icons'
import { useConnections } from '../hooks/useMisc'

// Ported from js/pages/connections.js.

export function Connections() {
  const { data: D, isLoading } = useConnections()
  const { show } = useToast()
  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Data Connections' }]

  if (isLoading || !D) {
    return (
      <AppShell activeKey="connections" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Data Connections…</div>
      </AppShell>
    )
  }

  const connected = D.filter((d) => d.status === 'Connected')
  const available = D.filter((d) => d.status === 'Available')

  return (
    <AppShell activeKey="connections" crumbs={crumbs}>
      <div className="fade-in mb-5 flex items-end justify-between gap-4">
        <div>
          <h1>Data Connections</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {connected.length} sources connected · {available.length} available · all systems healthy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Icon name="download" /> Export Catalog
          </Button>
          <Button variant="primary" onClick={() => show('Opening connector catalog…')}>
            <Icon name="plus" /> Add Source
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Kpi label="Connected" value={String(connected.length)} delta={<><Icon name="checkCircle" /> all healthy</>} deltaDirection="up" />
        <Kpi label="Avg Refresh" value="3.8 min" delta={<><Icon name="arrowUp" /> SLA met</>} deltaDirection="up" />
        <Kpi label="Rows Today" value="142K+" delta={<><Icon name="arrowUp" /> +18% vs avg</>} deltaDirection="up" />
        <Kpi label="Governance" value="92%" delta={<><Icon name="shield" /> Compliant</>} deltaDirection="up" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2>Connected Sources</h2>
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
          <span className="inline-block h-1.5 w-1.5 animate-[pulseDot_1.4s_ease-in-out_infinite] rounded-full bg-status-success" /> Live sync
        </span>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3 max-[1180px]:grid-cols-2 max-[720px]:grid-cols-1">
        {connected.map((d, i) => (
          <Card key={d.name} className="fade-in-up p-[14px_16px] transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-md)]" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                <BrandLogo logo={d.logo} name={d.name} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-ink-primary">{d.name}</div>
                <div className="text-[11px] text-ink-muted">{d.desc}</div>
              </div>
              <Pill tone="success" dot pulse>
                Live
              </Pill>
            </div>
            <div className="mt-3 flex justify-between gap-3 border-t border-dashed border-border-default pt-2.5">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-ink-muted">Rows</span>
                <span className="text-xs font-bold text-ink-primary [font-variant-numeric:tabular-nums]">{d.rows}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-ink-muted">Last sync</span>
                <span className="text-xs font-bold text-ink-primary [font-variant-numeric:tabular-nums]">{d.freshness}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2>Available Connectors</h2>
        <span className="text-sm text-ink-muted">{available.length} more sources you can add</span>
      </div>
      <div className="grid grid-cols-4 gap-2.5 max-[1180px]:grid-cols-2">
        {available.map((d) => (
          <Card key={d.name} className="grid grid-cols-[36px_1fr_auto] items-center gap-2.5 p-[12px_14px]">
            <div className="h-9 w-9 overflow-hidden rounded-lg">
              <BrandLogo logo={d.logo} name={d.name} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink-primary">{d.name}</div>
              <div className="text-[11px] text-ink-muted">{d.desc}</div>
            </div>
            <Button variant="violet-soft" size="sm" onClick={() => show(`Connecting to ${d.name}…`)}>
              <Icon name="plus" /> Connect
            </Button>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
