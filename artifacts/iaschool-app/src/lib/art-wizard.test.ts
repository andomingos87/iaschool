import { describe, expect, it } from "vitest";
import {
  artWizardSteps,
  initialArtSchoolId,
  studentSchoolInSession,
} from "./art-wizard";

describe("artWizardSteps", () => {
  it("uma escola, sem plataforma: Aluno e Modelo", () => {
    expect(artWizardSteps({ schoolCount: 1, platformAdmin: false })).toEqual([
      "aluno",
      "modelo",
    ]);
  });

  it("duas escolas: inclui Escola", () => {
    expect(artWizardSteps({ schoolCount: 2, platformAdmin: false })).toEqual([
      "aluno",
      "escola",
      "modelo",
    ]);
  });

  it("plataforma com uma escola ainda escolhe", () => {
    expect(artWizardSteps({ schoolCount: 1, platformAdmin: true })).toEqual([
      "aluno",
      "escola",
      "modelo",
    ]);
  });

  it("conta sem escola vê o passo para o aviso, sem opção vazia", () => {
    expect(artWizardSteps({ schoolCount: 0, platformAdmin: false })).toEqual([
      "aluno",
      "escola",
      "modelo",
    ]);
  });
});

describe("initialArtSchoolId", () => {
  it("trava na única escola da sessão, mesmo se o aluno apontar outra", () => {
    expect(
      initialArtSchoolId({
        membershipSchoolIds: ["esc-a"],
        visibleSchoolIds: ["esc-a", "esc-b"],
        platformAdmin: false,
        studentSchoolId: "esc-b",
      }),
    ).toBe("esc-a");
  });

  it("plataforma prefere a escola do aluno quando ela está visível", () => {
    expect(
      initialArtSchoolId({
        membershipSchoolIds: [],
        visibleSchoolIds: ["esc-a", "esc-b"],
        activeSchoolId: "esc-a",
        platformAdmin: true,
        studentSchoolId: "esc-b",
      }),
    ).toBe("esc-b");
  });

  it("sem aluno, usa a escola ativa", () => {
    expect(
      initialArtSchoolId({
        membershipSchoolIds: ["esc-a", "esc-b"],
        visibleSchoolIds: ["esc-a", "esc-b"],
        activeSchoolId: "esc-b",
        platformAdmin: false,
      }),
    ).toBe("esc-b");
  });

  it("não devolve escola fora da sessão", () => {
    expect(
      initialArtSchoolId({
        membershipSchoolIds: ["esc-a"],
        visibleSchoolIds: ["esc-a"],
        platformAdmin: false,
        studentSchoolId: "esc-z",
        activeSchoolId: "esc-z",
      }),
    ).toBe("esc-a");
  });
});

describe("studentSchoolInSession", () => {
  it("membro reconhece a própria escola", () => {
    expect(
      studentSchoolInSession({
        studentSchoolId: "esc-a",
        membershipSchoolIds: ["esc-a"],
        visibleSchoolIds: [],
        platformAdmin: false,
      }),
    ).toBe(true);
  });

  it("escola de fora não libera o passo", () => {
    expect(
      studentSchoolInSession({
        studentSchoolId: "esc-z",
        membershipSchoolIds: ["esc-a"],
        visibleSchoolIds: ["esc-z"],
        platformAdmin: false,
      }),
    ).toBe(false);
  });

  it("plataforma aceita escola que o RLS devolveu", () => {
    expect(
      studentSchoolInSession({
        studentSchoolId: "esc-z",
        membershipSchoolIds: [],
        visibleSchoolIds: ["esc-z"],
        platformAdmin: true,
      }),
    ).toBe(true);
  });
});
