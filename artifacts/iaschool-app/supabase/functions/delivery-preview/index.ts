/**
 * Prévia protegida do lote (Fase 5, W3). O bucket `delivery-assets` não tem
 * policy para `anon`/`authenticated` (spec §8.3): a escola vê os derivados
 * por URLs assinadas de curta duração emitidas aqui, depois de conferir o
 * vínculo com a escola. Nenhum caminho de objeto volta ao navegador.
 *
 * `verify_jwt` ligado (membro da escola). Publicar sem ajustes.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Spec §6.6: URL de arquivo assinada por no máximo 5 minutos. */
const SIGNED_TTL_SECONDS = 300;
/** Teto de itens por chamada; a tela pagina por lote (150 itens cobre o piloto). */
const MAX_ITEMS = 150;
const SIGN_CONCURRENCY = 20;

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
    .select("id, school_id, status")
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

  async function sign(path: string): Promise<string | null> {
    const { data, error } = await admin.storage
      .from("delivery-assets")
      .createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  if (itemId) {
    const { data: item } = await admin
      .from("delivery_items")
      .select("id, asset_path, image_width, image_height, render_status, recipient_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!item || item.render_status !== "done" || !item.asset_path) {
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
    const url = await sign(item.asset_path as string);
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
      "id, thumb_path, image_width, image_height, render_status, recipient_student_id, delivery_recipients!inner(batch_id), delivery_recipient_students!inner(student_id, students(name))",
    )
    .eq("delivery_recipients.batch_id", batchId)
    .eq("render_status", "done")
    .limit(MAX_ITEMS);
  if (itemsError) return json({ error: "Não foi possível listar a prévia." }, 503);

  const rows = (items ?? []) as unknown as Array<Row>;
  const list: Array<Row> = [];
  for (let i = 0; i < rows.length; i += SIGN_CONCURRENCY) {
    const chunk = rows.slice(i, i + SIGN_CONCURRENCY);
    const signed = await Promise.all(chunk.map(async (row) => {
      const path = row["thumb_path"] as string | null;
      if (!path) return null;
      const url = await sign(path);
      if (!url) return null;
      const link = row["delivery_recipient_students"] as Row | undefined;
      const student = link?.["students"] as Row | undefined;
      return {
        itemId: row["id"],
        studentId: link?.["student_id"] ?? null,
        studentName: student?.["name"] ?? "",
        url,
        width: row["image_width"],
        height: row["image_height"],
      };
    }));
    for (const entry of signed) if (entry) list.push(entry);
  }

  return json({ items: list, expiresIn: SIGNED_TTL_SECONDS });
});
