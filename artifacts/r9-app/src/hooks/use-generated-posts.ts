import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { GeneratedPost } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useGeneratedPosts() {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.generatedPosts,
    queryFn: () => data.generatedPosts.list(),
  });
}

/** Posts na lixeira (a listagem também dispara o expurgo oportunista). */
export function useTrashedPosts(enabled = true) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.generatedPostsTrash,
    queryFn: () => data.generatedPosts.listTrash(),
    enabled,
  });
}

export function useCreateGeneratedPost() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<GeneratedPost, "id" | "createdAt">) =>
      data.generatedPosts.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.generatedPosts }),
  });
}

function useInvalidateGallery() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.generatedPosts });
    void qc.invalidateQueries({ queryKey: qk.generatedPostsTrash });
  };
}

/** Exclusão normal: move os posts para a lixeira (30 dias). */
export function useMoveToTrash() {
  const data = getDataLayer();
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: (ids: string[]) => data.generatedPosts.moveToTrash(ids),
    onSuccess: invalidate,
  });
}

/** Devolve posts da lixeira para a galeria. */
export function useRestorePosts() {
  const data = getDataLayer();
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: (ids: string[]) => data.generatedPosts.restore(ids),
    onSuccess: invalidate,
  });
}

/** Exclusão definitiva: remove registro + arquivo no Storage. */
export function useDeletePermanently() {
  const data = getDataLayer();
  const invalidate = useInvalidateGallery();
  return useMutation({
    mutationFn: (ids: string[]) => data.generatedPosts.deletePermanently(ids),
    onSuccess: invalidate,
  });
}
