import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataLayer } from "@/lib/data";
import type { Authorization, AuthorizationScope } from "@/lib/data";
import { isAuthorizationActive } from "@/lib/data";
import { qk } from "@/lib/query-keys";

/** Histórico de autorizações do aluno, incluindo as revogadas. */
export function useAuthorizations(studentId: string | null) {
  const data = getDataLayer();
  return useQuery({
    queryKey: qk.authorizations(studentId ?? ""),
    queryFn: () => data.authorizations.listForStudent(studentId!),
    enabled: !!studentId,
  });
}

/** Autorização ativa de cada escopo (a revogada some do mapa). */
export function activeByScope(
  list: Authorization[] | undefined,
): Map<AuthorizationScope, Authorization> {
  const out = new Map<AuthorizationScope, Authorization>();
  for (const a of list ?? []) {
    if (isAuthorizationActive(a)) out.set(a.scope, a);
  }
  return out;
}

function useInvalidateAuthorizations(studentId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.authorizations(studentId) });
    // Consentimento derrubado muda a cobertura biométrica da escola inteira.
    void qc.invalidateQueries({ queryKey: ["reference-faces"] });
  };
}

export function useGrantAuthorization(studentId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateAuthorizations(studentId);
  return useMutation({
    mutationFn: (scope: AuthorizationScope) =>
      data.authorizations.grant({ studentId, scope }),
    onSuccess: invalidate,
  });
}

export function useRevokeAuthorization(studentId: string) {
  const data = getDataLayer();
  const invalidate = useInvalidateAuthorizations(studentId);
  return useMutation({
    mutationFn: (id: string) => data.authorizations.revoke(id),
    onSuccess: invalidate,
  });
}
