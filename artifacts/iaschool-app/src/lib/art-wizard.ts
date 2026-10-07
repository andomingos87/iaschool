// Passos do assistente de arte (specs 5 e 8).
// Uma escola na sessão, sem papel de plataforma: Aluno → Modelo.
// Várias escolas, ou plataforma: Aluno → Escola → Modelo.
// Não existe passo de logo nem geração sem escola.

export type ArtWizardStep = "aluno" | "escola" | "modelo";

export function artWizardSteps(input: {
  schoolCount: number;
  platformAdmin: boolean;
}): ArtWizardStep[] {
  const chooseSchool = input.platformAdmin || input.schoolCount !== 1;
  return chooseSchool ? ["aluno", "escola", "modelo"] : ["aluno", "modelo"];
}

/**
 * Escola da geração. Uma escola na sessão trava nesse id.
 * Com escolha, vale a escola do aluno (se estiver na sessão), senão a ativa,
 * senão a primeira visível. Nunca devolve uma escola fora da sessão.
 */
export function initialArtSchoolId(input: {
  membershipSchoolIds: readonly string[];
  visibleSchoolIds: readonly string[];
  activeSchoolId?: string;
  platformAdmin: boolean;
  studentSchoolId?: string | null;
}): string | null {
  if (!input.platformAdmin && input.membershipSchoolIds.length === 1) {
    return input.membershipSchoolIds[0] ?? null;
  }
  const allowed = allowedSchoolIds(input);
  if (input.studentSchoolId && allowed.has(input.studentSchoolId)) {
    return input.studentSchoolId;
  }
  if (input.activeSchoolId && allowed.has(input.activeSchoolId)) {
    return input.activeSchoolId;
  }
  if (input.platformAdmin) {
    return input.visibleSchoolIds[0] ?? input.membershipSchoolIds[0] ?? null;
  }
  return input.membershipSchoolIds[0] ?? null;
}

/** A escola do aluno está na sessão. Plataforma também aceita a lista do RLS. */
export function studentSchoolInSession(input: {
  studentSchoolId: string;
  membershipSchoolIds: readonly string[];
  visibleSchoolIds: readonly string[];
  platformAdmin: boolean;
}): boolean {
  return allowedSchoolIds(input).has(input.studentSchoolId);
}

function allowedSchoolIds(input: {
  membershipSchoolIds: readonly string[];
  visibleSchoolIds: readonly string[];
  platformAdmin: boolean;
}): Set<string> {
  const ids = new Set(input.membershipSchoolIds);
  if (input.platformAdmin) {
    for (const id of input.visibleSchoolIds) ids.add(id);
  }
  return ids;
}
