import { describe, expect, it } from "vitest";
import { appEntry } from "./auth-entry";

const base = { role: "user" as const, approvalStatus: "approved" as const, schools: [{ schoolId: "a" }] };

describe("appEntry", () => {
  it("pendente fica na espera", () => {
    expect(appEntry({ ...base, approvalStatus: "pending", schools: [] })).toBe("pending");
  });

  it("recusada fica na espera", () => {
    expect(appEntry({ ...base, approvalStatus: "rejected" })).toBe("pending");
  });

  it("aprovada sem escola não entra no app", () => {
    expect(appEntry({ ...base, schools: [] })).toBe("unlinked");
  });

  it("plataforma sem escola entra", () => {
    expect(appEntry({ ...base, role: "super_admin", schools: [] })).toBe("app");
    expect(appEntry({ ...base, role: "dev", schools: [] })).toBe("app");
  });

  it("membro de escola entra", () => {
    expect(appEntry(base)).toBe("app");
  });
});