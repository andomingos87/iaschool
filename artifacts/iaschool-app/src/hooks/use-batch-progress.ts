import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { BatchJob } from "@/lib/data";
import { createThrottle } from "@/lib/gallery/throttle";
import { qk } from "@/lib/query-keys";

/** Enquanto o worker processa, a galeria é refeita no máximo a cada 3 s. */
const PHOTOS_REFRESH_MS = 3_000;
/** Rede de segurança caso o canal Realtime caia: 1 linha a cada 15 s. */
const SAFETY_POLL_MS = 15_000;

/**
 * Progresso do servidor (R1): último lote `ingest` do evento, atualizado
 * pelo Realtime em `batch_jobs`. Cada UPDATE reflete no lote na hora; a
 * lista de fotos (miniaturas chegando) é invalidada com throttle.
 */
export function useBatchProgress(eventId: string | null) {
  const data = getDataLayer();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: qk.batch(eventId ?? ""),
    queryFn: () => data.photos.latestBatch(eventId!),
    enabled: Boolean(eventId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? SAFETY_POLL_MS : false),
  });

  const refreshPhotos = useMemo(
    () =>
      createThrottle(() => {
        if (eventId) void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
      }, PHOTOS_REFRESH_MS),
    [eventId, qc],
  );

  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = data.photos.onBatchChange(eventId, (batch: BatchJob) => {
      qc.setQueryData<BatchJob | null>(qk.batch(eventId), (old) => {
        // Só o lote mais recente interessa a esta tela.
        if (old && old.id !== batch.id && old.createdAt > batch.createdAt) return old;
        return batch;
      });
      if (batch.status === "running") {
        refreshPhotos();
      } else {
        // Lote fechou: galeria, status do evento e lista de eventos de uma vez.
        refreshPhotos.flush();
        void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
        void qc.invalidateQueries({ queryKey: qk.event(eventId) });
        void qc.invalidateQueries({ queryKey: ["events"] });
      }
    });
    return () => {
      unsubscribe();
      refreshPhotos.cancel();
    };
  }, [eventId, data, qc, refreshPhotos]);

  return { batch: query.data ?? null, isLoading: query.isLoading };
}
