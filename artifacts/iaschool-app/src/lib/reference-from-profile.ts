/**
 * A foto de perfil entra na fila de referência só com reconhecimento ligado,
 * e a mesma foto preparada não vira duas referências.
 *
 * O hash vai no caminho do arquivo (`{job}--p{hash}.jpg` quando a origem é a
 * foto de perfil). Não há coluna nova: o caminho já é único e o worker copia
 * esse caminho para `source_photo_path`.
 */

const HASH_IN_PATH = /--(p)?([0-9a-f]{64})\.jpg$/i;

export type ProfileEnqueueDecision = "skip-no-recognition" | "skip-no-photo" | "duplicate" | "enqueue";

export function decideProfileEnqueue(input: {
  recognitionActive: boolean;
  hasProfilePhoto: boolean;
  preparedHash: string | null;
  existingPaths: readonly string[];
}): ProfileEnqueueDecision {
  if (!input.recognitionActive) return "skip-no-recognition";
  if (!input.hasProfilePhoto || !input.preparedHash) return "skip-no-photo";
  if (hasReferenceHash(input.preparedHash, input.existingPaths)) return "duplicate";
  return "enqueue";
}

export function hasReferenceHash(hash: string, paths: readonly string[]): boolean {
  const wanted = hash.toLowerCase();
  return paths.some((path) => hashFromReferencePath(path)?.hash === wanted);
}

export function hashFromReferencePath(
  path: string,
): { hash: string; fromProfile: boolean } | null {
  const match = HASH_IN_PATH.exec(path);
  if (!match || !match[2]) return null;
  return { hash: match[2].toLowerCase(), fromProfile: match[1] === "p" };
}

export function referenceStoragePath(
  schoolId: string,
  studentId: string,
  jobId: string,
  contentHash?: string,
  fromProfile?: boolean,
): string {
  if (!contentHash) return `${schoolId}/${studentId}/${jobId}.jpg`;
  const marker = fromProfile ? "p" : "";
  return `${schoolId}/${studentId}/${jobId}--${marker}${contentHash.toLowerCase()}.jpg`;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
