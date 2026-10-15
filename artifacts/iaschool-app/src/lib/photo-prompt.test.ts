import { describe, expect, it, vi } from "vitest";
import { associateStudentPhoto, photoPromptError } from "./photo-prompt";
import type { Student, StoredImage } from "./data/types";
const image = {
  id: "new",
  path: "students/new",
  url: "synthetic",
  createdAt: "now",
} as StoredImage;
const student = {
  id: "chosen",
  schoolId: "school",
  photos: [],
} as unknown as Student;
describe("foto associada ao aluno no fluxo simples", () => {
  it("valida prompt simples vazio/limite", () => {
    expect(photoPromptError(" ")).toBeTruthy();
    expect(photoPromptError("Festa junina")).toBeNull();
    expect(photoPromptError("x".repeat(3001))).toBeTruthy();
  });
  it("associa nova foto somente ao aluno escolhido", async () => {
    const get = vi.fn().mockResolvedValue(student),
      update = vi.fn().mockResolvedValue({ ...student, photos: [image] });
    await associateStudentPhoto(student.id, image, { get, update });
    expect(get).toHaveBeenCalledWith("chosen");
    expect(update).toHaveBeenCalledWith("chosen", [image]);
  });
  it("resposta perdida não duplica foto e aluno removido não recebe upload", async () => {
    const update = vi.fn();
    await associateStudentPhoto(student.id, image, {
      get: async () => ({ ...student, photos: [image] }),
      update,
    });
    expect(update).not.toHaveBeenCalled();
    await expect(
      associateStudentPhoto(student.id, image, {
        get: async () => null,
        update,
      }),
    ).rejects.toThrow("aluno");
  });
});
