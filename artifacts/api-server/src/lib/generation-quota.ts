// Cota diária de gerações persistida no Supabase (tabela generation_usage +
// função consume_generation_quota, ver artifacts/r9-app/supabase/setup.sql).
// A contagem por usuário/dia é atômica no banco, então resiste a reinícios do
// servidor e vale entre múltiplas instâncias.

export type QuotaResult =
  | { kind: "ok"; count: number }
  | { kind: "exceeded" }
  | { kind: "unavailable"; reason: string };

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
 * - "unavailable": Supabase não configurado ou erro na chamada; o chamador
 *   deve cair no contador em memória (melhor do que negar o serviço).
 */
export async function consumeDailyQuota(
  userId: string,
  limit: number,
): Promise<QuotaResult> {
  const config = quotaConfig();
  if (!config) {
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
      return {
        kind: "unavailable",
        reason: `RPC consume_generation_quota falhou (HTTP ${resp.status}): ${body.slice(0, 300)}`,
      };
    }
    const result = (await resp.json()) as number | null;
    if (result === null) return { kind: "exceeded" };
    if (typeof result !== "number") {
      return {
        kind: "unavailable",
        reason: "RPC consume_generation_quota retornou valor inesperado.",
      };
    }
    return { kind: "ok", count: result };
  } catch (err) {
    return {
      kind: "unavailable",
      reason: `Erro ao chamar consume_generation_quota: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
