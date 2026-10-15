type Row = Record<string, unknown>;
export type PreviewProblem = "refresh_required" | "render_failed" | "unavailable";
/** Álbuns já aprovados conservam exatamente os arquivos da versão aprovada. */
export function previewPhotoCurrent(row: Row, allowLegacy = false): boolean {
  const photo = row.photos as Row | null;
  if (!photo || photo.deleted_at) return false;
  if (row.render_policy === "original_v1") return true;
  return Boolean(allowLegacy && row.render_policy === "protected_regions_v1" &&
    photo.all_people_reviewed === true && Number.isSafeInteger(photo.regions_version) &&
    Number(photo.regions_version) > 0 && photo.regions_reviewed_version === photo.regions_version &&
    row.rendered_regions_version === photo.regions_version);
}
/** Uma foto inválida nunca recebe URL, nem impede a prévia das outras. */
export async function partialDeliveryPreview(rows: readonly Row[], sign: (path: string, retention: string) => Promise<string | null>, allowLegacy = false) {
  const list: Row[] = [];
  for (let offset = 0; offset < rows.length; offset += 20) {
    const entries = await Promise.all(rows.slice(offset, offset + 20).map(async row => {
      const link = row.delivery_recipient_students as Row | null;
      const student = link?.students as Row | null;
      const base = { itemId: row.id, recipientId: row.recipient_id,
        studentId: link?.student_id ?? null, studentName: student?.name ?? "" };
      const problem = (code: PreviewProblem) => ({ ...base, problem: code });
      if (row.render_policy === "protected_regions_v1" && !allowLegacy) return problem("refresh_required");
      if (row.render_status === "failed") return problem("render_failed");
      if (!previewPhotoCurrent(row, allowLegacy) || row.render_status !== "done" || row.assets_purged_at ||
          typeof row.thumb_path !== "string" || typeof row.retention_until !== "string") return problem("unavailable");
      try {
        const url = await sign(row.thumb_path, row.retention_until);
        return url ? { ...base, url, width: row.image_width, height: row.image_height } : problem("unavailable");
      } catch { return problem("unavailable"); }
    }));
    list.push(...entries);
  }
  return list;
}
