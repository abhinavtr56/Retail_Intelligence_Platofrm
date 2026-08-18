import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../icons'
import { Modal, Button, Field, Input, BrandLogo } from '../../ui'
import { ConnectModalHeader, ErrorBox, InfoNote, ModalFooter, Breadcrumb } from './shared'
import { azureListContainers, azureListBlobs, saveAzureConn, loadAzureConn, fmtSize } from '../../../lib/portalConnectors'
import type { PortalConnector } from '../../../types/portal'

type Container = { name: string }
type Blob = { name: string; size: number; modified: string }

// Ported from js/portal.js's openAzureModal — real Azure Blob Storage REST calls
// straight from the browser (List Containers / List Blobs), no backend needed since
// Blob Storage supports CORS directly. SAS token stays in sessionStorage only.
export function AzureModal({
  connector: _connector,
  onClose,
  onConnected,
}: {
  connector: PortalConnector
  onClose: () => void
  onConnected: (detail: string) => void
}) {
  const saved = loadAzureConn()
  const [account, setAccount] = useState(saved?.account ?? '')
  const [sas, setSas] = useState(saved?.sas ?? '')
  const [showSas, setShowSas] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [containers, setContainers] = useState<Container[] | null>(null)
  const [view, setView] = useState<{ container: string; blobs: Blob[] } | 'list' | null>(null)
  const [loadingBlobs, setLoadingBlobs] = useState(false)
  const autoTried = useRef(false)

  const connect = async () => {
    setError('')
    if (!account.trim() || !sas.trim()) {
      setError('Enter both a storage account name and a SAS token.')
      return
    }
    setConnecting(true)
    try {
      const list = await azureListContainers(account.trim(), sas.trim())
      setContainers(list)
      setView('list')
      saveAzureConn({ account: account.trim(), sas: sas.trim() })
      onConnected(`${list.length} container${list.length === 1 ? '' : 's'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    if (!autoTried.current && saved?.account && saved?.sas) {
      autoTried.current = true
      connect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openContainer = async (name: string) => {
    setLoadingBlobs(true)
    try {
      const blobs = await azureListBlobs(account.trim(), sas.trim(), name)
      setView({ container: name, blobs })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingBlobs(false)
    }
  }

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-[520px]">
      <ConnectModalHeader
        logo={<BrandLogo logo="azure" name="Azure" />}
        title="Connect Azure Blob Storage"
        subtitle="Read containers & blobs directly from your storage account"
        onClose={onClose}
      />
      <div className="p-5">
        <ErrorBox message={error} />
        <div className="mb-3">
          <Field label="Storage account name">
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="mystorageaccount" />
          </Field>
        </div>
        <div className="mb-1.5">
          <Field label="SAS token">
            <div className="relative">
              <Input
                type={showSas ? 'text' : 'password'}
                value={sas}
                onChange={(e) => setSas(e.target.value)}
                placeholder="sv=2024-...&ss=b&srt=co&sp=rl&se=...&sig=..."
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowSas((v) => !v)}
                className="absolute right-1 top-1/2 grid h-[26px] w-[26px] -translate-y-1/2 place-items-center rounded-md text-ink-muted"
              >
                <Icon name="eye" className="h-4 w-4" />
              </button>
            </div>
          </Field>
        </div>
        <InfoNote>
          Needs a SAS token with List and Read permission, and CORS enabled on the storage account for this origin (Portal → Storage
          account → Resource sharing (CORS) → allow GET/HEAD, this origin, all headers). The token stays in this browser tab only —
          never sent anywhere but Azure.
        </InfoNote>
        <Button variant="secondary" block className="mt-3.5" onClick={connect} disabled={connecting}>
          <Icon name="database" /> {connecting ? 'Connecting…' : 'Connect & list containers'}
        </Button>

        <div className="mt-3.5">
          {view === 'list' && containers && (
            <>
              <div className="mb-2 text-xs text-ink-muted">
                {containers.length} container{containers.length === 1 ? '' : 's'} found — click one to preview its files
              </div>
              <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                {containers.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => openContainer(c.name)}
                    className="flex items-center gap-2.5 rounded-[var(--r-md)] bg-surface-muted p-[9px_11px] text-left text-[12.5px] font-semibold hover:bg-brand-violet-50 hover:text-brand-violet"
                  >
                    <Icon name="folder" className="h-4 w-4 text-ink-muted" />
                    <span className="flex-1">{c.name}</span>
                    <Icon name="chevronRight" className="h-4 w-4 text-ink-muted" />
                  </button>
                ))}
                {!containers.length && <div className="text-xs text-ink-muted">No containers visible to this SAS token.</div>}
              </div>
            </>
          )}

          {view && typeof view === 'object' && (
            <>
              <Breadcrumb label="All containers" onClick={() => setView('list')} />
              <div className="mb-2 text-xs text-ink-muted">
                {view.container} · {loadingBlobs ? 'loading…' : `${view.blobs.length} file${view.blobs.length === 1 ? '' : 's'}`}
              </div>
              <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                {view.blobs.slice(0, 50).map((b) => (
                  <div key={b.name} className="flex items-center gap-2.5 rounded-[var(--r-md)] bg-surface-muted p-[9px_11px] text-[12.5px] font-medium">
                    <Icon name="file" className="h-4 w-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="shrink-0 text-ink-muted">{fmtSize(b.size)}</span>
                  </div>
                ))}
                {!view.blobs.length && <div className="text-xs text-ink-muted">This container is empty.</div>}
              </div>
              {view.blobs.length > 50 && <div className="mt-1.5 text-xs text-ink-muted">+ {view.blobs.length - 50} more not shown</div>}
            </>
          )}
        </div>
      </div>
      <ModalFooter onClose={onClose} showDone={!!containers} onDone={onClose} />
    </Modal>
  )
}
