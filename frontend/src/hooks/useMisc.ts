import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { CalendarData } from '../types/calendar'
import type { ReportRow } from '../types/reports'
import type { ConnectionRow } from '../types/connections'
import type { SettingsData } from '../types/settings'

export function useCalendar() {
  return useQuery({ queryKey: ['calendar'], queryFn: () => apiFetch<CalendarData>('/calendar') })
}
export function useReports() {
  return useQuery({ queryKey: ['reports'], queryFn: () => apiFetch<ReportRow[]>('/reports') })
}
export function useConnections() {
  return useQuery({ queryKey: ['connections'], queryFn: () => apiFetch<ConnectionRow[]>('/connections') })
}
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => apiFetch<SettingsData>('/settings') })
}
