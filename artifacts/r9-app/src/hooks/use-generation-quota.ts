import { useQuery } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/**
 * Saldo da cota diária de gerações. `data === null` significa que o saldo
 * não está disponível (banco de cota fora do ar / modo sem autenticação) —
 * nesse caso a UI omite o indicador em vez de mostrar número errado.
 */
export function useGenerationQuota() {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.generationQuota,
    queryFn: () => data.generation.getQuota(),
    // Saldo muda a cada geração; não precisa ficar sempre fresquíssimo.
    staleTime: 60_000,
    retry: 1,
  });
}
