/**
 * Prévia privada do lote (Fase 5, W3). O bucket `delivery-assets` não tem
 * policy para `anon`/`authenticated` (spec §8.3): a escola vê os derivados
 * por URLs assinadas de curta duração emitidas aqui, depois de conferir o
 * vínculo com a escola. Nenhum caminho de objeto volta ao navegador.
 *
 * `verify_jwt` ligado (membro da escola). Publicar sem ajustes.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { partialDeliveryPreview, previewPhotoCurrent } from "../_shared/delivery/preview.ts";

/** Spec §6.6: URL de arquivo assinada por no máximo 5 minutos. */
const SIGNED_TTL_SECONDS = 300;
/** Teto de itens por chamada; a tela pagina por lote (150 itens cobre o piloto). */
const MAX_ITEMS = 150;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

type Row = Record<string, unknown>;


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Serviço de prévia indisponível." }, 503);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  let batchId: string | undefined;
  let itemId: string | undefined;
  try {
    const body = (await req.json()) ?? {};
    batchId = typeof body.batchId === "string" ? body.batchId : undefined;
    itemId = typeof body.itemId === "string" ? body.itemId : undefined;
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!batchId || !uuid.test(batchId) || (itemId !== undefined && !uuid.test(itemId))) {
    return json({ error: "Lote não informado." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: batch } = await admin
    .from("delivery_batches")
    .select("id, school_id, status, approved_version")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return json({ error: "Lote não encontrado." }, 404);

  const { data: membership } = await admin
    .from("school_members")
    .select("role")
    .eq("school_id", batch.school_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json({ error: "Sem acesso a este lote." }, 403);

  async function sign(path: string, retention: string): Promise<string | null> {
    const ttl = Math.min(SIGNED_TTL_SECONDS, Math.floor((Date.parse(retention) - Date.now()) / 1000));
    if (!Number.isFinite(ttl) || ttl < 1) return null;
    const { data, error } = await admin.storage
      .from("delivery-assets")
      .createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  if (itemId) {
    const { data: item } = await admin
      .from("delivery_items")
      .select("id, asset_path, image_width, image_height, render_status, recipient_id, selected, retention_until, assets_purged_at, render_policy, rendered_regions_version, photos!inner(deleted_at, regions_version, regions_reviewed_version, all_people_reviewed)")
      .eq("id", itemId)
      .maybeSingle();
    if (!item || !item.selected || item.render_status !== "done" || !item.asset_path || item.assets_purged_at || !previewPhotoCurrent(item, batch.approved_version !== null)) {
      return json({ error: "Item sem derivado pronto." }, 404);
    }
    const { data: recipient } = await admin
      .from("delivery_recipients")
      .select("batch_id")
      .eq("id", item.recipient_id)
      .maybeSingle();
    if (!recipient || recipient.batch_id !== batchId) {
      return json({ error: "Item não pertence a este lote." }, 404);
    }
    const url = await sign(item.asset_path as string, item.retention_until as string);
    if (!url) return json({ error: "Não foi possível assinar o arquivo." }, 503);
    return json({
      url,
      expiresIn: SIGNED_TTL_SECONDS,
      width: item.image_width,
      height: item.image_height,
    });
  }

  const { data: items, error: itemsError } = await admin
    .from("delivery_items")
    .select(
      "id, thumb_path, image_width, image_height, render_status, selected, display_order, recipient_id, retention_until, assets_purged_at, render_policy, rendered_regions_version, photos!inner(deleted_at, regions_version, regions_reviewed_version, all_people_reviewed), recipient_student_id, delivery_recipients!inner(batch_id), delivery_recipient_students!delivery_items_recipient_student_id_fkey!inner(student_id, students(name))",
    )
    .eq("delivery_recipients.batch_id", batchId)
    .in("render_status", ["done", "failed"])
    .eq("selected", true)
    .is("assets_purged_at", null)
    .order("display_order")
    .limit(MAX_ITEMS + 1);
  if (itemsError) return json({ error: "Não foi possível listar a prévia." }, 503);

  const rows = (items ?? []) as unknown as Array<Row>;
  if (rows.length > MAX_ITEMS) return json({ error: "Prévia grande demais. Reduza a seleção para visualizar o conjunto completo." }, 413);
  const list = await partialDeliveryPreview(rows, sign, batch.approved_version !== null);
  return json({ items: list, expiresIn: SIGNED_TTL_SECONDS });
});
