import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AGE_ACCOUNT_LINK,
  ageBracket,
  allowedShareTarget,
  generationBlockers,
  isMinor,
  requiresGuardianAccount,
  requiresGuardianConsent,
  shareBlockers,
} from "./eca";
import type { Guardian, Student } from "./data/types";

// Data fixa: as regras são etárias e não podem depender do dia da execução.
const TODAY = new Date("2026-08-28T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Data de nascimento ISO para alguém com exatamente `years` anos hoje. */
function bornYearsAgo(years: number): string {
  const d = new Date(TODAY);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function student(
  birthDate?: string,
  guardian?: Partial<Guardian>,
): Pick<Student, "birthDate" | "guardian" | "whatsapp"> {
  return {
    birthDate,
    whatsapp: "5511999998888",
    guardian: guardian
      ? {
          name: "Maria Silva",
          whatsapp: "5511911112222",
          ...guardian,
        }
      : undefined,
  };
}

const FULL_GUARDIAN: Partial<Guardian> = {
  consentAt: "2026-08-01T10:00:00.000Z",
  whatsappVerifiedAt: "2026-08-01T10:05:00.000Z",
};

describe("ageBracket", () => {
  it("classifica criança, adolescente e adulto pelas faixas do ECA", () => {
    expect(ageBracket(bornYearsAgo(7))).toBe("crianca");
    expect(ageBracket(bornYearsAgo(11))).toBe("crianca");
    expect(ageBracket(bornYearsAgo(12))).toBe("adolescente");
    expect(ageBracket(bornYearsAgo(17))).toBe("adolescente");
    expect(ageBracket(bornYearsAgo(18))).toBe("adulto");
    expect(ageBracket(bornYearsAgo(40))).toBe("adulto");
  });

  it("devolve null sem data ou com data inválida", () => {
    expect(ageBracket(undefined)).toBeNull();
    expect(ageBracket("")).toBeNull();
    expect(ageBracket("não é data")).toBeNull();
  });
});

describe("cortes etários", () => {
  it("isMinor separa em 18 anos", () => {
    expect(isMinor(bornYearsAgo(17))).toBe(true);
    expect(isMinor(bornYearsAgo(18))).toBe(false);
    expect(isMinor(undefined)).toBe(false);
  });

  it("vínculo com responsável é exigido abaixo de 16 (Lei, art. 24)", () => {
    expect(requiresGuardianAccount(bornYearsAgo(AGE_ACCOUNT_LINK - 1))).toBe(true);
    expect(requiresGuardianAccount(bornYearsAgo(AGE_ACCOUNT_LINK))).toBe(false);
    expect(requiresGuardianAccount(bornYearsAgo(17))).toBe(false);
  });

  it("consentimento para imagem é exigido abaixo de 18", () => {
    expect(requiresGuardianConsent(bornYearsAgo(17))).toBe(true);
    expect(requiresGuardianConsent(bornYearsAgo(18))).toBe(false);
  });
});

describe("generationBlockers", () => {
  it("bloqueia quando não há data de nascimento", () => {
    const issues = generationBlockers(student(undefined));
    expect(issues.map((i) => i.code)).toEqual(["sem-data-nascimento"]);
  });

  it("libera adulto sem responsável", () => {
    expect(generationBlockers(student(bornYearsAgo(30)))).toEqual([]);
  });

  it("bloqueia menor sem responsável cadastrado", () => {
    const issues = generationBlockers(student(bornYearsAgo(10)));
    expect(issues.map((i) => i.code)).toEqual([
      "sem-responsavel",
      "sem-consentimento",
    ]);
  });

  it("bloqueia menor com responsável mas sem consentimento", () => {
    const issues = generationBlockers(student(bornYearsAgo(10), {}));
    expect(issues.map((i) => i.code)).toEqual(["sem-consentimento"]);
  });

  it("libera menor com responsável e consentimento", () => {
    const issues = generationBlockers(
      student(bornYearsAgo(10), { consentAt: "2026-08-01T10:00:00.000Z" }),
    );
    expect(issues).toEqual([]);
  });

  it("cita a base legal em cada impedimento", () => {
    for (const issue of generationBlockers(student(bornYearsAgo(10)))) {
      expect(issue.legalBasis).toMatch(/Lei 15\.211|LGPD/);
    }
  });
});

describe("shareBlockers", () => {
  it("é mais estrito que a geração: exige canal verificado", () => {
    const s = student(bornYearsAgo(10), {
      consentAt: "2026-08-01T10:00:00.000Z",
    });
    expect(generationBlockers(s)).toEqual([]);
    expect(shareBlockers(s).map((i) => i.code)).toEqual(["canal-nao-verificado"]);
  });

  it("libera quando consentimento e verificação existem", () => {
    expect(shareBlockers(student(bornYearsAgo(10), FULL_GUARDIAN))).toEqual([]);
  });

  it("não exige verificação para maior de 18", () => {
    expect(shareBlockers(student(bornYearsAgo(25)))).toEqual([]);
  });
});

describe("allowedShareTarget", () => {
  it("menor autorizado: destino é o WhatsApp do responsável, nunca o do aluno", () => {
    const target = allowedShareTarget(student(bornYearsAgo(10), FULL_GUARDIAN));
    expect(target).toEqual({
      whatsapp: "5511911112222",
      label: "Maria Silva (responsável)",
    });
  });

  it("menor sem canal verificado não tem destino permitido", () => {
    const target = allowedShareTarget(
      student(bornYearsAgo(10), { consentAt: "2026-08-01T10:00:00.000Z" }),
    );
    expect(target).toBeNull();
  });

  it("maior de 18: destino é o próprio aluno", () => {
    const target = allowedShareTarget(student(bornYearsAgo(30)));
    expect(target).toEqual({
      whatsapp: "5511999998888",
      label: "o próprio aluno",
    });
  });

  it("sem data de nascimento não há destino permitido", () => {
    expect(allowedShareTarget(student(undefined))).toBeNull();
  });
});
