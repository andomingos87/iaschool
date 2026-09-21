import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/** Fotos ativas do evento, com URL assinada de exibição (TTL 1 h). */
export function useEventPhotos(eventId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.photos(eventId ?? ""),
    queryFn: () => data.photos.list(eventId!),
    enabled: Boolean(eventId),
    // As URLs assinadas valem 1 h; antes disso não há por que reassinar.
    staleTime: 50 * 60_000,
  });
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
