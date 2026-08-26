import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, BrandLogo, useToast } from '../components/ui'
import { Icon } from '../icons'
import { INITIAL_CONNECTORS } from '../components/portal/connectors'

// Ported from js/pages/connections.js.

// The four connectors the Home rail actually offers (Home hides 'sap'/'niq' from
// the same catalog). This page is the catalog view of exactly those four — no
// mock "Snowflake"-style entries, so what you can connect here is what the
// portal can really connect.
const HOME_CONNECTOR_KEYS = new Set(['pbi', 'xls', 'azure', 'databricks'])

export function Connections() {
  const { show } = useToast()
  const navigate = useNavigate()

  // Connecting really happens on Home — that rail owns the sign-in/upload modals
  // and the session state behind them. This page is the catalog, so Connect hands
  // off there rather than pretending to open a connection of its own.
  const goConnect = (name: string) => {
    show(`Opening ${name} on the portal…`)
    navigate('/home')
  }
  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Data Connections' }]

  const available = INITIAL_CONNECTORS.filter((c) => HOME_CONNECTOR_KEYS.has(c.key))

  return (
    <AppShell activeKey="connections" crumbs={crumbs}>
      <div className="fade-in mb-6 flex items-end justify-between gap-4">
        <div>
          <h1>Data Connections</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {available.length} sources available to connect
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/home')}>
          <Icon name="plus" /> Add Source
        </Button>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2>Available Connectors</h2>
        <span className="text-sm text-ink-muted">Connect a source to start pulling data in</span>
      </div>
      <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        {available.map((c, i) => (
          <Card
            key={c.key}
            className="fade-in-up flex min-h-[168px] flex-col p-5 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-md)]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[10px]">
                <BrandLogo logo={c.logo} name={c.name} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink-primary">{c.name}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{c.desc}</div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-ink-disabled">
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> Not connected
              </span>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-border-default pt-3.5">
              <span className="text-[11.5px] text-ink-muted">
                {c.upload ? 'Upload files from your machine' : 'Sign in with your account credentials'}
              </span>
              <Button variant="violet-soft" size="sm" onClick={() => goConnect(c.name)}>
                <Icon name="plus" /> Connect
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
