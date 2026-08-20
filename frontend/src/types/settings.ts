export interface SettingsData {
  /** Workspace preferences only. B9 removed the hard-coded name, email and
   *  role: this application has no identity system, so the only honest
   *  identity is the one the visitor signed in with. */
  profile: { region: string; timezone: string }
  preferences: { theme: string; density: string; defaultPeriod: string; defaultChannel: string }
  integrations: string[]
}
