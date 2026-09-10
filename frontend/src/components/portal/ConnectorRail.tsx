import { Icon } from '../../icons'
import type { ConnectorSpecial, PortalConnector } from '../../types/portal'

// Ported from js/portal.js's renderConnectors/connectorRowHtml + css/portal.css
// .connector-row.
//
// NO TOGGLE. The switch that used to sit on each row implied every connector
// could be turned on and off in place, which was never true: the platform holds
// exactly one star schema, and swapping it means loading a new set through a
// connector's own dialog and resetting from there. A switch that only ever
// opened that dialog — or silently dropped a saved session — was describing a
// model the backend does not have. Each row now offers the one action it really
// has, and the dialog behind it owns connect, browse and reset.
export function ConnectorRail({
  connectors,
  onOpenSpecial,
  onOpenUpload,
  loaded = false,
  sourceName,
  sourceDetail,
}: {
  connectors: PortalConnector[]
  onOpenSpecial: (special: ConnectorSpecial) => void
  onOpenUpload: (connector: PortalConnector) => void
  /** True when the six tables are installed, whatever loaded them. */
  loaded?: boolean
  /** Connector the dataset came from. Null when loaded before this was recorded. */
  sourceName?: string | null
  /** e.g. "6/6 core tables" — shown beside the source. */
  sourceDetail?: string | null
}) {
  return (
    <div className="rounded-[var(--r-xl)] border border-border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between border-b border-border-subtle p-[16px_20px]">
        <div>
          <h3 className="text-base">Connected Data Sources</h3>
          <p className="mt-0.5 text-sm text-ink-muted">Enterprise systems the platform plugs into</p>
        </div>
        <span className="mt-0.5 shrink-0 text-ink-muted [&_svg]:h-[18px] [&_svg]:w-[18px]">
          <Icon name="database" />
        </span>
      </div>

      <div>
        {connectors.map((c) => (
          <div key={c.key} className="flex items-center gap-3 border-b border-border-subtle p-[13px_20px] last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold">{c.name}</div>
              <div className="mt-px text-sm text-ink-muted">{c.desc}</div>
              {c.upload && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenUpload(c)
                  }}
                  className="mt-0.5 flex items-center gap-1 text-xs font-bold text-brand-violet [&_svg]:h-[11px] [&_svg]:w-[11px]"
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
                  className="mt-0.5 flex items-center gap-1 text-xs font-bold text-brand-violet [&_svg]:h-[11px] [&_svg]:w-[11px]"
                >
                  <Icon name="database" /> {c.on ? 'Browse / reconnect' : 'Connect account'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Which connector the data actually came from. The rail lists what the
          platform *can* read; without this it never said which one it *did*. */}
      <div className="border-t border-border-subtle p-[13px_20px]">
        {loaded ? (
          <div className="flex items-start gap-2 [&_svg]:mt-px [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0">
            <span className="text-[#047857]">
              <Icon name="checkCircle" />
            </span>
            <div className="min-w-0 text-sm leading-[1.45]">
              {sourceName ? (
                <>
                  <span className="text-ink-muted">Dataset loaded from </span>
                  <span className="font-bold">{sourceName}</span>
                </>
              ) : (
                <span className="font-bold">Dataset loaded</span>
              )}
              {sourceDetail && <div className="mt-px text-xs text-ink-muted">{sourceDetail}</div>}
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-muted">No dataset loaded — upload or connect a source above.</div>
        )}
      </div>
    </div>
  )
}
