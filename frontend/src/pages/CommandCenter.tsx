import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCommand } from '../hooks/useCommand'
import { AppShell } from '../components/layout/AppShell'
import {
  Button,
  IconButton,
  Card,
  CardHeader,
  CardBody,
  Pill,
  TpoKpiGrid,
  TpoKpiTile,
  AlertBanner,
  RiskList,
  Table,
  Th,
  Td,
  Tr,
  Dropdown,
  LiveStatus,
  useLiveStatus,
  useToast,
} from '../components/ui'
import { Icon, type IconName } from '../icons'
import { ComboBarLine, DonutBreakdown } from '../components/charts'

const PERIODS = ['Q1 FY25 (Jan – Mar)', 'Q2 FY25 (Apr – Jun)', 'Q3 FY25 (Jul – Sep)', 'Q4 FY25 (Oct – Dec)', 'FY25 (Annual)']
const CHANNELS = ['All Channels', 'Modern Trade', 'General Trade', 'eCommerce', 'B2B']
const GRANULARITIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly']

// Ported from js/pages/command.js + js/components/{sidebar,topbar,charts}.js.
// Same data shape (D.kpis, D.alert, D.trend, D.topRiskAlerts, D.topUnderperforming,
// D.promoMix), same interactions (filters, refresh, row clicks -> Investigations),
// state-driven instead of imperative DOM rebuilds.
export function CommandCenter() {
  const { data, isLoading, isError, error, refetch, isFetching } = useCommand()
  const { show } = useToast()
  const navigate = useNavigate()
  const live = useLiveStatus()

  const [period, setPeriod] = useState('')
  const [channel, setChannel] = useState('')
  const [granularity, setGranularity] = useState('Weekly')

  useEffect(() => {
    if (data) {
      setPeriod(data.filters.period)
      setChannel(data.filters.channel)
    }
  }, [data])

  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Command Center' }]

  if (isLoading) {
    return (
      <AppShell activeKey="command" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Command Center…</div>
      </AppShell>
    )
  }

  if (isError || !data) {
    return (
      <AppShell activeKey="command" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-status-danger">
          Couldn't reach the backend: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      </AppShell>
    )
  }

  const goToInvestigation = (message: string) => {
    show(message, { duration: 1500 })
    window.setTimeout(() => navigate('/investigations'), 700)
  }

  const handleRefresh = () => {
    show('Refreshing all data sources...', { duration: 1500 })
    refetch().then(() => {
      live.reset()
      show('Data refreshed · all systems healthy', { duration: 2000 })
    })
  }

  return (
    <AppShell activeKey="command" crumbs={crumbs}>
      <div className="fade-in flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[30px] font-extrabold tracking-[-0.025em] leading-[1.1]">TPO Command Center</h1>
            <LiveStatus label={live.label} />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">Real-time overview of promotions, performance and risks</p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            selected={period}
            options={PERIODS.map((p) => ({ label: p }))}
            onSelect={(val) => {
              setPeriod(val)
              show(`Period set to ${val} · refreshing data...`, { duration: 2000 })
              live.reset()
            }}
            trigger={
              <Button variant="secondary" size="md" className="cursor-pointer">
                <Icon name="filter" />
                <span>{period}</span>
                <Icon name="chevronDown" />
              </Button>
            }
          />
          <Dropdown
            selected={channel}
            options={CHANNELS.map((c) => ({ label: c }))}
            onSelect={(val) => {
              setChannel(val)
              show(`Filtered to ${val}`, { duration: 2000 })
              live.reset()
            }}
            trigger={
              <Button variant="secondary" size="md" className="cursor-pointer">
                <Icon name="filter" />
                <span>{channel}</span>
                <Icon name="chevronDown" />
              </Button>
            }
          />
          <IconButton icon="refresh" title="Refresh data" spinning={isFetching} disabled={isFetching} onClick={handleRefresh} />
        </div>
      </div>

      <TpoKpiGrid>
        {data.kpis.map((k, i) => (
          <TpoKpiTile
            key={k.key}
            label={k.label}
            value={k.value}
            delta={k.delta}
            deltaSub={k.deltaSub}
            trend={k.trend}
            icon={k.icon as IconName}
            tint={k.tint}
            delayMs={i * 60}
          />
        ))}
      </TpoKpiGrid>

      <AlertBanner
        title={data.alert.title}
        desc={data.alert.desc}
        ctaTo="/investigations"
        onClick={() => navigate('/investigations')}
      />

      <div className="mt-[18px] grid grid-cols-[1.7fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-1.5">
                Promotion Performance Trend <Icon name="info" className="h-3.5 w-3.5 text-ink-muted" />
              </span>
            }
            actions={
              <div className="flex items-center gap-3">
                <Dropdown
                  selected={granularity}
                  options={GRANULARITIES.map((g) => ({ label: g }))}
                  onSelect={(val) => {
                    setGranularity(val)
                    show(`Trend granularity → ${val}`)
                  }}
                  trigger={
                    <Button variant="ghost" size="sm" className="cursor-pointer">
                      {granularity} <Icon name="chevronDown" />
                    </Button>
                  }
                />
                <IconButton icon="more" title="More options" />
              </div>
            }
          />
          <CardBody>
            <div className="mb-2 flex flex-wrap gap-4 pb-2">
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm" style={{ background: '#7C5CFF' }} />} label="ROI" />
              <LegendItem
                swatch={<span className="h-2.5 w-3.5 rounded-sm" style={{ background: '#B7CAFF' }} />}
                label="Incremental Sales (Cr)"
              />
              <LegendItem swatch={<span className="h-0.5 w-[18px] rounded-sm" style={{ background: '#EF4444' }} />} label="Trade Spend (Cr)" />
              <LegendItem
                swatch={<span className="h-0 w-[18px] border-t-2 border-dashed" style={{ borderColor: '#9CA3AF' }} />}
                label="Target ROI"
              />
            </div>
            <ComboBarLine
              labels={data.trend.labels}
              bars={{ values: data.trend.incSales, color: '#B7CAFF' }}
              lines={[
                { values: data.trend.roi, color: '#7C5CFF', axis: 'left' },
                { values: data.trend.tradeSpend, color: '#EF4444', axis: 'right' },
                { values: data.trend.targetROI, color: '#9CA3AF', axis: 'left', dashed: true },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Top Risk Alerts"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/investigations')} className="!px-0 !text-brand-violet">
                View All
              </Button>
            }
          />
          <CardBody className="px-4 py-1.5">
            <RiskList
              items={data.topRiskAlerts.map((r) => ({
                title: r.title,
                desc: r.desc,
                severity: r.severity,
                ic: r.ic as IconName,
                tone: r.tone,
              }))}
              onSelect={(r) => goToInvestigation(`Opening "${r.title}" investigation...`)}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-[18px] grid grid-cols-[1.7fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card>
          <CardHeader
            title="Top Underperforming Promotions"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/investigations')} className="!px-0 !text-brand-violet">
                View All
              </Button>
            }
          />
          <div className="overflow-x-auto rounded-b-[var(--r-lg)]">
            <Table>
              <thead>
                <tr>
                  <Th>Promotion Name</Th>
                  <Th>Channel</Th>
                  <Th>Period</Th>
                  <Th>ROI</Th>
                  <Th>vs Target</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.topUnderperforming.map((p) => (
                  <Tr key={p.name} onClick={() => goToInvestigation(`Drilling into "${p.name}"...`)}>
                    <Td emphasis>{p.name}</Td>
                    <Td>{p.channel}</Td>
                    <Td>{p.period}</Td>
                    <Td>{p.roi.toFixed(2)}</Td>
                    <Td className={p.vsTarget < 0 ? 'font-bold text-status-danger' : 'font-bold text-status-success'}>
                      {p.vsTarget > 0 ? '+' : ''}
                      {p.vsTarget.toFixed(1)}%
                    </Td>
                    <Td>
                      <Pill tone={p.status === 'On Track' ? 'success' : 'danger'} dot>
                        {p.status}
                      </Pill>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Promotion Mix by Type (Spend %)" actions={<span className="text-[13px] font-semibold text-brand-violet">View All</span>} />
          <CardBody>
            <DonutBreakdown
              segments={data.promoMix.map((p) => ({ key: p.label, pct: p.pct, color: p.color }))}
              size={168}
              stroke={26}
              centerValue={data.totalSpend}
              centerLabel="Total Spend"
            />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
      {swatch}
      {label}
    </span>
  )
}
