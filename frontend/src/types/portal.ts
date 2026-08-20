import type { IconName } from '../icons'

export interface PortalModule {
  key: string
  title: string
  desc: string
  icon: IconName
  tint: string
  live: boolean
  href?: string
}

export type ConnectorSpecial = 'azure' | 'databricks' | 'sap' | 'powerbi' | 'nielsen'

export interface PortalConnector {
  key: string
  name: string
  desc: string
  logo: string
  on: boolean
  detail?: string
  upload?: boolean
  special?: ConnectorSpecial
}

export interface PortalUser {
  name: string
  initials: string
  email: string
  role?: string
}

// POST /auth/login's response — mirrors backend/app/routers/auth.py's LoginResponse.
export interface LoginResult {
  user: PortalUser
  isNewAccount: boolean
}
