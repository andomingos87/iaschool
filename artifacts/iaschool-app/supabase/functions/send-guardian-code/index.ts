/** Envio de OTP do responsável com provider server-side e modo seguro por padrão. */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createWhatsAppProvider } from "../_shared/whatsapp/provider.ts";

const CODE_TTL_MINUTES = 10;
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

function createOtp(): string {
  const ceiling = 0x1_0000_0000;
  const limit = ceiling - (ceiling % 1_000_000);
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Serviço de verificação indisponível." }, 503);
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
  const { data: profile } = await admin.from("profiles").select("role, approval_status").eq("id", user.id).maybeSingle();
  if (profile?.approval_status !== "approved") return json({ error: "Sua conta não pode verificar responsáveis." }, 403);
  if (!guardianId && studentId) {
    const { data: student } = await admin.from("students").select("primary_guardian_id, deleted_at").eq("id", studentId).maybeSingle();
    if (!student || student.deleted_at) return json({ error: "Aluno não encontrado." }, 404);
    if (!student.primary_guardian_id) return json({ error: "Cadastre o responsável legal antes de verificar o WhatsApp." }, 400);
    guardianId = student.primary_guardian_id as string;
  }

  const { data: guardian } = await admin.from("guardians").select("id, school_id, whatsapp, deleted_at").eq("id", guardianId!).maybeSingle();
  if (!guardian || guardian.deleted_at) return json({ error: "Responsável não encontrado." }, 404);
  const { data: membership } = await admin.from("school_members")
    .select("role")
    .eq("school_id", guardian.school_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !["school_admin", "school_staff"].includes(membership.role)) {
    return json({ error: "Somente a administração da escola pode solicitar a verificação." }, 403);
  }
  if (!guardian.whatsapp || !/^\+[1-9]\d{7,14}$/.test(guardian.whatsapp)) {
    return json({ error: "Cadastre um WhatsApp válido do responsável." }, 400);
  }

  const { data: messageId, error: reserveError } = await admin.rpc("reserve_whatsapp_send", {
    p_guardian_id: guardian.id,
    p_purpose: "guardian_otp",
    p_instance_id: Deno.env.get("ZAPI_INSTANCE_ID")!,
  });
  if (reserveError || !messageId) {
    // Sem o texto cru do banco: pode trazer dado operacional. Só o teto de
    // 4 números tem mensagem própria; o resto continua genérico.
    const detail = reserveError?.message ?? "";
    if (detail.includes("controlled allowlist limit reached")) {
      return json({ error: "Esta escola já tem 4 números autorizados. Edite um responsável que já existe, em vez de acrescentar outro." }, 429);
    }
    return json({ error: "Envio indisponível para este número ou limite atingido." }, 429);
  }

  const code = createOtp();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
  const { error: codeError } = await admin.rpc("create_guardian_verification_code", {
    p_guardian_id: guardian.id,
    p_code: code,
    p_phone_e164: guardian.whatsapp,
    p_expires_at: expiresAt,
  });
  if (codeError) {
    await admin.rpc("complete_whatsapp_send", {
      p_message_id: messageId,
      p_status: "failed",
      p_error_code: "otp_persistence_failed",
    });
    return json({ error: "Não foi possível iniciar a verificação." }, 503);
  }

  const { data: currentGuardian } = await admin.from("guardians")
    .select("whatsapp, deleted_at")
    .eq("id", guardian.id)
    .maybeSingle();
  if (!currentGuardian || currentGuardian.deleted_at || currentGuardian.whatsapp !== guardian.whatsapp) {
    await admin.from("guardian_verification_codes").delete().eq("guardian_id", guardian.id);
    await admin.rpc("complete_whatsapp_send", {
      p_message_id: messageId,
      p_status: "failed",
      p_error_code: "guardian_phone_changed",
    });
    return json({ error: "O número do responsável foi alterado. Inicie a verificação novamente." }, 409);
  }

  const result = await provider.sendOtp(guardian.whatsapp, code);
  const { error: completionError } = await admin.rpc("complete_whatsapp_send", {
    p_message_id: messageId,
    p_status: result.status,
    p_provider_message_id: result.providerMessageId ?? null,
    p_provider_zaap_id: result.providerRequestId ?? null,
    p_error_code: result.errorCode ?? null,
  });
  if (completionError) {
    // A mensagem pode já ter saído. Não repetir e não registrar conteúdo sensível.
    return json({ error: "Resultado do envio incerto. Aguarde antes de tentar novamente." }, 503);
  }
  if (result.status !== "accepted") {
    return json({ error: result.status === "unknown" ? "Resultado do envio incerto. Aguarde antes de tentar novamente." : "O provedor não aceitou a mensagem." }, 502);
  }

  // `accepted` significa aceitação pelo provedor, não entrega no aparelho.
  return json({ ok: true, status: "accepted" });
});
