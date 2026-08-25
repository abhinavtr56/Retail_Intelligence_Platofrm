import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardHeader, Pill } from '../components/ui'
import { Icon } from '../icons'
import { useSettings } from '../hooks/useMisc'
import { useCurrentUser } from '../hooks/useAuth'

/** Ported from js/pages/settings.js.
 *
 *  B9 — TWO CORRECTIONS.
 *
 *  IDENTITY. This card used to print "Sanjay Kumar · Commercial Analyst ·
 *  sanjay.k@company.com" from settings.json, beside the initials of whoever
 *  had actually signed in — two different people on one card. The only
 *  identity this application can honestly show is the one the visitor typed
 *  at sign-in, so that is what it shows now, labelled for what it is. A role
 *  is not shown at all: there is no authorization model to source one from.
 *
 *  INTEGRATIONS. The three rows used to carry a green tick and an "Active"
 *  pill. None of them exists — there is no identity provider, no Slack
 *  connection and no mail sender anywhere in this project. They are listed as
 *  Not connected. */
export function Settings() {
  const { data: D, isLoading } = useSettings()
  const { data: user } = useCurrentUser()
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
                <div className="text-base font-extrabold text-ink-primary">{user?.name}</div>
                <div className="truncate text-sm text-ink-muted">
                  {user?.email || 'No email recorded'}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  Signed in locally — this application has no identity provider, so nothing
                  here is verified.
                </div>
              </div>
              <Button variant="secondary" size="sm" disabled title="Editing a profile is not yet available">
                <Icon name="edit" /> Edit — not yet available
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
                <span className="grid place-items-center text-ink-muted [&_svg]:h-[18px] [&_svg]:w-[18px]">
                  <Icon name="x" />
                </span>
                <span className="font-semibold text-ink-secondary">{i}</span>
                <Pill tone="neutral" className="ml-auto">
                  Not connected
                </Pill>
              </div>
            ))}
            <div className="mt-2 border-t border-border-subtle pt-3 text-[11.5px] leading-[1.5] text-ink-muted">
              None of these is connected. Sign-in is a local stand-in with no identity
              provider behind it, and this application sends no notification of any kind.
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
