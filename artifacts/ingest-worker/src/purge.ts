// Expurgo de objetos no Storage (spec §9.4, M6).
//
// Apagar a linha no banco não apaga o arquivo no bucket: o objeto continua
// lá, invisível e cobrado. `purge_expired_biometrics()` e as RPCs de revisão
// enfileiram o caminho em `storage_purge_queue`; é aqui que ele some de
// verdade.
//
// Mora no `ingest-worker` por dois motivos: ele já tem a `service_role` e já
// é um processo que fica de pé. O `face-worker` é caro e escala por vazão de
// GPU/CPU — varrer fila de arquivo não é trabalho dele.

import type { WorkerClient } from "./supabase";

/** Uma linha da fila, como o banco a devolve. */
export interface PurgeItem {
  id: number;
  bucket: string;
  path: string;
  reason: string | null;
  attempts: number;
}

export interface PurgeApi {
  claim(limit: number, leaseSeconds: number): Promise<PurgeItem[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  complete(ids: number[], ok: boolean, error?: string): Promise<void>;
}

function messageOf(error: { message: string } | null): string {
  return error?.message ?? "erro desconhecido";
}

export function makePurgeApi(client: WorkerClient): PurgeApi {
  return {
    async claim(limit, leaseSeconds) {
      const { data, error } = await client.rpc("claim_storage_purge", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new Error(`claim_storage_purge: ${messageOf(error)}`);
      return (data ?? []) as PurgeItem[];
    },
    async remove(bucket, paths) {
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw new Error(`remove ${bucket}: ${messageOf(error)}`);
    },
    async complete(ids, ok, error) {
      const { error: rpcError } = await client.rpc("complete_storage_purge", {
        p_ids: ids,
        p_ok: ok,
        p_error: error ?? null,
      });
      if (rpcError) throw new Error(`complete_storage_purge: ${messageOf(rpcError)}`);
    },
  };
}

export interface PurgeSweepResult {
  claimed: number;
  deleted: number;
  failed: number;
}

/**
 * Uma varredura: reivindica um lote, apaga por bucket e conclui.
 *
 * Apagar objeto que já não existe **não** é falha — o cliente pode ter
 * apagado o recorte na hora da recusa, e a fila é a rede de segurança. Por
 * isso o `remove` do Supabase (que não reclama de caminho inexistente) é
 * exatamente o comportamento desejado aqui.
 *
 * O log leva bucket, contagem e resultado. Nunca o caminho: ele carrega
 * `{school_id}/{event_id}/{photo_id}` e, em `student-refs`, o id do aluno.
 */
export async function runPurgeSweep(
  api: PurgeApi,
  limit: number,
  leaseSeconds: number,
  onEvent?: (fields: Record<string, unknown>, msg: string) => void,
): Promise<PurgeSweepResult> {
  const items = await api.claim(limit, leaseSeconds);
  if (items.length === 0) return { claimed: 0, deleted: 0, failed: 0 };

  const byBucket = new Map<string, PurgeItem[]>();
  for (const item of items) {
    const list = byBucket.get(item.bucket);
    if (list) list.push(item);
    else byBucket.set(item.bucket, [item]);
  }

  let deleted = 0;
  let failed = 0;
  for (const [bucket, group] of byBucket) {
    try {
      await api.remove(bucket, group.map((i) => i.path));
      await api.complete(group.map((i) => i.id), true);
      deleted += group.length;
      onEvent?.({ bucket, count: group.length, result: "deleted" }, "objetos expurgados do Storage");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed += group.length;
      // A conclusão com erro devolve à fila (ou marca `failed` na 5ª
      // tentativa). Se nem isso passar, o lease vence e outro worker repega.
      try {
        await api.complete(group.map((i) => i.id), false, message);
      } catch {
        /* lease vencido resolve */
      }
      onEvent?.({ bucket, count: group.length, result: "failed", err: message },
        "falha ao expurgar objetos do Storage");
    }
  }
  return { claimed: items.length, deleted, failed };
}
