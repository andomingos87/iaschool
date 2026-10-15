import type { StoredImage, Student } from "./data/types";
export function photoPromptError(prompt: string): string | null {
  return !prompt.trim()
    ? "Escreva como você quer a arte."
    : prompt.trim().length > 3000
      ? "Use até 3.000 caracteres para descrever a arte."
      : null;
}
/** Reload before retry: a lost update response must not duplicate a photo. */
export async function associateStudentPhoto(
  studentId: string,
  image: StoredImage,
  deps: {
    get: (id: string) => Promise<Student | null>;
    update: (id: string, photos: StoredImage[]) => Promise<Student>;
  },
): Promise<Student> {
  const student = await deps.get(studentId);
  if (!student)
    throw new Error(
      "O aluno não está disponível. Escolha novamente antes de enviar a foto.",
    );
  if (
    student.photos.some(
      (p) => p.id === image.id || (image.path && p.path === image.path),
    )
  )
    return student;
  return deps.update(studentId, [...student.photos, image]);
}
