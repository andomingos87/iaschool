import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { ReferenceFaceInput } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/** Rostos de referência já processados (a RPC nunca devolve o vetor). */
export function useReferenceFaces(studentId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.referenceFaces(studentId ?? ""),
    queryFn: () => data.referenceFaces.list(studentId!),
    enabled: !!studentId,
  });
}

/**
 * Fotos de referência na fila. Enquanto o `face-worker` (M5) não existir,
 * elas ficam em `queued`: o refetch periódico é o que vai mostrar a virada
 * quando ele entrar, sem mudar a tela.
 */
export function useReferenceJobs(studentId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.referenceJobs(studentId ?? ""),
    queryFn: () => data.referenceFaces.listJobs(studentId!),
    enabled: !!studentId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => j.status !== "failed") ? 30_000 : false,
  });
}

/** Cobertura biométrica por aluno, para o indicador da lista. */
export function useBiometricReadiness(schoolId: string | undefined) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.biometricReadiness(schoolId),
    queryFn: () => data.referenceFaces.readiness(schoolId!),
    enabled: !!schoolId,
  });
}

function useInvalidateReferences(studentId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["reference-faces"] });
    void qc.invalidateQueries({ queryKey: qk.referenceJobs(studentId) });
  };
}

export function useEnqueueReferenceFace(studentId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateReferences(studentId);
  return useMutation({
    mutationFn: (input: ReferenceFaceInput) => data.referenceFaces.enqueue(input),
    onSuccess: invalidate,
  });
}

export function useCancelReferenceJob(studentId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateReferences(studentId);
  return useMutation({
    mutationFn: (jobId: string) => data.referenceFaces.cancelJob(jobId),
    onSuccess: invalidate,
  });
}

export function useRetryReferenceJob(studentId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateReferences(studentId);
  return useMutation({
    mutationFn: (jobId: string) => data.referenceFaces.retryJob(jobId),
    onSuccess: invalidate,
  });
}

export function useRemoveReferenceFace(studentId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateReferences(studentId);
  return useMutation({
    mutationFn: (faceId: string) => data.referenceFaces.remove(faceId),
    onSuccess: invalidate,
  });
}
