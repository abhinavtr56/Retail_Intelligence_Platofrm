export interface ConnectionRow {
  name: string
  desc: string
  status: 'Connected' | 'Available'
  rows?: string
  freshness?: string
  logo: string
}
