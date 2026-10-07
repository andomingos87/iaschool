import { describe, expect, it } from "vitest";
import {
  comboboxMatches,
  comboboxShowsSearch,
} from "../../../iaschool-ui/src/lib/combobox-filter";

describe("combobox", () => {
  it("busca ignora acento e maiúscula", () => {
    expect(comboboxMatches("3º ano", "3 ano", false)).toBe(true);
    expect(comboboxMatches("João", "joao", false)).toBe(true);
  });

  it("opção fixa não some no filtro", () => {
    expect(comboboxMatches("Sem turma", "maria", true)).toBe(true);
  });

  it("campo de busca só acima de 7 itens", () => {
    expect(comboboxShowsSearch(7)).toBe(false);
    expect(comboboxShowsSearch(8)).toBe(true);
  });
});
