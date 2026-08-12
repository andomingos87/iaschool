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

export function useCreateGeneratedPost() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<GeneratedPost, "id" | "createdAt">) =>
      data.generatedPosts.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.generatedPosts }),
  });
}
