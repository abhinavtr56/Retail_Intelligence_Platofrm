export interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  badge?: string;
}

export interface NavData {
  navMain: NavItem[];
  navSecondary: NavItem[];
}

export interface User {
  name: string;
  role: string;
  initials: string;
}

export interface Focus {
  promotion: string;
  period: string;
  quarter: string;
  channel: string;
  region: string;
  spend: string;
}
