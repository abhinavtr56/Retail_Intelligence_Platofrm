import { useState } from 'react'
import { Icon } from '../../../icons'
import { Modal, Button, Field, Input, Textarea, BrandLogo } from '../../ui'
import { ConnectModalHeader, ErrorBox, InfoNote, ModalFooter, Breadcrumb, ProxyTable } from './shared'
import { proxyFetch, saveProxyConn, loadProxyConn } from '../../../lib/portalConnectors'
import type { PortalConnector } from '../../../types/portal'

interface Warehouse {
  id: string
  name: string
  state?: string
}
interface Saved {
  workspace_url: string
  token: string
}

// Ported from js/portal.js's openDatabricksModal — connect, list SQL warehouses,
// run a query. Routed through FastAPI (app/routers/connectors.py) so CORS doesn't
// block it — Databricks itself doesn't send CORS headers, unlike Azure.
export function DatabricksModal({
  connector: _connector,
  onClose,
  onConnected,
}: {
  connector: PortalConnector
  onClose: () => void
  onConnected: (detail: string) => void
}) {
  const saved = loadProxyConn<Saved>('databricks')
  const [workspace, setWorkspace] = useState(saved?.workspace_url ?? '')
  const [token, setToken] = useState(saved?.token ?? '')
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null)
  const [activeWh, setActiveWh] = useState<Warehouse | null>(null)
  const [sql, setSql] = useState('SELECT current_date() AS today, 42 AS answer')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ columns: string[]; rows: (string | number | null)[][]; row_count: number } | null>(null)
  const [queryError, setQueryError] = useState('')

  const connect = async () => {
    setError('')
    if (!workspace.trim() || !token.trim()) {
      setError('Enter both a workspace URL and a personal access token.')
      return
    }
    setConnecting(true)
    try {
      const res = await proxyFetch<{ warehouses: Warehouse[] }>('/proxy/databricks/warehouses', {
        workspace_url: workspace.trim(),
        token: token.trim(),
      })
      const list = res.warehouses || []
      setWarehouses(list)
      saveProxyConn('databricks', { workspace_url: workspace.trim(), token: token.trim() })
      onConnected(`${list.length} warehouse${list.length === 1 ? '' : 's'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  const runQuery = async () => {
    if (!activeWh) return
    setRunning(true)
    setQueryError('')
    try {
      const res = await proxyFetch<{ columns: string[]; rows: (string | number | null)[][]; row_count: number }>(
        '/proxy/databricks/query',
        { workspace_url: workspace.trim(), token: token.trim(), warehouse_id: activeWh.id, statement: sql.trim() },
      )
      setResult(res)
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-[560px]">
      <ConnectModalHeader
        logo={<BrandLogo logo="databricks" name="Databricks" />}
        title="Connect Databricks"
        subtitle="Run a real query against a SQL warehouse"
        onClose={onClose}
      />
      <div className="p-5">
        <ErrorBox message={error} />
        {!warehouses ? (
          <>
            <div className="mb-3">
              <Field label="Workspace URL">
                <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="https://adb-1234567890123456.7.azuredatabricks.net" />
              </Field>
            </div>
            <div className="mb-1.5">
              <Field label="Personal access token">
                <div className="relative">
                  <Input type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="dapi..." className="pr-9" />
                  <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-1 top-1/2 grid h-[26px] w-[26px] -translate-y-1/2 place-items-center rounded-md text-ink-muted">
                    <Icon name="eye" className="h-4 w-4" />
                  </button>
                </div>
              </Field>
            </div>
            <InfoNote>
              Routed through the app's own backend so CORS doesn't block it. The token goes from this browser to the backend, then
              straight to Databricks — nothing is stored.
            </InfoNote>
            <Button variant="secondary" block className="mt-3.5" onClick={connect} disabled={connecting}>
              <Icon name="database" /> {connecting ? 'Connecting…' : 'Connect & list warehouses'}
            </Button>
          </>
        ) : !activeWh ? (
          <>
            <div className="mb-2 text-xs text-ink-muted">
              {warehouses.length} warehouse{warehouses.length === 1 ? '' : 's'} — pick one to run a query
            </div>
            <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
              {warehouses.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setActiveWh(w)}
                  className="flex items-center gap-2.5 rounded-[var(--r-md)] bg-surface-muted p-[9px_11px] text-left text-[12.5px] font-semibold hover:bg-brand-violet-50 hover:text-brand-violet"
                >
                  <Icon name="database" className="h-4 w-4 text-ink-muted" />
                  <span className="flex-1">{w.name}</span>
                  <span className="text-ink-muted">{w.state}</span>
                </button>
              ))}
              {!warehouses.length && <div className="text-xs text-ink-muted">No SQL warehouses visible to this token.</div>}
            </div>
          </>
        ) : (
          <>
            <Breadcrumb label="All warehouses" onClick={() => { setActiveWh(null); setResult(null); }} />
            <div className="mb-2 text-xs text-ink-muted">Running against {activeWh.name}</div>
            <Textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={3} className="font-mono text-xs" />
            <Button variant="primary" block className="mt-2.5" onClick={runQuery} disabled={running}>
              <Icon name="play" /> {running ? 'Running…' : 'Run query'}
            </Button>
            <div className="mt-3">
              {queryError && <div className="text-xs text-[#B91C1C]">{queryError}</div>}
              {result && (
                <>
                  <div className="mb-1.5 text-xs text-ink-muted">
                    {result.row_count} row{result.row_count === 1 ? '' : 's'} returned
                    {result.row_count > result.rows.length ? ` (showing first ${result.rows.length})` : ''}
                  </div>
                  <ProxyTable columns={result.columns} rows={result.rows} />
                </>
              )}
            </div>
          </>
        )}
      </div>
      <ModalFooter onClose={onClose} showDone={!!warehouses} onDone={onClose} />
    </Modal>
  )
}
