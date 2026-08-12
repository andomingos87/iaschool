import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function usePromptTemplate() {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.promptTemplate,
    queryFn: () => data.promptTemplate.get(),
  });
}

export function useSavePromptTemplate() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (template: string) => data.promptTemplate.save(template),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.promptTemplate }),
  });
}

export function useResetPromptTemplate() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => data.promptTemplate.reset(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.promptTemplate }),
  });
}
