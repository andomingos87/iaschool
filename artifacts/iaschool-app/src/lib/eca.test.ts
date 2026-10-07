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

const RECOGNIZE = { biometricSortingActive: true };
const RECOGNIZE_AND_SEND = {
  biometricSortingActive: true,
  deliveryAccepted: true,
};

describe("generationBlockers", () => {
  it("bloqueia quando não há data de nascimento", () => {
    const issues = generationBlockers(student(undefined));
    expect(issues.map((i) => i.code)).toEqual(["sem-data-nascimento"]);
  });

  it("libera adulto sem responsável", () => {
    expect(generationBlockers(student(bornYearsAgo(30)))).toEqual([]);
  });

  it("bloqueia menor sem responsável e sem reconhecimento", () => {
    const issues = generationBlockers(student(bornYearsAgo(10)));
    expect(issues.map((i) => i.code)).toEqual([
      "sem-responsavel",
      "sem-reconhecimento",
    ]);
  });

  it("consentAt antigo não libera a geração", () => {
    const issues = generationBlockers(
      student(bornYearsAgo(10), { consentAt: "2026-08-01T10:00:00.000Z" }),
    );
    expect(issues.map((i) => i.code)).toEqual(["sem-reconhecimento"]);
  });

  it("libera menor com responsável e reconhecimento ativo", () => {
    const issues = generationBlockers(student(bornYearsAgo(10), {}), RECOGNIZE);
    expect(issues).toEqual([]);
  });

  it("cita a base legal em cada impedimento", () => {
    for (const issue of generationBlockers(student(bornYearsAgo(10)))) {
      expect(issue.legalBasis).toMatch(/Lei 15\.211|LGPD/);
    }
  });
});

describe("shareBlockers", () => {
  it("exige aceite de envio e canal verificado, mesmo com reconhecimento", () => {
    const s = student(bornYearsAgo(10), {});
    expect(generationBlockers(s, RECOGNIZE)).toEqual([]);
    expect(shareBlockers(s, { ...RECOGNIZE, deliveryAccepted: false }).map((i) => i.code)).toEqual([
      "sem-aceite-envio",
      "canal-nao-verificado",
    ]);
  });

  it("aceite sem canal verificado continua bloqueado", () => {
    const s = student(bornYearsAgo(10), {});
    expect(
      shareBlockers(s, RECOGNIZE_AND_SEND).map((i) => i.code),
    ).toEqual(["canal-nao-verificado"]);
  });

  it("libera só com reconhecimento, aceite do responsável e canal verificado", () => {
    expect(
      shareBlockers(student(bornYearsAgo(10), FULL_GUARDIAN), RECOGNIZE_AND_SEND),
    ).toEqual([]);
  });

  it("consentAt e canal verificado não substituem o aceite de envio", () => {
    const s = student(bornYearsAgo(10), FULL_GUARDIAN);
    expect(
      shareBlockers(s, { biometricSortingActive: true, deliveryAccepted: false }).map(
        (i) => i.code,
      ),
    ).toEqual(["sem-aceite-envio"]);
  });

  it("não exige verificação para maior de 18", () => {
    expect(shareBlockers(student(bornYearsAgo(25)))).toEqual([]);
  });
});

describe("allowedShareTarget", () => {
  it("menor autorizado: destino é o WhatsApp do responsável, nunca o do aluno", () => {
    const target = allowedShareTarget(
      student(bornYearsAgo(10), FULL_GUARDIAN),
      RECOGNIZE_AND_SEND,
    );
    expect(target).toEqual({
      whatsapp: "5511911112222",
      label: "Maria Silva (responsável)",
    });
  });

  it("menor sem aceite de envio não tem destino permitido", () => {
    const target = allowedShareTarget(
      student(bornYearsAgo(10), FULL_GUARDIAN),
      { biometricSortingActive: true, deliveryAccepted: false },
    );
    expect(target).toBeNull();
  });

  it("maior de 18 não tem destino, mesmo com número antigo no cadastro", () => {
    expect(allowedShareTarget(student(bornYearsAgo(30)))).toBeNull();
  });

  it("sem data de nascimento não há destino permitido", () => {
    expect(allowedShareTarget(student(undefined))).toBeNull();
  });
});
