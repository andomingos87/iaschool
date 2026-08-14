// Cota diária de gerações persistida no Supabase (tabela generation_usage +
// função consume_generation_quota, ver artifacts/r9-app/supabase/setup.sql).
// A contagem por usuário/dia é atômica no banco, então resiste a reinícios do
// servidor e vale entre múltiplas instâncias.
//
// Circuito de proteção (fail-closed): se o RPC de cota falhar várias vezes
// seguidas, paramos de aceitar gerações ("outage") em vez de cair no contador
// em memória indefinidamente — um reinício zeraria esse contador e a cota
// deixaria de proteger o custo com a OpenAI. Falhas isoladas ainda usam o
// fallback em memória (fail-open) para não negar serviço por um soluço.

export type QuotaResult =
  | { kind: "ok"; count: number }
  | { kind: "exceeded" }
  // Falha pontual do banco — o chamador pode usar o contador em memória.
  | { kind: "unavailable"; reason: string }
  // Falhas repetidas do banco — o chamador deve NEGAR a geração (fail-closed).
  | { kind: "outage"; reason: string; failures: number };

// Nº de falhas consecutivas do RPC a partir do qual negamos gerações.
export const QUOTA_OUTAGE_THRESHOLD = Number(
  process.env["GENERATION_QUOTA_OUTAGE_THRESHOLD"] ?? 3,
);

// Após esse tempo sem tentativas, esquecemos as falhas antigas e damos nova
// chance ao fallback em memória (o banco pode ter voltado há muito tempo).
const FAILURE_MEMORY_MS = 30 * 60 * 1000;

let consecutiveFailures = 0;
let lastFailureAt = 0;

/** Restaura o estado do circuito (uso em testes). */
export function resetQuotaCircuit(): void {
  consecutiveFailures = 0;
  lastFailureAt = 0;
}

function recordFailure(reason: string): QuotaResult {
  const now = Date.now();
  if (now - lastFailureAt > FAILURE_MEMORY_MS) consecutiveFailures = 0;
  consecutiveFailures += 1;
  lastFailureAt = now;
  if (consecutiveFailures >= QUOTA_OUTAGE_THRESHOLD) {
    return { kind: "outage", reason, failures: consecutiveFailures };
  }
  return { kind: "unavailable", reason };
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function quotaConfig(): { url: string; serviceKey: string } | null {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

/**
 * Consome 1 geração da cota diária do usuário no banco.
 * - "ok": consumo registrado (count = total do dia após o consumo)
 * - "exceeded": cota atingida — nada foi consumido
 * - "unavailable": falha pontual (ou Supabase não configurado); o chamador
 *   pode cair no contador em memória.
 * - "outage": o banco de cota falhou repetidas vezes; o chamador deve negar
 *   a geração (fail-closed) para proteger o custo com a OpenAI.
 */
export async function consumeDailyQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const config = quotaConfig();
  if (!config) {
    // Configuração ausente é um estado permanente (não um "banco fora do
    // ar"); não conta para o circuito — mantém o comportamento antigo.
    return {
      kind: "unavailable",
      reason:
        "SUPABASE_SERVICE_ROLE_KEY (e SUPABASE_URL) não configuradas — cota diária persistida indisponível.",
    };
  }
  try {
    const resp = await fetch(
      `${config.url}/rest/v1/rpc/consume_generation_quota`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: userId, p_limit: limit }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return recordFailure(
        `RPC consume_generation_quota falhou (HTTP ${resp.status}): ${body.slice(0, 300)}`,
      );
    }
    const result = (await resp.json()) as number | null;
    if (result === null) {
      recordSuccess();
      return { kind: "exceeded" };
    }
    if (typeof result !== "number") {
      return recordFailure(
        "RPC consume_generation_quota retornou valor inesperado.",
      );
    }
    recordSuccess();
    return { kind: "ok", count: result };
  } catch (err) {
    return recordFailure(
      `Erro ao chamar consume_generation_quota: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
