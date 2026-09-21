import { useState } from "react";
import { Info, ScanFace, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { Switch } from "@workspace/iaschool-ui/components/ui/switch";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/iaschool-ui/components/ui/alert-dialog";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import {
  activeByScope,
  useAuthorizations,
  useGrantAuthorization,
  useRevokeAuthorization,
} from "@/hooks/use-authorizations";
import type { AuthorizationScope, Student } from "@/lib/data";
import {
  AUTHORIZATION_SCOPE_DESCRIPTION,
  AUTHORIZATION_SCOPE_LABEL,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";

/**
 * Os dois escopos que a escola declara na ficha do aluno (M4). `internal_use`
 * e `social_media` existem no banco mas não têm tela ainda: o primeiro só
 * aparece aqui quando veio da migração do consentimento antigo.
 */
const EDITABLE_SCOPES: Array<{
  scope: AuthorizationScope;
  icon: typeof ScanFace;
}> = [
  { scope: "biometric_sorting", icon: ScanFace },
  { scope: "delivery_whatsapp", icon: Send },
];

/**
 * Consentimento por escopo do aluno (spec §5.4). Cada toggle grava uma linha
 * em `authorizations` com a evidência de quem registrou e quando — nunca um
 * booleano em `students`.
 *
 * **O toggle é declaração da escola**, não o aceite do responsável: a escola
 * afirma que colheu a autorização fora do produto. O aceite do próprio
 * responsável, com termo versionado, depende do texto jurídico e do portal da
 * Fase 4 (`BACKLOG.md`, Transversal).
 */
export function StudentAuthorizationsCard({ student }: { student: Student }) {
  const authorizations = useAuthorizations(student.id);
  const grant = useGrantAuthorization(student.id);
  const revoke = useRevokeAuthorization(student.id);
  const [confirmRevoke, setConfirmRevoke] = useState<AuthorizationScope | null>(null);

  const active = activeByScope(authorizations.data);
  const busy = grant.isPending || revoke.isPending;
  const legacy = active.get("internal_use");

  async function toggle(scope: AuthorizationScope, next: boolean) {
    if (!next) {
      setConfirmRevoke(scope);
      return;
    }
    try {
      await grant.mutateAsync(scope);
      toast({
        title: "Autorização registrada",
        description: `${AUTHORIZATION_SCOPE_LABEL[scope]} — registrada por você, com data e hora.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível registrar",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    }
  }

  async function doRevoke(scope: AuthorizationScope) {
    const target = active.get(scope);
    setConfirmRevoke(null);
    if (!target) return;
    try {
      await revoke.mutateAsync(target.id);
      toast({
        title: "Autorização revogada",
        description: `${AUTHORIZATION_SCOPE_LABEL[scope]} — o registro anterior fica no histórico.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível revogar",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    }
  }

  return (
    <Card className="border-border" data-testid="card-student-authorizations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" /> Autorizações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {EDITABLE_SCOPES.map(({ scope, icon: Icon }) => {
          const current = active.get(scope);
          return (
            <div
              key={scope}
              className="flex items-start justify-between gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <Label
                  htmlFor={`authorization-${scope}`}
                  className="flex items-center gap-2 font-medium"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {AUTHORIZATION_SCOPE_LABEL[scope]}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {AUTHORIZATION_SCOPE_DESCRIPTION[scope]}
                </p>
                {current?.grantedAt && (
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid={`text-authorization-granted-${scope}`}
                  >
                    Registrada em {formatDateTime(current.grantedAt)}
                    {current.evidence?.registeredBy
                      ? ` por ${current.evidence.registeredBy}`
                      : ""}
                    .
                  </p>
                )}
              </div>
              <Switch
                id={`authorization-${scope}`}
                checked={Boolean(current)}
                disabled={busy || authorizations.isLoading}
                onCheckedChange={(next) => void toggle(scope, next)}
                data-testid={`switch-authorization-${scope}`}
              />
            </div>
          );
        })}

        {legacy && (
          <div className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <Badge variant="secondary" data-testid="badge-authorization-internal-use">
              {AUTHORIZATION_SCOPE_LABEL.internal_use}
            </Badge>
            <span>
              {legacy.evidence?.source === "students.guardian.consentAt"
                ? "Herdada do consentimento registrado antes desta tela; vale só para uso interno."
                : "Registrada para uso interno da escola."}
            </span>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Marcar aqui é a escola declarar que colheu a autorização do
            responsável. Não substitui o aceite dele no termo, que ainda não
            está disponível. Revogar não recupera o material já entregue.
          </span>
        </p>
      </CardContent>

      <AlertDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => !open && setConfirmRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revogar "{confirmRevoke && AUTHORIZATION_SCOPE_LABEL[confirmRevoke]}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O registro atual fica no histórico com a data da revogação — nada
              é apagado. Registrar de novo depois cria uma autorização nova.
              {confirmRevoke === "biometric_sorting" &&
                " Sem esta autorização não é possível cadastrar novos rostos de referência deste aluno."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRevoke && void doRevoke(confirmRevoke)}
              disabled={busy}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-revoke"
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
