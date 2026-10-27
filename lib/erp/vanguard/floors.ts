// The ERP team's names for the floors (the screens refer to BUMEX Audit as "AUD") and the line under each name.
export const floors: Record<string, { code: string; activity: string }> = {
  bumex_holding: { code: "HOLD", activity: "Holding · consolidation" },
  bumex_sa: { code: "SA", activity: "Tax & Legal" },
  bumex_audit: { code: "AUD", activity: "Audit" },
  bumex_advisory: { code: "ADV", activity: "Conseil" },
  bumex_mauritanie: { code: "MAU", activity: "Expertise comptable" },
  bumex_avocat: { code: "AVO", activity: "Cabinet d'avocats" },
  bumex_it: { code: "IT", activity: "Solutions IT" },
  bumex_maroc: { code: "MAR", activity: "Casablanca Finance City" },
  bumex_testing: { code: "TEST", activity: "Sous-sol · essais" }, // the test floor (0011)
};

// The floor code of a BUMEX One entity code (bumex_audit → AUD), for the screens.
export function floorCode(entityCode: string | null | undefined) {
  return entityCode ? (floors[entityCode]?.code ?? entityCode) : null;
}
