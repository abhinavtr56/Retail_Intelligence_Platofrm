import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconButton, Pill, useToast } from '../components/ui'
import { usePortalUserStore } from '../store/portalUser'
import { HeroArt } from '../components/portal/HeroArt'
import { ModuleGrid } from '../components/portal/ModuleGrid'
import { ConnectorRail } from '../components/portal/ConnectorRail'
import { AdvisorCard } from '../components/portal/AdvisorCard'
import { INITIAL_CONNECTORS } from '../components/portal/connectors'
import { UploadModal } from '../components/portal/modals/UploadModal'
import { AzureModal } from '../components/portal/modals/AzureModal'
import { DatabricksModal } from '../components/portal/modals/DatabricksModal'
import { SapModal } from '../components/portal/modals/SapModal'
import { PowerBiModal } from '../components/portal/modals/PowerBiModal'
import { NielsenModal } from '../components/portal/modals/NielsenModal'
import { clearAzureConn, loadAzureConn, clearProxyConn } from '../lib/portalConnectors'
import type { ConnectorSpecial, PortalConnector } from '../types/portal'

const DISCONNECT_KIND: Record<ConnectorSpecial, string> = {
  azure: 'azure',
  databricks: 'databricks',
  sap: 'sap',
  powerbi: 'powerbi',
  nielsen: 'nielsen',
}

// Ported from home.html + js/portal.js's Portal.initHome(). Same topbar/hero/module
// grid/connector rail/advisor layout as the vanilla app, state-driven instead of
// direct DOM mutation.
export function Home() {
  const { user } = usePortalUserStore()
  const { show } = useToast()
  const [connectors, setConnectors] = useState<PortalConnector[]>(INITIAL_CONNECTORS)
  const [modal, setModal] = useState<ConnectorSpecial | 'upload' | null>(null)
  const [uploadTarget, setUploadTarget] = useState<PortalConnector | null>(null)

  // Reflect a saved Azure session (this browser tab) before first paint, same as
  // the vanilla app's renderConnectors().
  useEffect(() => {
    const saved = loadAzureConn()
    if (saved) {
      setConnectors((prev) => prev.map((c) => (c.key === 'azure' ? { ...c, on: true, detail: c.detail || 'Saved session' } : c)))
    }
  }, [])

  const updateConnector = (key: string, patch: Partial<PortalConnector>) => {
    setConnectors((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  const handleToggle = (key: string) => {
    const c = connectors.find((x) => x.key === key)
    if (!c) return
    if (c.special) {
      // Only reached when already on (see ConnectorRail) — disconnect + clear session.
      if (c.special === 'azure') clearAzureConn()
      else clearProxyConn(DISCONNECT_KIND[c.special])
      updateConnector(key, { on: false, detail: undefined })
      show(`${c.name} disconnected — session cleared from this browser.`)
      return
    }
    updateConnector(key, { on: !c.on })
  }

  const closeModal = () => {
    setModal(null)
    setUploadTarget(null)
  }

  const onConnected = (key: string) => (detail: string) => updateConnector(key, { on: true, detail })

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="flex h-[72px] items-center gap-3 border-b border-border-subtle bg-surface-card px-4 sm:px-8">
        <Link to="/home" className="flex min-w-0 items-center gap-3">
          <img src="/image.png" alt="TransOrg" className="h-[34px] w-[34px] shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] leading-[1.25] sm:text-[17px]">Agentic CPG &amp; Retail Intelligence Platform</h1>
            <p className="mt-px hidden truncate text-xs text-ink-muted sm:block">Enterprise decision intelligence for FMCG/CPG</p>
          </div>
        </Link>
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden sm:block">
            <Pill tone="violet">V1 · Local dev</Pill>
          </div>
          <IconButton icon="bell" onClick={() => show('No notifications yet — this is a fresh workspace.')} title="Notifications" />
          <IconButton icon="help" onClick={() => show('Help center coming soon.')} title="Help" />
          <div
            onClick={() => show('Profile & sign-out coming soon.')}
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-[linear-gradient(135deg,#6B47FF,#8C6EFF)] text-xs font-bold text-white"
            title="Profile"
          >
            {user.initials}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1920px] p-[20px_16px_40px] sm:p-[34px_40px_64px]">
        <div className="fade-in-up mb-7 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h2 className="mb-2 text-xl sm:text-2xl">Good to see you, {user.name.toUpperCase()}.</h2>
            <p className="max-w-none text-[13.5px] leading-[1.6] text-ink-secondary">
              Six intelligence modules span the retail value chain end to end. Trade Promotion Optimization is live — open it to
              observe, diagnose and simulate promotion performance. The rest are on the roadmap.
            </p>
          </div>
          <div className="hidden shrink-0 md:block">
            <HeroArt />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_360px] items-start gap-6 max-[1080px]:grid-cols-1">
          <ModuleGrid />

          <div className="flex flex-col gap-6">
            <ConnectorRail
              connectors={connectors}
              onToggle={handleToggle}
              onOpenSpecial={(special) => setModal(special)}
              onOpenUpload={(c) => {
                setUploadTarget(c)
                setModal('upload')
              }}
            />
            <AdvisorCard />
          </div>
        </div>
      </main>

      {modal === 'upload' && uploadTarget && <UploadModal connector={uploadTarget} onClose={closeModal} onConnected={onConnected('xls')} />}
      {modal === 'azure' && (
        <AzureModal connector={connectors.find((c) => c.key === 'azure')!} onClose={closeModal} onConnected={onConnected('azure')} />
      )}
      {modal === 'databricks' && (
        <DatabricksModal
          connector={connectors.find((c) => c.key === 'databricks')!}
          onClose={closeModal}
          onConnected={onConnected('databricks')}
        />
      )}
      {modal === 'sap' && <SapModal connector={connectors.find((c) => c.key === 'sap')!} onClose={closeModal} onConnected={onConnected('sap')} />}
      {modal === 'powerbi' && (
        <PowerBiModal connector={connectors.find((c) => c.key === 'pbi')!} onClose={closeModal} onConnected={onConnected('pbi')} />
      )}
      {modal === 'nielsen' && (
        <NielsenModal connector={connectors.find((c) => c.key === 'niq')!} onClose={closeModal} onConnected={onConnected('niq')} />
      )}
    </div>
  )
}
