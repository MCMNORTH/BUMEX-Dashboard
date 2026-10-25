// One person, one role (lib/erp/roles.ts): BUMEX One's roles become Vanguard's once, then BUMEX One's follows.
import { describe, expect, it } from "vitest";

import { bumexOneRoleFor, erpAccessFor } from "@/lib/erp/roles";
import type { AppRole } from "@/types/auth";

const person = (role: AppRole, more: { is_super_admin?: boolean; entity_code?: "bumex_audit" | null } = {}) => ({
  id: "x",
  role,
  entity_code: "bumex_audit" as const,
  is_super_admin: false,
  ...more,
});

describe("one person, one role", () => {
  it("gives everyone a Vanguard role from their BUMEX One role", () => {
    expect(erpAccessFor(person("admin"))).toEqual({ role: "admin", entityCodes: null, modules: null });
    expect(erpAccessFor(person("employee", { is_super_admin: true }))).toEqual({ role: "admin", entityCodes: null, modules: null });
    expect(erpAccessFor(person("manager"))).toEqual({ role: "manager", entityCodes: ["bumex_audit"], modules: null });
    expect(erpAccessFor(person("supervisor"))).toEqual({ role: "manager", entityCodes: ["bumex_audit"], modules: null });
    expect(erpAccessFor(person("employee"))).toEqual({ role: "staff", entityCodes: ["bumex_audit"], modules: null });
    expect(erpAccessFor(person("employee", { entity_code: null }))).toEqual({ role: "staff", entityCodes: null, modules: null });
    // shareholders: staff who see the reports, of every entity
    expect(erpAccessFor(person("shareholder"))).toEqual({ role: "staff", entityCodes: null, modules: ["reports"] });
  });

  it("then BUMEX One's role follows Vanguard's", () => {
    expect(bumexOneRoleFor({ role: "admin", modules: null })).toBe("admin");
    expect(bumexOneRoleFor({ role: "partner", modules: null })).toBe("admin");
    expect(bumexOneRoleFor({ role: "raf", modules: null })).toBe("admin");
    expect(bumexOneRoleFor({ role: "manager", modules: null })).toBe("manager");
    expect(bumexOneRoleFor({ role: "accountant", modules: null })).toBe("employee");
    expect(bumexOneRoleFor({ role: "staff", modules: null })).toBe("employee");
    expect(bumexOneRoleFor({ role: "intern", modules: null })).toBe("employee");
    expect(bumexOneRoleFor({ role: "staff", modules: ["reports"] })).toBe("shareholder");
    expect(bumexOneRoleFor({ role: "staff", modules: ["reports", "archives"] })).toBe("employee");
  });

  it("round trip: a BUMEX One role comes back the same (supervisors become managers)", () => {
    for (const role of ["admin", "manager", "employee", "shareholder"] as AppRole[]) {
      expect(bumexOneRoleFor(erpAccessFor(person(role)))).toBe(role);
    }
    expect(bumexOneRoleFor(erpAccessFor(person("supervisor")))).toBe("manager");
  });
});
