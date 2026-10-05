/**
 * Página pública do consentimento (Fase 5, W2). Sem sessão: a posse do token
 * opaco é a credencial. Publicar com `verify_jwt` desligado.
 *
 * `view` devolve só o necessário (primeiro nome da criança, primeiro nome do
 * responsável, escola, termo versionado). `accept`/`decline` consomem o token
 * pela RPC `consume_guardian_consent_token`, que grava o desfecho e as
 * autorizações na mesma transação. Nunca logar token, hash ou telefone.
 *
 * Base: docs/spec-whatsapp-api-oficial-entrega-fotos.md §§6.2 e 15.2.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/whatsapp/tokens.ts";
import { DELIVERY_WHATSAPP_TERMS } from "../_shared/whatsapp/consent-terms.ts";

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

/** Primeiro nome é o suficiente na página; nome completo é dado a mais. */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

const REASON_MESSAGE: Record<string, string> = {
  invalid_token: "Este link não é válido ou já foi substituído. Peça um novo à escola.",
  already_used: "Este link já foi usado. Se precisar, peça um novo à escola.",
  revoked: "Este link foi cancelado porque o número mudou ou a escola pediu outro. Peça um novo.",
  expired: "Este link expirou. Peça um novo à escola.",
  guardian_unavailable: "Não encontramos o cadastro do responsável. Fale com a escola.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Serviço de consentimento indisponível." }, 503);
  }

  let token: string | undefined;
  let action: string | undefined;
  try {
    const body = (await req.json()) ?? {};
    token = typeof body.token === "string" ? body.token : undefined;
    action = typeof body.action === "string" ? body.action : undefined;
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return json({ error: REASON_MESSAGE["invalid_token"] }, 404);
  }
  if (action !== "view" && action !== "accept" && action !== "decline") {
    return json({ error: "Ação inválida." }, 400);
  }

  const tokenHash = await sha256Hex(token);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (action === "view") {
    const { data: row } = await admin
      .from("guardian_action_tokens")
      .select("id, guardian_id, school_id, expires_at, used_at, outcome, revoked_at")
      .eq("token_hash", tokenHash)
      .eq("purpose", "guardian_consent")
      .maybeSingle();
    if (!row) return json({ error: REASON_MESSAGE["invalid_token"] }, 404);

    let state = "pending";
    if (row.used_at) state = row.outcome === "accepted" ? "accepted" : "declined";
    else if (row.revoked_at) state = "revoked";
    else if (new Date(row.expires_at as string).getTime() <= Date.now()) state = "expired";

    const [schoolResult, guardianResult, studentsResult] = await Promise.all([
      admin.from("schools").select("name").eq("id", row.school_id).maybeSingle(),
      admin.from("guardians").select("name").eq("id", row.guardian_id).maybeSingle(),
      admin
        .from("students")
        .select("name")
        .eq("primary_guardian_id", row.guardian_id)
        .eq("school_id", row.school_id)
        .is("deleted_at", null),
    ]);

    return json({
      state,
      schoolName: (schoolResult.data?.name as string | null) ?? "Escola",
      guardianFirstName: guardianResult.data?.name
        ? firstName(guardianResult.data.name as string)
        : "",
      studentFirstNames: (studentsResult.data ?? []).map((s) => firstName(s.name as string)),
      expiresAt: row.expires_at,
      terms: {
        version: DELIVERY_WHATSAPP_TERMS.version,
        title: DELIVERY_WHATSAPP_TERMS.title,
        paragraphs: DELIVERY_WHATSAPP_TERMS.paragraphs,
      },
    });
  }

  const accept = action === "accept";
  const { data, error } = await admin.rpc("consume_guardian_consent_token", {
    p_token_hash: tokenHash,
    p_accept: accept,
    p_terms_version: accept ? DELIVERY_WHATSAPP_TERMS.version : null,
  });
  if (error) return json({ error: "Não foi possível registrar a resposta." }, 503);
  if (data?.ok !== true) {
    const reason = typeof data?.reason === "string" ? data.reason : "invalid_token";
    const status = reason === "invalid_token" ? 404 : 409;
    return json({ error: REASON_MESSAGE[reason] ?? REASON_MESSAGE["invalid_token"] }, status);
  }

  return json({ ok: true, outcome: data.outcome });
});
