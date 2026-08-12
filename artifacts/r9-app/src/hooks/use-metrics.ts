import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import { qk } from "@/lib/query-keys";

export function useMetrics() {
  const data = getDataLayer();
  return useQuery({ queryKey: qk.metrics, queryFn: () => data.metrics.list() });
}

export function useCreateMetric() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => data.metrics.createCustom(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.metrics }),
  });
}

export function useDeleteMetric() {
  const data = getDataLayer();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.metrics.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.metrics }),
  });
}
