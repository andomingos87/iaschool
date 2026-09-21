import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { getDataLayer } from "@/lib/data";
import type { Photo } from "@/lib/data";
import { signedUrlCacheFor } from "@/lib/gallery/signed-url-cache";
import { qk } from "@/lib/query-keys";

/**
 * Fotos ativas do evento, sem URL (a galeria assina só o que está visível).
 * O Realtime de `batch_jobs` invalida enquanto o worker processa.
 */
export function useEventPhotos(eventId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.photos(eventId ?? ""),
    queryFn: () => data.photos.list(eventId!),
    enabled: Boolean(eventId),
    staleTime: 60_000,
  });
}

/**
 * Pasta do aluno (spec §7.6): as fotos em que um rosto dele foi confirmado
 * na revisão. Enquanto a revisão do M6 não existir, a lista fica vazia — o
 * reconhecimento só produz sugestão, e sugestão não entra aqui (D6).
 */
export function useStudentPhotos(studentId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.studentPhotos(studentId ?? ""),
    queryFn: () => data.photos.listForStudent(studentId!),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

/**
 * URLs assinadas das miniaturas visíveis. `ensure` agrupa em lotes de 100 e
 * o cache vive por evento; o retorno é um getter estável por versão.
 */
export function useThumbUrls(eventId: string, visible: ReadonlyArray<Photo>) {
  const data = getDataLayer();
  const cache = useMemo(
    () => signedUrlCacheFor(eventId, (photos) => data.photos.signThumbUrls(photos)),
    [eventId, data],
  );
  const version = useSyncExternalStore(
    (cb) => cache.subscribe(cb),
    () => cache.version(),
    () => 0,
  );
  useEffect(() => {
    cache.ensure(visible);
  }, [cache, visible]);
  return useCallback((id: string) => cache.get(id), [cache, version]);
}

/** URL assinada da foto grande, para o lightbox; guarda as últimas 20. */
export function useSignedPhotoUrl() {
  const data = getDataLayer();
  const recent = useRef(new Map<string, string>());
  return useCallback(
    async (photo: Pick<Photo, "id" | "storagePath">) => {
      const hit = recent.current.get(photo.id);
      if (hit) return hit;
      const url = await data.photos.signPhotoUrl(photo);
      recent.current.set(photo.id, url);
      if (recent.current.size > 20) {
        const first = recent.current.keys().next().value;
        if (first) recent.current.delete(first);
      }
      return url;
    },
    [data],
  );
}

export function useMovePhotosToTrash(eventId: string) {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => data.photos.moveToTrash(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
      void qc.invalidateQueries({ queryKey: ["events", "photo-counts"] });
    },
  });
}

/** "N fotos não processadas — tentar de novo": reenfileira no servidor. */
export function useRetryFailedJobs(eventId: string) {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => data.photos.retryFailedJobs(eventId),
    onSuccess: (n) => {
      toast({
        title: n === 1 ? "1 foto voltou para a fila" : `${n.toLocaleString("pt-BR")} fotos voltaram para a fila`,
        description: n > 0 ? "O processamento recomeça em instantes." : "Não havia foto com falha.",
      });
      void qc.invalidateQueries({ queryKey: qk.photos(eventId) });
      void qc.invalidateQueries({ queryKey: qk.batch(eventId) });
      void qc.invalidateQueries({ queryKey: qk.event(eventId) });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Não foi possível reenfileirar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });
}
