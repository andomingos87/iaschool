// Chaves centrais do TanStack Query.
export const qk = {
  session: ["session"] as const,
  students: ["students"] as const,
  studentsTrash: ["students", "trash"] as const,
  student: (id: string) => ["students", id] as const,
  schoolBrands: ["school-brands"] as const,
  schoolBrand: (id: string) => ["school-brands", id] as const,
  classes: (schoolId?: string) => ["classes", schoolId ?? "all"] as const,
  events: (schoolId?: string) => ["events", schoolId ?? "all"] as const,
  event: (id: string) => ["events", "detail", id] as const,
  eventPhotoCounts: (schoolId?: string) =>
    ["events", "photo-counts", schoolId ?? "none"] as const,
  photos: (eventId: string) => ["photos", eventId] as const,
  batch: (eventId: string) => ["batch-jobs", eventId] as const,
  authorizations: (studentId: string) => ["authorizations", studentId] as const,
  referenceFaces: (studentId: string) => ["reference-faces", studentId] as const,
  referenceJobs: (studentId: string) => ["reference-faces", "jobs", studentId] as const,
  biometricReadiness: (schoolId?: string) =>
    ["reference-faces", "readiness", schoolId ?? "none"] as const,
  references: ["references"] as const,
  generatedPosts: ["generated-posts"] as const,
  generatedPostsTrash: ["generated-posts", "trash"] as const,
  promptTemplate: ["prompt-template"] as const,
  promptTemplateVersions: ["prompt-template-versions"] as const,
  generationQuota: ["generation-quota"] as const,
};
