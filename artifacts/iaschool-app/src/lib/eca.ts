/**
 * Regras de conformidade com o ECA Digital (Lei nº 15.211/2025 e Decreto
 * nº 12.880/2026) aplicadas ao IAschool.
 *
 * Este módulo é a única fonte das decisões etárias do produto. Nenhuma tela
 * deve reimplementar "menor de 16" ou "menor de 18" — importe daqui, para que
 * uma mudança de interpretação legal seja feita em um lugar só.
 *
 * Assessoria técnica de produto, não parecer jurídico.
 */

import type { Student } from "./data/types";
import { ageFromIso } from "./format";

/**
 * Idade a partir da qual a conta do usuário deixa de exigir vinculação à conta
 * de um responsável legal. Base: Lei 15.211/2025, art. 24, caput.
 *
 * Nota interpretativa: o art. 24 está no capítulo "Das redes sociais", mas o
 * caput alcança "produtos ou serviços direcionados a crianças e adolescentes
 * ou de acesso provável por eles". O IAschool adota a leitura conservadora e
 * aplica a regra. Decisão registrada aqui de propósito.
 */
export const AGE_ACCOUNT_LINK = 16;

/**
 * Idade a partir da qual a pessoa deixa de ser criança ou adolescente
 * (ECA, Lei 8.069/1990, art. 2º, referenciado pela Lei 15.211, art. 2º, § 1º).
 * Abaixo disso, gerar e compartilhar imagem exige autorização do responsável.
 */
export const AGE_MAJORITY = 18;

/** Idade em que termina a infância e começa a adolescência (ECA, art. 2º). */
export const AGE_ADOLESCENCE = 12;

export type AgeBracket = "crianca" | "adolescente" | "adulto";

/**
 * Faixa etária — é este o dado que o produto usa para decidir. A data de
 * nascimento exata fica restrita ao cadastro escolar e nunca é enviada ao
 * modelo de geração (Decreto 12.880/2026, art. 24, § 3º — minimização).
 */
export function ageBracket(birthDate?: string): AgeBracket | null {
  const age = ageFromIso(birthDate);
  if (age === null || age < 0) return null;
  if (age < AGE_ADOLESCENCE) return "crianca";
  if (age < AGE_MAJORITY) return "adolescente";
  return "adulto";
}

export const AGE_BRACKET_LABEL: Record<AgeBracket, string> = {
  crianca: "Criança (até 11 anos)",
  adolescente: "Adolescente (12 a 17 anos)",
  adulto: "Maior de 18 anos",
};

/** true quando a idade é conhecida e menor de 18. */
export function isMinor(birthDate?: string): boolean {
  const age = ageFromIso(birthDate);
  return age !== null && age < AGE_MAJORITY;
}

/**
 * Conta própria de menor de 16 precisa estar vinculada à conta de um
 * responsável legal (Lei 15.211/2025, art. 24).
 */
export function requiresGuardianAccount(birthDate?: string): boolean {
  const age = ageFromIso(birthDate);
  return age !== null && age < AGE_ACCOUNT_LINK;
}

/**
 * Gerar imagem a partir da foto de menor de 18 e compartilhá-la exige
 * autorização registrada do responsável legal.
 * Base: Lei 15.211/2025, arts. 6º, V e 7º, § 2º; LGPD, art. 14, § 1º.
 */
export function requiresGuardianConsent(birthDate?: string): boolean {
  return isMinor(birthDate);
}

/** Consentimento do responsável registrado (data presente). */
export function hasGuardianConsent(student: Pick<Student, "guardian">): boolean {
  return Boolean(student.guardian?.consentAt);
}

/** WhatsApp do responsável confirmado por código (canal verificado). */
export function hasVerifiedGuardianChannel(
  student: Pick<Student, "guardian">,
): boolean {
  return Boolean(student.guardian?.whatsappVerifiedAt);
}

export interface ComplianceIssue {
  /** Chave estável para testes e telemetria. */
  code:
    | "sem-data-nascimento"
    | "sem-responsavel"
    | "sem-consentimento"
    | "canal-nao-verificado";
  /** Texto exibido ao professor, em pt-BR. */
  message: string;
  /** Base legal citada na UI, para que a restrição não pareça arbitrária. */
  legalBasis: string;
}

/**
 * Impedimentos para **gerar** uma imagem com a foto do aluno.
 * Lista vazia = liberado. A ordem é a de correção pelo usuário.
 */
export function generationBlockers(
  student: Pick<Student, "birthDate" | "guardian">,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  if (!student.birthDate) {
    issues.push({
      code: "sem-data-nascimento",
      message:
        "Cadastre a data de nascimento do aluno. Sem ela não é possível saber qual proteção aplicar.",
      legalBasis: "Lei 15.211/2025, art. 10",
    });
    return issues;
  }
  if (!requiresGuardianConsent(student.birthDate)) return issues;
  if (!student.guardian?.name || !student.guardian?.whatsapp) {
    issues.push({
      code: "sem-responsavel",
      message:
        "Aluno menor de 18 anos precisa de um responsável legal cadastrado.",
      legalBasis: "Lei 15.211/2025, art. 24; LGPD, art. 14, § 1º",
    });
  }
  if (!hasGuardianConsent(student)) {
    issues.push({
      code: "sem-consentimento",
      message:
        "Registre a autorização do responsável para uso da imagem e dos dados do aluno.",
      legalBasis: "Lei 15.211/2025, art. 7º, § 2º; LGPD, art. 14, § 1º",
    });
  }
  return issues;
}

/**
 * Impedimentos para **compartilhar** a imagem gerada.
 * Mais estrito que a geração: além do consentimento, o canal de destino
 * precisa ser um número confirmado do responsável.
 * Base: Lei 15.211/2025, arts. 6º, V e 7º, § 2º; Decreto 12.880/2026, art. 35.
 */
export function shareBlockers(
  student: Pick<Student, "birthDate" | "guardian">,
): ComplianceIssue[] {
  const issues = generationBlockers(student);
  if (!student.birthDate || !requiresGuardianConsent(student.birthDate)) {
    return issues;
  }
  if (!hasVerifiedGuardianChannel(student)) {
    issues.push({
      code: "canal-nao-verificado",
      message:
        "Confirme o WhatsApp do responsável antes de enviar a imagem. O envio só é permitido para o número verificado.",
      legalBasis: "Decreto 12.880/2026, art. 35",
    });
  }
  return issues;
}

/**
 * Número de destino permitido para o compartilhamento.
 * Menor de 18: só o WhatsApp verificado do responsável.
 * Maior de 18: o próprio número do aluno.
 * Retorna null quando nenhum destino é permitido.
 */
export function allowedShareTarget(
  student: Pick<Student, "birthDate" | "guardian" | "whatsapp">,
): { whatsapp: string; label: string } | null {
  if (!student.birthDate) return null;
  if (!requiresGuardianConsent(student.birthDate)) {
    return student.whatsapp
      ? { whatsapp: student.whatsapp, label: "o próprio aluno" }
      : null;
  }
  if (shareBlockers(student).length > 0) return null;
  const g = student.guardian!;
  return { whatsapp: g.whatsapp, label: `${g.name} (responsável)` };
}

/**
 * Texto do selo aplicado à imagem exportada e à mensagem de compartilhamento.
 * Base: Decreto 12.880/2026, art. 11, I (transparência do caráter sintético).
 */
export const AI_DISCLOSURE_LABEL = "IMAGEM GERADA POR IA";
