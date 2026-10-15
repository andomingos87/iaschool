// Testes de unidade da regra fixa de preservação da pessoa (S02, ART-05).
// O servidor precisa garantir a regra mesmo quando o prompt chega sem ela,
// e não pode duplicá-la quando o app já a enviou.
import { describe, expect, it } from "vitest";
import { PROTECTION_RULE, ensureProtectionRule, personEditConflict } from "../src/lib/art-protection";

describe("ensureProtectionRule", () => {
  it("prepende a regra quando o prompt não a contém", () => {
    const out = ensureProtectionRule("Crie uma arte com a foto do aluno.");
    expect(out.startsWith(PROTECTION_RULE)).toBe(true);
    expect(out).toContain("Crie uma arte com a foto do aluno.");
  });

  it("não duplica a regra quando o cliente já a incluiu", () => {
    const prompt = `${PROTECTION_RULE} Crie uma arte.`;
    const out = ensureProtectionRule(prompt);
    expect(out).toBe(prompt);
    expect(out.split(PROTECTION_RULE).length - 1).toBe(1);
  });

  it("mantém a regra à frente de instrução conflitante de texto livre", () => {
    const out = ensureProtectionRule("Troque a roupa do aluno por outra.");
    const ruleIndex = out.indexOf(PROTECTION_RULE);
    const conflictIndex = out.indexOf("Troque a roupa");
    expect(ruleIndex).toBe(0);
    expect(ruleIndex).toBeLessThan(conflictIndex);
  });
});

 it("recusa mudança da pessoa e permite alterações do fundo", () => {
   expect(personEditConflict(`${PROTECTION_RULE} Troque a roupa do aluno`)).toBe(true);
   expect(personEditConflict(`${PROTECTION_RULE} Troque o texto da arte`)).toBe(false);
   expect(personEditConflict(`${PROTECTION_RULE} Mude a expressão`)).toBe(true);
 });
