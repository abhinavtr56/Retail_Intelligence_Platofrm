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
