import { describe, expect, it } from "vitest";
import { changeReviewSelection, reconcileReviewSelection, reviewSelectionBatch } from "./review-selection";

const context = "evento-1:aluno-1";
function initial() {
  return reconcileReviewSelection(undefined, context, ["alta", "ambigua"], ["alta"]);
}

describe("seleção humana de sugestões", () => {
  it("inicia alta confiança marcada e ambígua desmarcada", () => {
    expect(reviewSelectionBatch(initial())).toEqual({ selected: ["alta"], deferred: ["ambigua"] });
  });
  it("seleciona todas incluindo ambíguas sem alterar outro cartão", () => {
    const original = initial();
    const other = reconcileReviewSelection(undefined, "evento-1:aluno-2", ["outra"], []);
    expect(reviewSelectionBatch(changeReviewSelection(original, "all", false)).selected).toEqual(["alta", "ambigua"]);
    expect(reviewSelectionBatch(original).selected).toEqual(["alta"]);
    expect(reviewSelectionBatch(other).selected).toEqual([]);
  });
  it("desmarca todas e separa as adiadas", () => {
    expect(reviewSelectionBatch(changeReviewSelection(initial(), "none", false))).toEqual({ selected: [], deferred: ["alta", "ambigua"] });
  });
  it("permite alternar somente sugestões exibidas", () => {
    const state = initial();
    expect(changeReviewSelection(state, { toggle: "fora" }, false)).toBe(state);
    const selected = changeReviewSelection(state, { toggle: "ambigua" }, false);
    expect(reviewSelectionBatch(selected).selected).toEqual(["alta", "ambigua"]);
    expect(reviewSelectionBatch(changeReviewSelection(selected, { toggle: "alta" }, false)).selected).toEqual(["ambigua"]);
  });
  it("bloqueia todos os comandos durante confirmação", () => {
    const state = initial();
    for (const command of ["all", "none", { toggle: "alta" }] as const) {
      expect(changeReviewSelection(state, command, true)).toBe(state);
    }
  });
  it("não seleciona fotos novas depois de selecionar todas, mesmo com alta confiança", () => {
    const selected = changeReviewSelection(initial(), "all", false);
    const updated = reconcileReviewSelection(selected, context, ["alta", "ambigua", "nova"], ["alta", "nova"]);
    expect(reviewSelectionBatch(updated)).toEqual({ selected: ["alta", "ambigua"], deferred: ["nova"] });
  });
  it("remove IDs que saíram e não reaproveita seleção se voltarem", () => {
    const selected = changeReviewSelection(initial(), "all", false);
    const removed = reconcileReviewSelection(selected, context, ["ambigua"], []);
    const returned = reconcileReviewSelection(removed, context, ["alta", "ambigua"], ["alta"]);
    expect(reviewSelectionBatch(returned).selected).toEqual(["ambigua"]);
  });
  it.each(["evento-2:aluno-1", "evento-1:aluno-2"])("descarta seleção anterior em %s", (newContext) => {
    const selected = changeReviewSelection(initial(), "all", false);
    const updated = reconcileReviewSelection(selected, newContext, ["alta", "ambigua"], ["alta"]);
    expect(reviewSelectionBatch(updated).selected).toEqual(["alta"]);
  });
  it("lista vazia zera seleção; IDs ausentes não entram na inicialização", () => {
    expect(reviewSelectionBatch(reconcileReviewSelection(initial(), context, [], []))).toEqual({ selected: [], deferred: [] });
    expect(reviewSelectionBatch(reconcileReviewSelection(undefined, context, ["alta"], ["fora"])).selected).toEqual([]);
  });
  it("mantém estado estável com a mesma lista e preserva seleção ao reordenar", () => {
    const state = initial();
    expect(reconcileReviewSelection(state, context, ["alta", "ambigua"], ["alta"])).toBe(state);
    expect(reviewSelectionBatch(reconcileReviewSelection(state, context, ["ambigua", "alta"], ["alta"])).selected).toEqual(["alta"]);
  });
});
