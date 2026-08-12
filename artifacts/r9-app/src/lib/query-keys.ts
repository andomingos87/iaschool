// Chaves centrais do TanStack Query.
export const qk = {
  session: ["session"] as const,
  students: ["students"] as const,
  student: (id: string) => ["students", id] as const,
  clubs: ["clubs"] as const,
  club: (id: string) => ["clubs", id] as const,
  references: ["references"] as const,
  metrics: ["metrics"] as const,
  generatedPosts: ["generated-posts"] as const,
  promptTemplate: ["prompt-template"] as const,
  promptTemplateVersions: ["prompt-template-versions"] as const,
  linkableStudentAccounts: ["linkable-student-accounts"] as const,
};
