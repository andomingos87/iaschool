// Chaves centrais do TanStack Query.
export const qk = {
  session: ["session"] as const,
  students: ["students"] as const,
  studentsTrash: ["students", "trash"] as const,
  student: (id: string) => ["students", id] as const,
  schoolBrands: ["school-brands"] as const,
  schoolBrand: (id: string) => ["school-brands", id] as const,
  references: ["references"] as const,
  generatedPosts: ["generated-posts"] as const,
  generatedPostsTrash: ["generated-posts", "trash"] as const,
  promptTemplate: ["prompt-template"] as const,
  promptTemplateVersions: ["prompt-template-versions"] as const,
  generationQuota: ["generation-quota"] as const,
};
