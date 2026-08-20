// The four investigation archetypes — the single biggest structural driver
// of what data every downstream page (Intelligence/Simulation/Decision)
// returns. Mirrors backend/app/data_loader.py's InvestigationType exactly.
export type InvestigationType = "diagnostic" | "optimization" | "launch" | "strategic";

export const INVESTIGATION_TYPES: readonly InvestigationType[] = [
  "diagnostic",
  "optimization",
  "launch",
  "strategic",
];

// One entry in the shared, backend-persisted "recent investigations" list —
// mirrors backend/app/investigation_history.py's stored shape.
export interface RecentInvestigation {
  type: InvestigationType;
  question: string;
  at: number;
}

// POST /investigations/query's response — classification result plus the
// history it was just recorded into, so callers don't need a second
// round-trip to refresh their "recent" list.
export interface InvestigationQueryResult extends RecentInvestigation {
  history: RecentInvestigation[];
}
