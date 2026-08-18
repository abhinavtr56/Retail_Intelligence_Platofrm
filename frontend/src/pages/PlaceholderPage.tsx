import { AppShell } from '../components/layout/AppShell'
import { Card, CardBody } from '../components/ui'
import { Icon, type IconName } from '../icons'

// Stand-in for the 8 pages Phase 4 builds out in full (Investigations, Promotion
// Intelligence, Simulation Studio, Decision Center, Calendar, Reports, Data
// Connections, Settings). Keeps every sidebar link real and clickable in the
// meantime instead of 404ing.
export function PlaceholderPage({
  activeKey,
  title,
  icon,
  description,
}: {
  activeKey: string
  title: string
  icon: IconName
  description: string
}) {
  return (
    <AppShell activeKey={activeKey} crumbs={[{ label: 'TPO Intelligence' }, { label: title }]}>
      <div className="fade-in-up flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-violet-50 text-brand-violet [&_svg]:h-8 [&_svg]:w-8">
          <Icon name={icon} />
        </div>
        <h1>{title}</h1>
        <Card className="max-w-md">
          <CardBody>
            <p className="text-sm text-ink-muted">{description}</p>
            <p className="mt-3 text-xs text-ink-disabled">Ported from the vanilla app in Phase 4 of the migration.</p>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  )
}
