import { useRef, useState } from 'react'
import { Icon } from '../../../icons'
import { Modal, Button, IconButton, useToast, BrandLogo } from '../../ui'
import { fmtSize } from '../../../lib/portalConnectors'
import type { PortalConnector } from '../../../types/portal'

// Ported from js/portal.js's openUploadModal + css/portal.css .dropzone/.file-chip.
// Local dev build — files are staged here for review, same as the vanilla app; wiring
// to a real Excel connector endpoint is a data-connectors follow-up, not this port.
export function UploadModal({
  connector,
  onClose,
  onConnected,
}: {
  connector: PortalConnector
  onClose: () => void
  onConnected: (detail: string) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { show } = useToast()

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)])
  }

  const go = () => {
    const n = files.length
    setProcessing(true)
    window.setTimeout(() => {
      onConnected(`${n} file${n > 1 ? 's' : ''}`)
      show(`${n} file${n > 1 ? 's' : ''} staged from Excel / Shared Drives — ready for backend processing.`)
      onClose()
    }, 1100)
  }

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-[460px]">
      <div className="flex items-center justify-between border-b border-border-subtle p-[16px_20px]">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-[9px]">
            <BrandLogo logo="excel" name={connector.name} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold">Upload Excel / CSV files</h3>
            <div className="mt-0.5 text-xs text-ink-muted">Promotion planning files → {connector.name}</div>
          </div>
        </div>
        <IconButton icon="x" onClick={onClose} />
      </div>

      <div className="p-5">
        <div
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`cursor-pointer rounded-[var(--r-lg)] border-2 border-dashed p-[26px_18px] text-center transition-colors ${
            dragging ? 'border-brand-violet bg-brand-violet-50' : 'border-border-strong hover:border-brand-violet hover:bg-brand-violet-50'
          }`}
        >
          <div className="mx-auto mb-2.5 grid h-10 w-10 place-items-center rounded-[10px] bg-tint-lavender text-tint-lavender-icon [&_svg]:h-5 [&_svg]:w-5">
            <Icon name="plus" />
          </div>
          <strong className="mb-1 block text-[13px]">Click to choose files, or drag them here</strong>
          <span className="text-[11.5px] text-ink-muted">Multiple .xlsx, .xls or .csv files at once</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {files.length > 0 && (
          <div className="mt-3.5 flex max-h-[200px] flex-col gap-2 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-[var(--r-md)] bg-surface-muted p-[9px_12px]">
                <Icon name="file" className="h-4 w-4 shrink-0 text-brand-violet" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{f.name}</span>
                <span className="shrink-0 text-[11px] text-ink-muted">{fmtSize(f.size)}</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-status-danger-bg hover:text-[#B91C1C]"
                >
                  <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3.5 flex items-start gap-2 rounded-[var(--r-md)] bg-surface-muted p-[10px_12px] text-[11.5px] leading-[1.5] text-ink-muted [&_svg]:mt-px [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0">
          <Icon name="info" />
          <span>Local dev build — files are staged here for review. Wiring this to the real Excel connector is the first task in the data-connectors workstream.</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 p-[14px_22px]">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={go} disabled={files.length === 0 || processing}>
          <Icon name="plus" /> {processing ? 'Processing…' : `Upload & Process${files.length ? ` ${files.length} file${files.length > 1 ? 's' : ''}` : ''}`}
        </Button>
      </div>
    </Modal>
  )
}
