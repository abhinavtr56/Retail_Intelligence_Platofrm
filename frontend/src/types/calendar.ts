export interface CalendarEvent {
  date: string
  name: string
  type: 'review' | 'launch' | 'extension' | 'closure' | 'data'
  channel: string
}

export interface CalendarData {
  events: CalendarEvent[]
}
