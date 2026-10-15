import { partialDeliveryPreview, previewPhotoCurrent } from "./preview.ts";
const check = (value: unknown) => { if (!value) throw new Error("assertion failed"); };
const photo = { all_people_reviewed: false, regions_version: 2, regions_reviewed_version: null, deleted_at: null };
const ready = { id: "pronta", render_policy: "original_v1", render_status: "done", rendered_regions_version: null, photos: photo,
  thumb_path: "private/thumb.webp", retention_until: "2026-10-20", assets_purged_at: null };
Deno.test("foto nítida sem regiões ou conferência recebe prévia", async () => {
  const calls: string[] = [];
  const rows = await partialDeliveryPreview([ready], async path => { calls.push(path); return "https://signed.test/foto"; });
  check(rows[0]?.url === "https://signed.test/foto" && calls.length === 1);
  check(!JSON.stringify(rows).includes("private/"));
});
Deno.test("assinatura indisponível e foto falha ficam isoladas por item", async () => {
  let calls = 0;
  const rows = await partialDeliveryPreview([ready, { ...ready, id: "falhou", render_status: "failed" }, { ...ready, id: "outra" }], async () => { calls++; if (calls === 1) throw Error("secret/path"); return "https://signed.test/outra"; });
  check(rows[0]?.problem === "unavailable" && rows[1]?.problem === "render_failed" && rows[2]?.url);
  check(calls === 2 && !JSON.stringify(rows).includes("secret"));
});
Deno.test("rascunho legado exige atualizar fotos e não assina derivado antigo", async () => {
  let signed = false;
  const rows = await partialDeliveryPreview([{ ...ready, render_policy: "protected_regions_v1", render_status: "failed" }], async () => { signed = true; return "url"; });
  check(rows[0]?.problem === "refresh_required" && !signed && !rows[0]?.url);
});
Deno.test("álbum legado aprovado preserva exigências da versão original", () => {
  const legacy = { ...ready, render_policy: "protected_regions_v1", rendered_regions_version: 2,
    photos: { ...photo, all_people_reviewed: true, regions_reviewed_version: 2 } };
  check(previewPhotoCurrent(legacy, true));
  check(!previewPhotoCurrent(legacy));
  check(!previewPhotoCurrent({ ...legacy, rendered_regions_version: null }, true));
  check(!previewPhotoCurrent({ ...legacy, photos: photo }, true));
  check(!previewPhotoCurrent({ ...ready, render_policy: "unknown" }, true));
});
Deno.test("foto apagada ou expurgada não é assinada", async () => {
  let signed = false;
  const rows = await partialDeliveryPreview([{ ...ready, assets_purged_at: "2026-10-13" }, { ...ready, photos: { ...photo, deleted_at: "2026-10-13" } }], async () => { signed = true; return "url"; });
  check(!signed && rows.every(row => row.problem === "unavailable" && !row.url));
});
