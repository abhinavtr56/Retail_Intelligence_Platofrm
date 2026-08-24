import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { CalendarData } from '../types/calendar'
import type { ConnectionRow } from '../types/connections'
import type { SettingsData } from '../types/settings'

export function useCalendar() {
  return useQuery({ queryKey: ['calendar'], queryFn: () => apiFetch<CalendarData>('/calendar') })
}
// useReports() WAS HERE. It fetched the authored six-row list from
// GET /api/reports, which is now the Report Center's own listing with a
// different shape — so the hook was not merely unused, it was a trap: the next
// caller would have got an object where it expected an array. The Report Center
// is read through hooks/useReportCenter.ts instead.
export function useConnections() {
  return useQuery({ queryKey: ['connections'], queryFn: () => apiFetch<ConnectionRow[]>('/connections') })
}
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => apiFetch<SettingsData>('/settings') })
}
