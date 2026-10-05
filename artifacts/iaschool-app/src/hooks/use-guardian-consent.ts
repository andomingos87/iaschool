import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/** Estado do consentimento de envio por WhatsApp do aluno (Fase 5, W2). */
export function useGuardianConsentStatus(studentId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.guardianConsent(studentId ?? ""),
    queryFn: () => data.guardianConsent.status(studentId!),
    enabled: !!studentId,
  });
}

/**
 * Envia (ou reenvia) o convite ao WhatsApp verificado do responsável.
 * O link não volta ao navegador e um pedido novo invalida o anterior.
 */
export function useRequestGuardianConsent(studentId: string) {
  const data = getDataLayer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => data.guardianConsent.request(studentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qk.guardianConsent(studentId),
      });
    },
  });
}
