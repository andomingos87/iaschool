import { getDataLayer, isAuthorizationActive } from "@/lib/data";
import type { Student, StoredImage } from "@/lib/data";
import {
  decideProfileEnqueue,
  sha256Hex,
  type ProfileEnqueueDecision,
} from "@/lib/reference-from-profile";
import { prepareReferencePhoto } from "@/lib/upload";

async function fileFromStoredImage(image: StoredImage): Promise<File> {
  const response = await fetch(image.url);
  if (!response.ok) throw new Error("Não foi possível ler a foto de perfil.");
  const blob = await response.blob();
  return new File([blob], "perfil.jpg", { type: blob.type || "image/jpeg" });
}

/**
 * Enfileira a primeira foto do aluno como referência, se o reconhecimento
 * já estiver ligado e o JPEG preparado ainda não estiver na fila.
 * Ligar o interruptor não chama isto: a aba pede o clique em "Usar a foto de perfil".
 */
export async function enqueueProfileReference(
  student: Student,
): Promise<ProfileEnqueueDecision> {
  const data = getDataLayer();
  const photo = student.photos[0];
  const authorizations = await data.authorizations.listForStudent(student.id);
  const consent = authorizations.find(
    (a) => a.scope === "biometric_sorting" && isAuthorizationActive(a),
  );
  const [faces, jobs] = await Promise.all([
    data.referenceFaces.list(student.id),
    data.referenceFaces.listJobs(student.id),
  ]);
  const existingPaths = [
    ...faces.map((f) => f.sourcePhotoPath ?? ""),
    ...jobs.map((j) => j.storagePath),
  ].filter(Boolean);

  let preparedHash: string | null = null;
  let blob: Blob | null = null;
  if (photo && consent) {
    const prepared = await prepareReferencePhoto(await fileFromStoredImage(photo));
    blob = prepared.blob;
    preparedHash = await sha256Hex(prepared.blob);
  }

  const decision = decideProfileEnqueue({
    recognitionActive: Boolean(consent),
    hasProfilePhoto: Boolean(photo),
    preparedHash,
    existingPaths,
  });
  if (decision !== "enqueue" || !consent || !blob || !preparedHash) return decision;

  await data.referenceFaces.enqueue({
    studentId: student.id,
    schoolId: student.schoolId,
    authorizationId: consent.id,
    blob,
    contentHash: preparedHash,
    fromProfile: true,
  });
  return decision;
}
