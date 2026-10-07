import { describe, expect, it } from "vitest";
import type { Student } from "./data/types";
import { buildGuardian, buildStudentInput, studentFormSchema } from "./student-form";

const MINOR = {
  name: "Ana Costa",
  birthDate: "01/01/2016",
  notes: "",
  enrollmentNumber: "",
  classId: "__none__",
  guardianName: "Maria Silva",
  guardianWhatsapp: "(11) 91111-2222",
  guardianEmail: "",
  guardianRelationship: "mãe",
};

const ADULT = {
  ...MINOR,
  birthDate: "01/01/1990",
  guardianName: "",
  guardianWhatsapp: "",
};

describe("studentFormSchema", () => {
  it("menor salva sem checkbox de autorização", () => {
    const parsed = studentFormSchema.safeParse(MINOR);
    expect(parsed.success).toBe(true);
  });

  it("menor sem responsável não salva", () => {
    const parsed = studentFormSchema.safeParse({
      ...MINOR,
      guardianName: "",
      guardianWhatsapp: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("adulto não exige responsável", () => {
    expect(studentFormSchema.safeParse(ADULT).success).toBe(true);
  });
});

describe("buildStudentInput", () => {
  it("aluno novo grava whatsapp nulo e não grava consentAt", () => {
    const payload = buildStudentInput(MINOR, null, []);
    expect(payload.whatsapp).toBeNull();
    expect(payload.guardian?.whatsapp).toBe("5511911112222");
    expect(payload.guardian?.consentAt).toBeUndefined();
    expect(payload.guardian?.name).toBe("Maria Silva");
  });

  it("edição não regrava o número antigo do aluno e preserva o carimbo", () => {
    const previous = {
      id: "s1",
      name: "Ana Costa",
      whatsapp: "5511999998888",
      photos: [],
      schoolId: "school",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      guardian: {
        name: "Maria Silva",
        whatsapp: "5511911112222",
        consentAt: "2026-08-01T10:00:00.000Z",
        whatsappVerifiedAt: "2026-08-01T10:05:00.000Z",
      },
    } satisfies Student;
    const payload = buildStudentInput(MINOR, previous, []);
    expect(payload).not.toHaveProperty("whatsapp");
    expect(payload.guardian?.consentAt).toBe("2026-08-01T10:00:00.000Z");
    expect(payload.guardian?.whatsappVerifiedAt).toBe("2026-08-01T10:05:00.000Z");
  });

  it("trocar o WhatsApp do responsável zera a verificação e não mexe no consentAt", () => {
    const previous = {
      id: "s1",
      name: "Ana Costa",
      whatsapp: "5511999998888",
      photos: [],
      schoolId: "school",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      guardian: {
        name: "Maria Silva",
        whatsapp: "5511911112222",
        consentAt: "2026-08-01T10:00:00.000Z",
        whatsappVerifiedAt: "2026-08-01T10:05:00.000Z",
      },
    } satisfies Student;
    const guardian = buildGuardian(
      { ...MINOR, guardianWhatsapp: "(11) 93333-4444" },
      previous,
    );
    expect(guardian?.whatsapp).toBe("5511933334444");
    expect(guardian?.whatsappVerifiedAt).toBeUndefined();
    expect(guardian?.consentAt).toBe("2026-08-01T10:00:00.000Z");
  });
});
