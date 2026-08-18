export interface SettingsData {
  profile: { name: string; role: string; email: string; region: string; timezone: string }
  preferences: { theme: string; density: string; defaultPeriod: string; defaultChannel: string }
  integrations: string[]
}
