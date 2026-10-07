import { z } from "zod";
import type { StudentInput } from "./data/contract";
import type { StoredImage, Student } from "./data/types";
import { ageBracket, requiresGuardianConsent } from "./eca";
import { brDateToIso, isValidWhatsapp, whatsappToStored } from "./format";

/** Radix Select não aceita valor vazio; "sem turma" precisa de um sentinela. */
export const NO_CLASS = "__none__";

/**
 * Cadastro do aluno. Não pede WhatsApp do aluno nem autorização.
 * Menor de 18 exige nome e WhatsApp do responsável: é o canal, não o aceite.
 * Base: Lei nº 15.211/2025, art. 24.
 */
export const studentFormSchema = z
  .object({
    name: z.string().min(2, "Informe o nome do aluno"),
    birthDate: z
      .string()
      .refine(
        (v) => ageBracket(brDateToIso(v)) !== null,
        "Informe uma data de nascimento válida (dd/mm/aaaa)",
      ),
    notes: z.string().optional(),
    enrollmentNumber: z.string().optional(),
    classId: z.string().optional(),
    guardianName: z.string().optional(),
    guardianWhatsapp: z.string().optional(),
    guardianEmail: z.string().optional(),
    guardianRelationship: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!requiresGuardianConsent(brDateToIso(v.birthDate))) return;
    if (!v.guardianName || v.guardianName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianName"],
        message: "Informe o nome do responsável legal",
      });
    }
    if (!v.guardianWhatsapp || !isValidWhatsapp(v.guardianWhatsapp)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianWhatsapp"],
        message: "WhatsApp do responsável inválido — use (11) 99999-9999",
      });
    }
  });

export type StudentFormValues = z.infer<typeof studentFormSchema>;

export const EMPTY_STUDENT_FORM: StudentFormValues = {
  name: "",
  birthDate: "",
  notes: "",
  enrollmentNumber: "",
  classId: NO_CLASS,
  guardianName: "",
  guardianWhatsapp: "",
  guardianEmail: "",
  guardianRelationship: "",
};

/**
 * Monta o responsável a partir do formulário.
 * Não grava nem apaga `consentAt`: o checkbox de autorização saiu do cadastro.
 * Trocar o número invalida a verificação do canal.
 */
export function buildGuardian(
  values: StudentFormValues,
  student: Student | null,
): Student["guardian"] {
  if (!requiresGuardianConsent(brDateToIso(values.birthDate))) return undefined;
  const previous = student?.guardian;
  const whatsapp = whatsappToStored(values.guardianWhatsapp!);
  const sameNumber = previous?.whatsapp === whatsapp;
  return {
    name: values.guardianName!.trim(),
    whatsapp,
    email: values.guardianEmail?.trim() || undefined,
    relationship: values.guardianRelationship?.trim() || undefined,
    consentAt: previous?.consentAt,
    consentRegisteredBy: previous?.consentRegisteredBy,
    whatsappVerifiedAt: sameNumber ? previous?.whatsappVerifiedAt : undefined,
  };
}

/**
 * Payload do aluno. Cadastro novo grava `whatsapp: null`.
 * Edição omite o campo para não regravar nem apagar o número antigo.
 */
export function buildStudentInput(
  values: StudentFormValues,
  student: Student | null,
  photos: StoredImage[],
): StudentInput {
  const payload: StudentInput = {
    name: values.name.trim(),
    birthDate: brDateToIso(values.birthDate) || undefined,
    notes: values.notes?.trim() || undefined,
    enrollmentNumber: values.enrollmentNumber?.trim() || undefined,
    classId: values.classId && values.classId !== NO_CLASS ? values.classId : undefined,
    guardian: buildGuardian(values, student),
    photos,
  };
  if (!student) payload.whatsapp = null;
  return payload;
}
