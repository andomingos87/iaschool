import { expect, it } from "vitest";
import { referenceCoverage } from "./reference-coverage";
it("fila, erro e referência expirada não aumentam cobertura", () => {
  expect(referenceCoverage([], [{ status: "queued" }, { status: "leased" }, { status: "done" }, { status: "failed" }], true)).toEqual({ processed: 0, pending: 2 });
  expect(referenceCoverage([{ expired: true }, { expired: false }], [], true).processed).toBe(1);
  expect(referenceCoverage([{ expired: false }], [], false).processed).toBe(0);
});
