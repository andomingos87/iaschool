/**
 * send-guardian-code — verificação do canal do responsável legal.
 *
 * ⚠️ MODO SIMULAÇÃO (fase MVP)
 *
 * Esta versão NÃO envia nada para o WhatsApp. Ela gera o código, grava em
 * `guardian_verification_codes` e devolve o código à própria tela, que o
 * exibe com o aviso "Modo demonstração". Serve para exercitar o fluxo real
 * de ponta a ponta (RPC `confirm_guardian_code` →
 * `guardians.whatsapp_verified_at` → `share_logs`) sem tocar em canal de
 * verdade.
 *
 * A troca pelo envio real é a pendência 7 de `docs/pendencias-producao.md`
 * (Meta WhatsApp Cloud API, template `guardian_verification_code`, categoria
 * Authentication). Quando ela for feita, substitua APENAS o bloco marcado
 * SIMULAÇÃO pela chamada à Graph API e pare de devolver `demoCode` — todo o
 * resto (autorização, TTL, antiflood) já é comportamento de produção.
 *
 * Enquanto simular, a resposta carrega `simulated: true` e cada chamada emite
 * um warn no log — é o que impede alguém de achar que o OTP está no ar.
 *
 * Modelo (M1, spec §4.7 item 8): a verificação é POR RESPONSÁVEL, não por
 * aluno. A chamada aceita `guardianId` ou, por conveniência da tela do aluno,
 * `studentId` (resolvido para `students.primary_guardian_id`). A autorização
 * é por escola: quem chama precisa ser membro da escola do responsável
 * (`school_members`) ou ter papel de plataforma (`dev`/`super_admin`).
 *
 * Base legal do fluxo: Decreto nº 12.880/2026, art. 35.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Precisa bater com a checagem de `expires_at` em confirm_guardian_code. */
const CODE_TTL_MINUTES = 10;
/** Antiflood: intervalo mínimo entre dois envios para o mesmo responsável. */
const RESEND_COOLDOWN_SECONDS = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Identidade do chamador: o JWT do usuário, nunca o service_role.
  const authorization = req.headers.get("Authorization") ?? "";
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  let guardianId: string | undefined;
  let studentId: string | undefined;
  try {
    const body = (await req.json()) ?? {};
    guardianId = body.guardianId;
    studentId = body.studentId;
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  if (!guardianId && !studentId) {
    return json({ error: "Responsável não informado." }, 400);
  }

  // service_role para ler/escrever `guardian_verification_codes`, que tem RLS
  // ligada e nenhuma policy de propósito. A autorização é feita aqui, à mão.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, approval_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.approval_status !== "approved") {
    return json({ error: "Sua conta não pode verificar responsáveis." }, 403);
  }
  const isPlatformAdmin =
    profile.role === "super_admin" || profile.role === "dev";

  // Resolve o responsável a partir do aluno, quando a tela manda studentId.
  if (!guardianId && studentId) {
    const { data: student } = await admin
      .from("students")
      .select("primary_guardian_id, deleted_at")
      .eq("id", studentId)
      .maybeSingle();
    if (!student || student.deleted_at) {
      return json({ error: "Aluno não encontrado." }, 404);
    }
    if (!student.primary_guardian_id) {
      return json(
        { error: "Cadastre o responsável legal antes de verificar o WhatsApp." },
        400,
      );
    }
    guardianId = student.primary_guardian_id as string;
  }

  const { data: guardian } = await admin
    .from("guardians")
    .select("id, school_id, whatsapp, deleted_at")
    .eq("id", guardianId!)
    .maybeSingle();

  if (!guardian || guardian.deleted_at) {
    return json({ error: "Responsável não encontrado." }, 404);
  }

  if (!isPlatformAdmin) {
    const { data: membership } = await admin
      .from("school_members")
      .select("role")
      .eq("school_id", guardian.school_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return json({ error: "Este responsável não pertence à sua escola." }, 403);
    }
  }

  if (!guardian.whatsapp) {
    return json(
      { error: "Cadastre o WhatsApp do responsável antes de verificar." },
      400,
    );
  }

  const { data: pending } = await admin
    .from("guardian_verification_codes")
    .select("created_at")
    .eq("guardian_id", guardian.id)
    .maybeSingle();

  if (pending) {
    const elapsed = Date.now() - new Date(pending.created_at).getTime();
    if (elapsed < RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
      return json(
        { error: `Aguarde ${wait}s para pedir um novo código.` },
        429,
      );
    }
  }

  // Aleatoriedade criptográfica: o código é a única barreira do canal.
  const code = String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
  ).padStart(6, "0");
  const now = new Date();

  const { error: writeError } = await admin
    .from("guardian_verification_codes")
    .upsert({
      guardian_id: guardian.id,
      code,
      // created_at explícito: é ele que o antiflood acima compara, então
      // precisa ser reescrito a cada envio (o default só vale no insert).
      created_at: now.toISOString(),
      expires_at: new Date(
        now.getTime() + CODE_TTL_MINUTES * 60 * 1000,
      ).toISOString(),
      attempts: 0,
    });

  if (writeError) {
    console.error("[send-guardian-code] falha ao gravar o código", writeError);
    return json({ error: "Não foi possível gerar o código." }, 500);
  }

  // ---------------------------------------------------------------------
  // SIMULAÇÃO — trocar por Meta WhatsApp Cloud API na pendência 7.
  //
  // POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
  //   template `guardian_verification_code`, pt_BR, categoria Authentication,
  //   com o código no parâmetro do corpo e no botão de copiar.
  // Depois disso, devolva apenas { ok: true, guardianId } — sem `demoCode`,
  // sem `simulated`.
  // ---------------------------------------------------------------------
  console.warn(
    `[send-guardian-code] MODO SIMULAÇÃO — nenhuma mensagem enviada (responsável ${guardian.id}).`,
  );

  return json({ ok: true, guardianId: guardian.id, simulated: true, demoCode: code });
});
