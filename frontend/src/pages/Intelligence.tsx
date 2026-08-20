import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button, IconButton, Dropdown, LiveStatus, useLiveStatus, useToast, Tabs } from '../components/ui'
import { Icon } from '../icons'
import { useInvestigationTypes } from '../hooks/useInvestigations'
import { useIntelligencePage, useIntelligenceAnswer } from '../hooks/useIntelligence'
import { useFocus } from '../hooks/useNav'
import { useActiveInvestigationStore } from '../store/activeInvestigation'
import { ActiveInvBanner } from '../components/investigations/ActiveInvBanner'
import { AiAnswerCard } from '../components/intelligence/AiAnswerCard'
import {
  OverviewTab,
  ContributionTab,
  DriversTab,
  SegmentsTab,
  RetailersTab,
  RegionsTab,
  SkuLevelTab,
  InsightsTab,
} from '../components/intelligence/tabs'

const PROMO_OPTIONS = ['South MT Push', 'North GT Boost', 'Value Pack Bonanza']
const PERIOD_OPTIONS = ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25']

// Ported from js/pages/intelligence.js (PageIntelligence.render + its 8 tab renderers).
export function Intelligence() {
  const { activeType, activeQuestion } = useActiveInvestigationStore()
  const { data: types } = useInvestigationTypes()
  const { data: D, isLoading } = useIntelligencePage(activeType)
  const { data: answer } = useIntelligenceAnswer(activeType)
  const { data: focus } = useFocus()
  const { show } = useToast()
  const live = useLiveStatus()

  const typeMeta = types?.find((t) => t.key === activeType) ?? types?.[0]

  const [promo, setPromo] = useState(PROMO_OPTIONS[0])
  const [period, setPeriod] = useState('Q2 FY25')
  const [tab, setTab] = useState(0)

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Promotion Intelligence' }]

  if (isLoading || !D || !typeMeta) {
    return (
      <AppShell activeKey="intelligence" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Promotion Intelligence…</div>
      </AppShell>
    )
  }

  return (
    <AppShell activeKey="intelligence" crumbs={crumbs}>
      <div className="fade-in flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.02em]">
              {D.title || 'Promotion Performance Intelligence'} <Icon name="sparkles" className="h-5 w-5 text-brand-violet" />
            </h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">{D.subtitle || 'Causal Understanding Layer'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            selected={promo}
            options={PROMO_OPTIONS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPromo(val)
              show(`Switched analysis to "${val}"`)
            }}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                <Icon name="calendar" /> <span>{promo} {focus ? `(${focus.period.replace(' 2025', '')})` : ''}</span> <Icon name="chevronDown" />
              </Button>
            }
          />
          <Dropdown
            selected={period}
            options={PERIOD_OPTIONS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPeriod(val)
              show(`Period → ${val}`)
            }}
            trigger={
              <Button variant="secondary" className="cursor-pointer">
                <span>{focus?.quarter ?? period}</span> <Icon name="chevronDown" />
              </Button>
            }
          />
          {/* B8: this button used to announce "Report exported - Sent to your
              downloads" and generate nothing. There is no report renderer for
              this page, so it says what is true instead. The one real export in
              the product is Decision Center's briefing. */}
          <Button variant="secondary" disabled title="Report export is not yet available">
            <Icon name="download" /> Export — not yet available
          </Button>
          <Dropdown
            selected=""
            options={[{ label: 'Share with team' }, { label: 'Schedule refresh' }, { label: 'Print' }]}
            onSelect={(val) => show(`${val} is not yet available`)}
            trigger={<IconButton icon="more" />}
          />
        </div>
      </div>

      <div className="mt-4">
        <ActiveInvBanner
          typeMeta={typeMeta}
          question={activeQuestion}
          proceedTo="/simulation"
          proceedLabel="Proceed to Simulation"
          proceedIcon="flow"
        />
      </div>

      <Tabs
        tabs={D.tabs.map((t, i) => ({ key: String(i), label: t }))}
        active={String(tab)}
        onChange={(k) => setTab(Number(k))}
      />

      <div key={tab} className="fade-in">
        {tab === 0 && (
          <>
            {answer && <AiAnswerCard question={activeQuestion} answer={answer} streamKey={activeType} />}
            <OverviewTab D={D} onGoTab={setTab} />
          </>
        )}
        {tab === 1 && <ContributionTab D={D} />}
        {tab === 2 && <DriversTab D={D} />}
        {tab === 3 && <SegmentsTab D={D} />}
        {tab === 4 && <RetailersTab D={D} />}
        {tab === 5 && <RegionsTab D={D} />}
        {tab === 6 && <SkuLevelTab D={D} />}
        {tab === 7 && <InsightsTab D={D} />}
      </div>
    </AppShell>
  )
}
