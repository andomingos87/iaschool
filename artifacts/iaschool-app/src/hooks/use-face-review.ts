import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { FaceRejectState, PhotoFaceState } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/**
 * Os rostos pendentes do evento (spec §7.5). Enquanto o `face-worker` não
 * tiver processado o lote, a lista volta vazia e a tela explica por quê.
 */
export function useReviewFaces(eventId: string | null, states?: PhotoFaceState[]) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.reviewFaces(eventId ?? "", states),
    queryFn: () => data.faceReview.listForEvent(eventId!, states),
    enabled: !!eventId,
  });
}

export function useReviewCounts(eventId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.reviewCounts(eventId ?? ""),
    queryFn: () => data.faceReview.counts(eventId!),
    enabled: !!eventId,
  });
}

/** Candidatos de um rosto da fila individual. Só busca quando a tela abre o item. */
export function useFaceCandidates(faceId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.faceCandidates(faceId ?? ""),
    queryFn: () => data.faceReview.candidates(faceId!),
    enabled: !!faceId,
  });
}

function useInvalidateReview(eventId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["review", eventId] });
    // A pasta do aluno e o status do evento mudam junto com a confirmação.
    void qc.invalidateQueries({ queryKey: ["photos", "student"] });
    void qc.invalidateQueries({ queryKey: qk.event(eventId) });
  };
}

/** Confirmação em lote por aluno: um ato humano cobrindo N recortes (§7.5). */
export function useConfirmFaces(eventId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateReview(eventId);
  return useMutation({
    mutationFn: (input: { faceIds: string[]; studentId: string }) =>
      data.faceReview.confirmBulk(input.faceIds, input.studentId),
    onSuccess: invalidate,
  });
}

export function useRejectFace(eventId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateReview(eventId);
  return useMutation({
    mutationFn: (input: { faceId: string; state: FaceRejectState; reason?: string }) =>
      data.faceReview.reject(input.faceId, input.state, input.reason),
    onSuccess: invalidate,
  });
}
