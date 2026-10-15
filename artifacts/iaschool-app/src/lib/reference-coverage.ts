import type { StudentReferenceFace, StudentReferenceJob } from "./data/types";
/** Upload/enfileiramento não é cobertura: só referência processada, ativa e autorizada. */
export function referenceCoverage(faces: readonly Pick<StudentReferenceFace, "expired">[],
  jobs: readonly Pick<StudentReferenceJob, "status">[], consentActive: boolean) {
  return { processed: consentActive ? faces.filter(face => !face.expired).length : 0,
    pending: jobs.filter(job => job.status === "queued" || job.status === "leased").length };
}
