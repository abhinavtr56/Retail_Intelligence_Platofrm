import { AppShell } from '../components/layout/AppShell'
import { Button, Card, CardHeader, CardBody, IconButton } from '../components/ui'
import { Icon } from '../icons'
import { useCalendar } from '../hooks/useMisc'
import type { CalendarEvent } from '../types/calendar'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TYPE_COLOR: Record<CalendarEvent['type'], string> = {
  review: 'var(--status-info)',
  launch: 'var(--status-success)',
  extension: 'var(--status-warning)',
  closure: 'var(--text-muted)',
  data: 'var(--brand-violet)',
}

// Ported from js/pages/calendar.js — a 28-day mini grid starting 2025-06-16, with
// events plotted from real data, plus an upcoming-events list.
export function Calendar() {
  const { data: D, isLoading } = useCalendar()
  const crumbs = [{ label: 'TPO Intelligence' }, { label: 'Calendar' }]

  if (isLoading || !D) {
    return (
      <AppShell activeKey="calendar" crumbs={crumbs}>
        <div className="grid min-h-[60vh] place-items-center text-sm text-ink-muted">Loading Calendar…</div>
      </AppShell>
    )
  }

  const startDay = new Date('2025-06-16T00:00:00')
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(startDay)
    d.setDate(startDay.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    return { day: d.getDate(), events: D.events.filter((e) => e.date === iso) }
  })

  return (
    <AppShell activeKey="calendar" crumbs={crumbs}>
      <div className="fade-in mb-5 flex items-end justify-between gap-4">
        <div>
          <h1>Promotion Calendar</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Plan, track and align promotional activity across regions and channels</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <Icon name="calendar" /> June – July 2025 <Icon name="chevronDown" />
          </Button>
          <Button variant="primary">
            <Icon name="plus" /> Add Event
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1.8fr_1fr] gap-4 max-[1280px]:grid-cols-1">
        <Card className="fade-in">
          <CardHeader
            title="June – July 2025"
            actions={
              <div className="flex items-center gap-1.5">
                <IconButton icon="chevronLeft" />
                <IconButton icon="chevronRight" />
              </div>
            }
          />
          <CardBody>
            <div className="mb-2 grid grid-cols-7 gap-1 px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((cell, i) => (
                <div
                  key={i}
                  className={`flex min-h-[92px] flex-col gap-1 rounded-[var(--r-md)] border p-[6px_8px] ${
                    cell.events.length ? 'border-brand-violet-50 bg-[linear-gradient(180deg,var(--brand-violet-50),var(--surface-card)_40%)]' : 'border-border-subtle bg-surface-card'
                  }`}
                >
                  <div className="text-[11px] font-bold text-ink-secondary">{cell.day}</div>
                  {cell.events.map((ev) => {
                    const color = TYPE_COLOR[ev.type]
                    return (
                      <div
                        key={ev.name}
                        className="rounded-[4px] p-[4px_6px] text-[10.5px] font-semibold leading-[1.3]"
                        style={{ background: `${color}22`, color, borderLeft: `3px solid ${color}` }}
                      >
                        {ev.name}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card className="fade-in">
          <CardHeader title="Upcoming Events" />
          <div className="px-4.5 py-1.5">
            {D.events.slice(0, 6).map((e) => {
              const color = TYPE_COLOR[e.type]
              const d = new Date(e.date)
              return (
                <div key={e.name} className="grid grid-cols-[48px_1fr] items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
                  <div className="rounded-[var(--r-sm)] bg-brand-violet-50 p-1.5 text-center">
                    <div className="text-base font-extrabold text-brand-violet [font-variant-numeric:tabular-nums]">{d.getDate()}</div>
                    <div className="text-[9px] font-bold uppercase text-brand-violet">{d.toLocaleString('en-US', { month: 'short' })}</div>
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-ink-primary">{e.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-semibold capitalize" style={{ background: `${color}22`, color }}>
                        {e.type}
                      </span>
                      <span className="text-xs text-ink-muted">Channel: {e.channel}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
