import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/** Rede de segurança caso o canal Realtime caia: 1 consulta a cada 15 s. */
const SAFETY_POLL_MS = 15_000;

const ACTIVE_BATCH_STATUSES = ["draft", "preparing", "awaiting_review", "ready", "queued"];

/** Retrato do evento para o preflight da entrega (Fase 5, W3). */
export function useDeliveryPreflight(eventId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.deliveryPreflight(eventId ?? ""),
    queryFn: () => data.deliveries.preflight(eventId!),
    enabled: Boolean(eventId),
  });
}

/**
 * Lotes do evento, com Realtime em `delivery_batches` (só o sinal; os dados
 * vêm das RPCs mascaradas). Enquanto existe lote ativo, um polling lento
 * cobre a queda do canal.
 */
export function useDeliveryBatches(eventId: string | null) {
  const data = getDataLayer();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.deliveryBatches(eventId ?? ""),
    queryFn: () => data.deliveries.batchesForEvent(eventId!),
    enabled: Boolean(eventId),
    refetchInterval: (q) => {
      const list = q.state.data;
      if (!list) return false;
      return list.some((b) => ACTIVE_BATCH_STATUSES.includes(b.status))
        ? SAFETY_POLL_MS
        : false;
    },
  });

  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = data.deliveries.onBatchChange(eventId, () => {
      void queryClient.invalidateQueries({ queryKey: qk.deliveryBatches(eventId) });
      void queryClient.invalidateQueries({ queryKey: ["delivery-batch"] });
    });
    return unsubscribe;
  }, [eventId, data, queryClient]);

  return query;
}

export function useDeliveryBatchDetail(batchId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.deliveryBatch(batchId ?? ""),
    queryFn: () => data.deliveries.batchDetail(batchId!),
    enabled: Boolean(batchId),
  });
}

function useInvalidateDeliveries(eventId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.deliveryPreflight(eventId) });
    void queryClient.invalidateQueries({ queryKey: qk.deliveryBatches(eventId) });
    void queryClient.invalidateQueries({ queryKey: ["delivery-batch"] });
  };
}

export function useCreateDeliveryBatch(eventId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateDeliveries(eventId);
  return useMutation({
    mutationFn: (input: { guardianIds: string[]; termsVersion: string }) =>
      data.deliveries.createBatch(eventId, input.guardianIds, input.termsVersion),
    onSuccess: invalidate,
  });
}

export function useApproveDeliveryBatch(eventId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateDeliveries(eventId);
  return useMutation({
    mutationFn: (batchId: string) => data.deliveries.approveBatch(batchId),
    onSuccess: invalidate,
  });
}

export function useCancelDeliveryBatch(eventId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateDeliveries(eventId);
  return useMutation({
    mutationFn: (batchId: string) => data.deliveries.cancelBatch(batchId),
    onSuccess: invalidate,
  });
}

export function useRetryDeliveryRenders(eventId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateDeliveries(eventId);
  return useMutation({
    mutationFn: (batchId: string) => data.deliveries.retryFailedRenders(batchId),
    onSuccess: invalidate,
  });
}

/** Prévia: URLs assinadas de 5 minutos; a grade refaz a consulta ao reabrir. */
export function useDeliveryPreview(batchId: string | null, enabled: boolean) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.deliveryPreview(batchId ?? ""),
    queryFn: () => data.deliveries.previewItems(batchId!),
    enabled: Boolean(batchId) && enabled,
    staleTime: 4 * 60_000,
  });
}
