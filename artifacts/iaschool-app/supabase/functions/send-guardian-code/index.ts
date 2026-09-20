/**
 * send-guardian-code — verificação do canal do responsável legal.
 *
 * ⚠️ MODO SIMULAÇÃO (fase MVP)
 *
 * Esta versão NÃO envia nada para o WhatsApp. Ela gera o código, grava em
 * `guardian_verification_codes` e devolve o código à própria tela, que o
 * exibe com o aviso "Modo demonstração". Serve para exercitar o fluxo real
 * de ponta a ponta (RPC `confirm_guardian_code` → `students.guardian` →
 * `share_logs`) sem tocar em canal de verdade.
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
 * Base legal do fluxo: Decreto nº 12.880/2026, art. 35.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Precisa bater com a checagem de `expires_at` em confirm_guardian_code. */
const CODE_TTL_MINUTES = 10;
/** Antiflood: intervalo mínimo entre dois envios para o mesmo aluno. */
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

  let studentId: string | undefined;
  try {
    studentId = (await req.json())?.studentId;
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  if (!studentId) return json({ error: "Aluno não informado." }, 400);

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

  const isSuperAdmin = profile?.role === "super_admin";
  const canWrite =
    profile?.approval_status === "approved" &&
    (profile?.role === "school_user" || isSuperAdmin);
  if (!canWrite) {
    return json({ error: "Sua conta não pode verificar responsáveis." }, 403);
  }

  const { data: student } = await admin
    .from("students")
    .select("owner_id, guardian, deleted_at")
    .eq("id", studentId)
    .maybeSingle();

  if (!student || student.deleted_at) {
    return json({ error: "Aluno não encontrado." }, 404);
  }
  if (student.owner_id !== user.id && !isSuperAdmin) {
    return json({ error: "Este aluno não pertence à sua escola." }, 403);
  }

  const whatsapp = (student.guardian as { whatsapp?: string } | null)?.whatsapp;
  if (!whatsapp) {
    return json(
      { error: "Cadastre o responsável legal antes de verificar o WhatsApp." },
      400,
    );
  }

  const { data: pending } = await admin
    .from("guardian_verification_codes")
    .select("created_at")
    .eq("student_id", studentId)
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
      student_id: studentId,
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
  // Depois disso, devolva apenas { ok: true } — sem `demoCode`, sem
  // `simulated`.
  // ---------------------------------------------------------------------
  console.warn(
    `[send-guardian-code] MODO SIMULAÇÃO — nenhuma mensagem enviada (aluno ${studentId}).`,
  );

  return json({ ok: true, simulated: true, demoCode: code });
});
