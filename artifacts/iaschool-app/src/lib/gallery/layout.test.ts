import { describe, expect, it } from "vitest";
import { columnsForWidth, indicesForRows, rowCount, rowHeight } from "./layout";

describe("layout da galeria", () => {
  it("colunas seguem os breakpoints da grade (3 / 4 / 6 / 8)", () => {
    expect(columnsForWidth(320)).toBe(3);
    expect(columnsForWidth(639)).toBe(3);
    expect(columnsForWidth(640)).toBe(4);
    expect(columnsForWidth(767)).toBe(4);
    expect(columnsForWidth(768)).toBe(6);
    expect(columnsForWidth(1023)).toBe(6);
    expect(columnsForWidth(1024)).toBe(8);
    expect(columnsForWidth(1900)).toBe(8);
  });

  it("2.000 fotos em 8 colunas são 250 linhas; última linha incompleta conta", () => {
    expect(rowCount(2000, 8)).toBe(250);
    expect(rowCount(2001, 8)).toBe(251);
    expect(rowCount(0, 8)).toBe(0);
    expect(rowCount(5, 0)).toBe(0);
  });

  it("altura da linha é célula quadrada + espaçamento", () => {
    // 1024px, 8 colunas, gap 8: (1024 - 56) / 8 = 121 + 8
    expect(rowHeight(1024, 8, 8)).toBe(129);
    expect(rowHeight(0, 8)).toBe(0);
  });

  it("faixa de índices respeita as bordas", () => {
    expect(indicesForRows(0, 0, 8, 2000)).toEqual([0, 8]);
    expect(indicesForRows(2, 4, 8, 2000)).toEqual([16, 40]);
    expect(indicesForRows(249, 249, 8, 2000)).toEqual([1992, 2000]);
    expect(indicesForRows(250, 260, 8, 2001)).toEqual([2000, 2001]);
    expect(indicesForRows(300, 310, 8, 2001)).toEqual([0, 0]);
    expect(indicesForRows(3, 1, 8, 2001)).toEqual([0, 0]);
  });
});
