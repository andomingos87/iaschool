/**
 * Convite de consentimento direto ao responsável legal (Fase 5, W2).
 *
 * Pré-requisitos: membro `school_admin`/`school_staff`, número já verificado
 * em `guardians.whatsapp_verified_at` e provedor ativo. O link é opaco, de uso
 * único, válido por 24h e só chega pelo WhatsApp — nunca volta ao navegador
 * da escola.
 *
 * Base: docs/spec-whatsapp-api-oficial-entrega-fotos.md §§6.2 e 15.2.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createWhatsAppProvider } from "../_shared/whatsapp/provider.ts";
import { DELIVERY_WHATSAPP_TERMS_VERSION } from "../_shared/whatsapp/consent-terms.ts";
import { createOpaqueToken, sha256Hex } from "../_shared/whatsapp/tokens.ts";

const CONSENT_TTL_HOURS = 24;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
  const appPublicUrl = Deno.env.get("APP_PUBLIC_URL")?.replace(/\/+$/, "");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !instanceId || !appPublicUrl) {
    return json({ error: "Serviço de consentimento indisponível." }, 503);
  }

  const provider = createWhatsAppProvider();
  if (!provider) return json({ error: "Envio de WhatsApp pausado ou não configurado." }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  let guardianId: string | undefined;
  let studentId: string | undefined;
  try {
    const body = (await req.json()) ?? {};
    guardianId = typeof body.guardianId === "string" ? body.guardianId : undefined;
    studentId = typeof body.studentId === "string" ? body.studentId : undefined;
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  if (!guardianId && !studentId) return json({ error: "Responsável não informado." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, approval_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.approval_status !== "approved") {
    return json({ error: "Sua conta não pode solicitar consentimento." }, 403);
  }

  if (!guardianId && studentId) {
    const { data: student } = await admin
      .from("students")
      .select("primary_guardian_id, deleted_at")
      .eq("id", studentId)
      .maybeSingle();
    if (!student || student.deleted_at) return json({ error: "Aluno não encontrado." }, 404);
    if (!student.primary_guardian_id) {
      return json({ error: "Cadastre o responsável legal antes de pedir o consentimento." }, 400);
    }
    guardianId = student.primary_guardian_id as string;
  }

  const { data: guardian } = await admin
    .from("guardians")
    .select("id, school_id, whatsapp, whatsapp_verified_at, deleted_at")
    .eq("id", guardianId!)
    .maybeSingle();
  if (!guardian || guardian.deleted_at) return json({ error: "Responsável não encontrado." }, 404);

  const { data: membership } = await admin
    .from("school_members")
    .select("role")
    .eq("school_id", guardian.school_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !["school_admin", "school_staff"].includes(membership.role)) {
    return json({ error: "Somente a administração da escola pode pedir o consentimento." }, 403);
  }
  if (!guardian.whatsapp || !/^\+[1-9]\d{7,14}$/.test(guardian.whatsapp)) {
    return json({ error: "Cadastre um WhatsApp válido do responsável." }, 400);
  }
  if (!guardian.whatsapp_verified_at) {
    return json({ error: "Verifique o WhatsApp do responsável antes de pedir o consentimento." }, 400);
  }

  // Reserva atômica: escola habilitada, allowlist, teto diário e antiflood.
  const { data: messageId, error: reserveError } = await admin.rpc("reserve_whatsapp_send", {
    p_guardian_id: guardian.id,
    p_purpose: "guardian_consent",
    p_instance_id: instanceId,
  });
  if (reserveError || !messageId) {
    const detail = reserveError?.message ?? "";
    if (detail.includes("controlled allowlist limit reached")) {
      return json({ error: "Esta escola já tem 4 números autorizados. Edite um responsável que já existe, em vez de acrescentar outro." }, 429);
    }
    return json({ error: "Envio indisponível para este número ou limite atingido." }, 429);
  }

  const token = createOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + CONSENT_TTL_HOURS * 3_600_000).toISOString();

  const { error: tokenError } = await admin.rpc("create_guardian_consent_token", {
    p_guardian_id: guardian.id,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_created_by: user.id,
    p_whatsapp_message_id: messageId,
  });
  if (tokenError) {
    await admin.rpc("complete_whatsapp_send", {
      p_message_id: messageId,
      p_status: "failed",
      p_error_code: "consent_token_persistence_failed",
    });
    return tokenError.message.includes("cooldown")
      ? json({ error: "Aguarde um minuto antes de pedir de novo." }, 429)
      : json({ error: "Não foi possível preparar o convite." }, 503);
  }

  const { data: currentGuardian } = await admin
    .from("guardians")
    .select("whatsapp, deleted_at")
    .eq("id", guardian.id)
    .maybeSingle();
  if (!currentGuardian || currentGuardian.deleted_at || currentGuardian.whatsapp !== guardian.whatsapp) {
    await admin
      .from("guardian_action_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("guardian_id", guardian.id)
      .is("used_at", null)
      .is("revoked_at", null);
    await admin.rpc("complete_whatsapp_send", {
      p_message_id: messageId,
      p_status: "failed",
      p_error_code: "guardian_phone_changed",
    });
    return json({ error: "O número do responsável mudou. Verifique de novo antes de pedir." }, 409);
  }

  const link = `${appPublicUrl}/consentimento/${token}`;
  const result = await provider.sendConsentRequest(guardian.whatsapp, link);
  const { error: completionError } = await admin.rpc("complete_whatsapp_send", {
    p_message_id: messageId,
    p_status: result.status,
    p_provider_message_id: result.providerMessageId ?? null,
    p_provider_zaap_id: result.providerRequestId ?? null,
    p_error_code: result.errorCode ?? null,
  });
  if (completionError) {
    // A mensagem pode já ter saído. Não repetir e não registrar conteúdo sensível.
    return json({ error: "Resultado do envio incerto. Aguarde antes de tentar de novo." }, 503);
  }
  if (result.status !== "accepted") {
    return json(
      {
        error: result.status === "unknown"
          ? "Resultado do envio incerto. Aguarde antes de tentar de novo."
          : "O provedor não aceitou a mensagem.",
      },
      502,
    );
  }

  // Só a aceitação do provedor; entrega e leitura vêm pelo webhook.
  return json({ ok: true, status: "accepted", termsVersion: DELIVERY_WHATSAPP_TERMS_VERSION });
});
