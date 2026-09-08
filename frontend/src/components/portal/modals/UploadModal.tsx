import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../icons'
import { Modal, Button, IconButton, useToast, BrandLogo } from '../../ui'
import { fmtSize } from '../../../lib/portalConnectors'
import { useUploadDatasets } from '../../../hooks/useDatasets'
import { classifyFiles, ROLE_COLUMNS, STAR_ROLES, STAR_ROLE_LABELS } from '../../../lib/starSchema'
import type { ClassifiedFile } from '../../../lib/starSchema'
import { ApiError } from '../../../lib/api'
import type { PortalConnector } from '../../../types/portal'
import type { StarRole } from '../../../types/dataset'

// The Excel connector's upload screen.
//
// FILES ARE IDENTIFIED BY THEIR COLUMN HEADERS, NOT THEIR NAMES. Whatever the
// user's export is called — `Book1.xlsx`, `export (3).csv` — its columns say
// which of the six tables it is, and this modal reads that header in the
// browser to label each file as it is added. All six are required together, so
// the modal names exactly which tables are still missing (and, for a file whose
// columns are incomplete, which column it lacks) rather than letting the user
// send an upload that can only be refused.
export function UploadModal({
  connector,
  onClose,
  onConnected,
}: {
  connector: PortalConnector
  onClose: () => void
  onConnected: (detail: string) => void
}) {
  const [classified, setClassified] = useState<ClassifiedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { show } = useToast()
  const upload = useUploadDatasets()
  const processing = upload.isPending

  const addFiles = async (list: FileList | null) => {
    if (!list) return
    const next = await classifyFiles(Array.from(list))
    setClassified((prev) => {
      // De-duplicate by name+size: dropping the same folder twice is easy.
      const seen = new Set(prev.map((c) => `${c.file.name}:${c.file.size}`))
      return [...prev, ...next.filter((c) => !seen.has(`${c.file.name}:${c.file.size}`))]
    })
  }

  // A role is satisfied by exactly one file carrying every required column —
  // the same rule the backend applies in star_dataset.validate.
  const byRole = new Map<StarRole, ClassifiedFile[]>()
  for (const c of classified) {
    if (c.role) byRole.set(c.role, [...(byRole.get(c.role) ?? []), c])
  }
  const satisfied = new Set(
    [...byRole.entries()]
      .filter(([, files]) => files.length === 1 && files[0].missingColumns.length === 0)
      .map(([role]) => role),
  )
  const missingRoles = STAR_ROLES.filter((r) => !satisfied.has(r))
  const duplicated = [...byRole.entries()].filter(([, f]) => f.length > 1).map(([role]) => role)
  const incompleteFiles = classified.filter((c) => c.role && c.missingColumns.length > 0)
  // A workbook's header can't be read in the browser (see readHeader), so the
  // backend decides. Never block the upload on one.
  const undetermined = classified.filter((c) => c.undetermined)
  const ready = classified.length > 0 && (missingRoles.length === 0 || undetermined.length > 0)

  // Clear a stale error as soon as the selection changes — it described a set
  // the user has since edited.
  useEffect(() => setError(''), [classified.length])

  const go = () => {
    setError('')
    upload.mutate(
      classified.map((c) => c.file),
      {
        onSuccess: (result) => {
          const installed = result.star?.installed.length ?? 0
          if (installed) {
            const rows = result.star?.rows
            onConnected(`${installed} core tables${rows ? ` · ${rows.toLocaleString()} fact rows` : ''}`)
            show(`Dataset loaded — ${rows?.toLocaleString() ?? ''} fact rows ready.`, { duration: 4000 })
          } else if (result.datasets.length) {
            show(`${result.datasets.length} file(s) profiled for investigations.`, { duration: 3500 })
          }
          if (result.errors.length) {
            setError(result.errors.map((e) => e.error).join(' '))
            return
          }
          onClose()
        },
        onError: (e) => {
          setError(e instanceof ApiError ? e.message : "Couldn't reach the server — is the backend running?")
        },
      },
    )
  }

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-[500px]">
      <div className="flex items-center justify-between border-b border-border-subtle p-[16px_20px]">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-[9px]">
            <BrandLogo logo="excel" name={connector.name} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold">Upload your dataset</h3>
            <div className="mt-0.5 text-xs text-ink-muted">All 6 tables · recognised by their column headers</div>
          </div>
        </div>
        <IconButton icon="x" onClick={onClose} />
      </div>

      <div className="max-h-[62vh] overflow-y-auto p-5">
        <div
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files) }}
          className={`cursor-pointer rounded-[var(--r-lg)] border-2 border-dashed p-[24px_18px] text-center transition-colors ${
            dragging
              ? 'border-brand-violet bg-brand-violet-50'
              : 'border-border-strong hover:border-brand-violet hover:bg-brand-violet-50'
          }`}
        >
          <div className="mx-auto mb-2.5 grid h-10 w-10 place-items-center rounded-[10px] bg-tint-lavender text-tint-lavender-icon [&_svg]:h-5 [&_svg]:w-5">
            <Icon name="plus" />
          </div>
          <strong className="mb-1 block text-[13px]">Click to choose files, or drag them here</strong>
          <span className="text-[11.5px] text-ink-muted">File names don't matter — tables are matched on their columns</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }}
        />

        {classified.length > 0 && (
          <div className="mt-3.5 flex flex-col gap-2">
            {classified.map((c, i) => {
              const ok = Boolean(c.role) && c.missingColumns.length === 0
              return (
                <div
                  key={`${c.file.name}:${c.file.size}`}
                  className="flex items-center gap-2.5 rounded-[var(--r-md)] bg-surface-muted p-[9px_12px]"
                >
                  <Icon
                    name={ok ? 'check' : c.undetermined ? 'file' : 'info'}
                    className={`h-4 w-4 shrink-0 ${ok ? 'text-[#047857]' : c.undetermined ? 'text-ink-muted' : 'text-[#B91C1C]'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">{c.file.name}</div>
                    <div className="mt-px text-[10.5px] leading-[1.45]">
                      {ok && c.role ? (
                        <span className="text-[#047857]">{STAR_ROLE_LABELS[c.role]}</span>
                      ) : c.role ? (
                        <span className="text-[#B91C1C]">
                          {STAR_ROLE_LABELS[c.role]} — missing {c.missingColumns.join(', ')}
                        </span>
                      ) : c.undetermined ? (
                        <span className="text-ink-muted">Excel workbook — checked on upload</span>
                      ) : (
                        <span className="text-ink-muted">Not one of the 6 tables — profiled separately</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-muted">{fmtSize(c.file.size)}</span>
                  <button
                    onClick={() => setClassified((prev) => prev.filter((_, idx) => idx !== i))}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-status-danger-bg hover:text-[#B91C1C]"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* What is still needed, named table by table. */}
        {classified.length > 0 && missingRoles.length > 0 && undetermined.length === 0 && (
          <div className="mt-3.5 rounded-[var(--r-md)] bg-status-danger-bg p-[11px_13px]">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-[#B91C1C] [&_svg]:h-[14px] [&_svg]:w-[14px]">
              <Icon name="info" />
              {missingRoles.length} of 6 tables still missing — upload to continue the pipeline
            </div>
            <ul className="flex flex-col gap-1">
              {missingRoles.map((role) => {
                const incomplete = incompleteFiles.find((c) => c.role === role)
                return (
                  <li key={role} className="text-[11px] leading-[1.5] text-[#B91C1C]">
                    <strong>{STAR_ROLE_LABELS[role]}</strong>
                    {duplicated.includes(role) ? (
                      <> — uploaded more than once, keep one</>
                    ) : incomplete ? (
                      <> — missing {incomplete.missingColumns.join(', ')}</>
                    ) : (
                      <span className="opacity-80"> — needs {ROLE_COLUMNS[role].join(', ')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-3.5 rounded-[var(--r-md)] bg-status-danger-bg p-[10px_12px] text-[11.5px] leading-[1.55] text-[#B91C1C]">
            {error}
          </div>
        )}

        {classified.length > 0 && missingRoles.length === 0 && (
          <div className="mt-3.5 flex items-start gap-2 rounded-[var(--r-md)] bg-surface-muted p-[10px_12px] text-[11.5px] leading-[1.5] text-ink-muted [&_svg]:mt-px [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0">
            <Icon name="check" />
            <span>All 6 tables recognised. They'll be written to the data folder and every dashboard will load from them.</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle p-[14px_22px]">
        <span className="text-[11px] text-ink-muted">
          {classified.length > 0 ? `${satisfied.size} of 6 ready` : '.csv, .xlsx or .xls'}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={!ready || processing}>
            <Icon name="plus" />{' '}
            {processing ? 'Loading dataset…' : ready ? 'Upload & Process' : `${missingRoles.length} missing`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
