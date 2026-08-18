import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardHeader, Pill } from '../components/ui'
import { Icon } from '../icons'
import { useSettings } from '../hooks/useMisc'
import { useUser } from '../hooks/useNav'

// Ported from js/pages/settings.js.
export function Settings() {
  const { data: D, isLoading } = useSettings()
  const { data: user } = useUser()
  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Settings' }]

  if (isLoading || !D) {
    return (
      <AppShell activeKey="settings" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Settings…</div>
      </AppShell>
    )
  }

  return (
    <AppShell activeKey="settings" crumbs={crumbs}>
      <div className="fade-in mb-5">
        <h1>Settings</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Profile, preferences and integrations</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader title="Profile" />
          <div className="p-5">
            <div className="mb-3.5 flex items-center gap-3.5 border-b border-border-subtle pb-4">
              <div className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C5CFF,#4F7CFF)] text-lg font-extrabold text-white">
                {user?.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-extrabold text-ink-primary">{D.profile.name}</div>
                <div className="text-sm text-ink-muted">
                  {D.profile.role} · {D.profile.email}
                </div>
              </div>
              <Button variant="secondary" size="sm">
                <Icon name="edit" /> Edit
              </Button>
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between border-b border-dashed border-border-subtle py-2.5 text-[13px]">
                <span className="text-ink-muted">Region</span>
                <span className="font-bold text-ink-primary">{D.profile.region}</span>
              </div>
              <div className="flex justify-between py-2.5 text-[13px]">
                <span className="text-ink-muted">Timezone</span>
                <span className="font-bold text-ink-primary">{D.profile.timezone}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="fade-in">
          <CardHeader title="Preferences" />
          <div className="flex flex-col p-5">
            {[
              ['Theme', D.preferences.theme],
              ['Density', D.preferences.density],
              ['Default Period', D.preferences.defaultPeriod],
              ['Default Channel', D.preferences.defaultChannel],
            ].map(([k, v], i, arr) => (
              <div key={k} className={`flex justify-between py-2.5 text-[13px] ${i < arr.length - 1 ? 'border-b border-dashed border-border-subtle' : ''}`}>
                <span className="text-ink-muted">{k}</span>
                <span className="font-bold text-ink-primary">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="fade-in col-span-2 max-[900px]:col-span-1">
          <CardHeader title="Integrations" />
          <div className="flex flex-col p-5">
            {D.integrations.map((i, idx, arr) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 py-3 text-[13px] ${idx < arr.length - 1 ? 'border-b border-border-subtle' : ''}`}
              >
                <span className="grid place-items-center text-status-success [&_svg]:h-[18px] [&_svg]:w-[18px]">
                  <Icon name="checkCircle" />
                </span>
                <span className="font-semibold text-ink-primary">{i}</span>
                <Pill tone="success" dot className="ml-auto">
                  Active
                </Pill>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
