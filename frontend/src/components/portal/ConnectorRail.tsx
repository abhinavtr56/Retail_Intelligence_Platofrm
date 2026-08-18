import { Icon } from '../../icons'
import { useToast } from '../ui'
import type { ConnectorSpecial, PortalConnector } from '../../types/portal'

// Ported from js/portal.js's renderConnectors/connectorRowHtml + css/portal.css
// .connector-row/.toggle.
export function ConnectorRail({
  connectors,
  onToggle,
  onOpenSpecial,
  onOpenUpload,
}: {
  connectors: PortalConnector[]
  onToggle: (key: string) => void
  onOpenSpecial: (special: ConnectorSpecial) => void
  onOpenUpload: (connector: PortalConnector) => void
}) {
  const { show } = useToast()

  return (
    <div className="rounded-[var(--r-xl)] border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between border-b border-border-subtle p-[16px_20px]">
        <div>
          <h3 className="text-sm">Connected Data Sources</h3>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">Enterprise systems the platform plugs into</p>
        </div>
        <span className="mt-0.5 shrink-0 text-ink-muted [&_svg]:h-[18px] [&_svg]:w-[18px]">
          <Icon name="database" />
        </span>
      </div>

      <div>
        {connectors.map((c) => {
          const statusLabel = c.on ? (c.detail ? `Connected · ${c.detail}` : 'Connected') : 'Disconnected'
          return (
            <div key={c.key} className="flex items-center gap-3 border-b border-border-subtle p-[13px_20px] last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold">{c.name}</div>
                <div className="mt-px text-[11.5px] text-ink-muted">{c.desc}</div>
                {c.upload && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenUpload(c)
                    }}
                    className="mt-0.5 flex items-center gap-1 text-[10.5px] font-bold text-brand-violet [&_svg]:h-[11px] [&_svg]:w-[11px]"
                  >
                    <Icon name="plus" /> Upload files
                  </button>
                )}
                {c.special && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenSpecial(c.special!)
                    }}
                    className="mt-0.5 flex items-center gap-1 text-[10.5px] font-bold text-brand-violet [&_svg]:h-[11px] [&_svg]:w-[11px]"
                  >
                    <Icon name="database" /> {c.on ? 'Browse / reconnect' : 'Connect account'}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  role="switch"
                  aria-checked={c.on}
                  onClick={() => {
                    if (c.special) {
                      if (c.on) onToggle(c.key)
                      else onOpenSpecial(c.special)
                      return
                    }
                    onToggle(c.key)
                    show(`${c.name} ${c.on ? 'disconnected' : 'connected'}.`)
                  }}
                  className={`relative h-[21px] w-9 shrink-0 rounded-[999px] p-0 transition-colors ${c.on ? 'bg-brand-violet' : 'bg-border-strong'}`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-[17px] w-[17px] rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform ${c.on ? 'translate-x-[15px]' : ''}`}
                  />
                </button>
                <span className={`flex items-center gap-1 text-[11px] font-semibold ${c.on ? 'text-[#047857]' : 'text-ink-disabled'}`}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  {statusLabel}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-border-subtle p-[13px_20px]">
        <button onClick={() => show('Full connections manager coming soon.')} className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-secondary hover:text-brand-violet">
          Manage connections
        </button>
      </div>
    </div>
  )
}
