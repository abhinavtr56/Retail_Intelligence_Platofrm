export interface KpiTile {
  key: string;
  label: string;
  value: string;
  delta: string;
  deltaSub: string;
  trend: "up" | "down";
  tone: "neutral" | "danger" | "success";
  tint: string;
  icon: string;
}

export interface TopRiskAlert {
  title: string;
  desc: string;
  severity: "High" | "Medium" | "Low";
  ic: string;
  tone: "danger" | "warning" | "info";
}

export interface UnderperformingPromo {
  name: string;
  channel: string;
  period: string;
  roi: number;
  vsTarget: number;
  status: "Underperforming" | "On Track";
}

export interface PromoMixSlice {
  label: string;
  pct: number;
  color: string;
}

export interface CommandData {
  filters: { period: string; channel: string };
  kpis: KpiTile[];
  alert: { title: string; desc: string; severity: string };
  trend: {
    labels: string[];
    roi: number[];
    incSales: number[];
    tradeSpend: number[];
    targetROI: number[];
  };
  topRiskAlerts: TopRiskAlert[];
  topUnderperforming: UnderperformingPromo[];
  promoMix: PromoMixSlice[];
  totalSpend: string;
}
