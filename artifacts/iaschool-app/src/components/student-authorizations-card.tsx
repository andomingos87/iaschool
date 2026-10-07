import { useState } from "react";
import { Info, Loader2, ScanFace, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
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
import {
  useGuardianConsentStatus,
  useRequestGuardianConsent,
} from "@/hooks/use-guardian-consent";
import type {
  AuthorizationScope,
  GuardianConsentState,
  GuardianConsentStatus,
  Student,
} from "@/lib/data";
import {
  AUTHORIZATION_SCOPE_DESCRIPTION,
  AUTHORIZATION_SCOPE_LABEL,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";

/**
 * Consentimento por escopo do aluno (spec §5.4).
 *
 * `biometric_sorting` continua um toggle: é declaração da escola, registrada
 * com nome e data. `delivery_whatsapp` (Fase 5, W2) não tem mais toggle: o
 * pedido vai ao WhatsApp verificado do responsável e só o aceite dele, pelo
 * link individual, libera a entrega. A escola acompanha o estado e revoga,
 * mas não aceita no lugar do responsável.
 */
export function StudentAuthorizationsCard({ student }: { student: Student }) {
  const authorizations = useAuthorizations(student.id);
  const grant = useGrantAuthorization(student.id);
  const revoke = useRevokeAuthorization(student.id);
  const consentStatus = useGuardianConsentStatus(student.id);
  const requestConsent = useRequestGuardianConsent(student.id);
  const [confirmRevoke, setConfirmRevoke] = useState<AuthorizationScope | null>(
    null,
  );

  const active = activeByScope(authorizations.data);
  const busy = grant.isPending || revoke.isPending;
  const legacy = active.get("internal_use");
  const deliveryActive = active.get("delivery_whatsapp");
  const consent = consentStatus.data;
  const detail = consentStateDetail(consent);

  async function toggleBiometric(next: boolean) {
    if (!next) {
      setConfirmRevoke("biometric_sorting");
      return;
    }
    try {
      await grant.mutateAsync("biometric_sorting");
      toast({
        title: "Autorização registrada",
        description: `${AUTHORIZATION_SCOPE_LABEL.biometric_sorting} — registrada por você, com data e hora.`,
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

  async function askConsent() {
    try {
      await requestConsent.mutateAsync();
      toast({
        title: "Pedido enviado",
        description:
          "O convite chegou ao WhatsApp verificado do responsável. O link vale 24 horas.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível pedir o consentimento",
        description:
          err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    }
  }

  const biometric = active.get("biometric_sorting");
  const canAskForConsent =
    consent !== undefined &&
    consent.verified &&
    ["none", "expired", "declined", "revoked", "school_declared"].includes(
      consent.state,
    );
  const askLabel =
    consent?.state === "declined" ||
    consent?.state === "expired" ||
    consent?.state === "revoked"
      ? "Pedir de novo"
      : "Pedir aceite ao responsável";

  return (
    <Card className="border-border" data-testid="card-student-authorizations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" /> Autorizações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            <Label
              htmlFor={`authorization-biometric_sorting`}
              className="flex items-center gap-2 font-medium"
            >
              <ScanFace className="size-4 text-muted-foreground" />
              Reconhecer o rosto
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {AUTHORIZATION_SCOPE_DESCRIPTION.biometric_sorting}
            </p>
            {biometric?.grantedAt && (
              <p
                className="mt-1 text-xs text-muted-foreground"
                data-testid="text-authorization-granted-biometric_sorting"
              >
                Registrada em {formatDateTime(biometric.grantedAt)}
                {biometric.evidence?.registeredBy
                  ? ` por ${biometric.evidence.registeredBy}`
                  : ""}
                .
              </p>
            )}
          </div>
          <Switch
            id={`authorization-biometric_sorting`}
            checked={Boolean(biometric)}
            disabled={busy || authorizations.isLoading}
            onCheckedChange={(next) => void toggleBiometric(next)}
            data-testid={`switch-authorization-biometric_sorting`}
          />
        </div>

        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="min-w-0">
            <Label className="flex items-center gap-2 font-medium">
              <Send className="size-4 text-muted-foreground" />
              Enviar ao responsável
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {AUTHORIZATION_SCOPE_DESCRIPTION.delivery_whatsapp}
            </p>
            {consentStatus.isLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">Consultando…</p>
            ) : consentStatus.isError ? (
              <p className="mt-2 text-xs text-destructive">
                Não foi possível consultar o consentimento.
              </p>
            ) : consent ? (
              <div className="mt-2 space-y-1" data-testid="consent-delivery-status">
                <Badge
                  variant={CONSENT_BADGE[consent.state].variant}
                  data-testid={`badge-consent-${consent.state}`}
                >
                  {CONSENT_BADGE[consent.state].label}
                </Badge>
                {detail && (
                  <p className="text-xs text-muted-foreground">{detail}</p>
                )}
              </div>
            ) : null}
            {consent && !consent.verified && (
              <p
                className="mt-2 flex items-start gap-1.5 text-xs text-destructive"
                data-testid="text-consent-verify-first"
              >
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                {student.primaryGuardianId
                  ? "Verifique o WhatsApp do responsável nesta página antes de pedir o consentimento."
                  : "Cadastre o responsável legal do aluno antes de pedir o consentimento."}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {deliveryActive && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmRevoke("delivery_whatsapp")}
                data-testid="button-revoke-delivery"
              >
                Revogar
              </Button>
            )}
            {canAskForConsent && (
              <Button
                size="sm"
                disabled={requestConsent.isPending}
                onClick={() => void askConsent()}
                data-testid="button-request-consent"
              >
                {requestConsent.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {askLabel}
              </Button>
            )}
          </div>
        </div>

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
            Sem reconhecimento, o rosto não é separado. Sem o aceite do
            responsável, nada é enviado. Na foto que vai para uma família, as
            outras crianças saem desfocadas.
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
              {confirmRevoke === "delivery_whatsapp" &&
                " Novas entregas ficam bloqueadas; o que já foi baixado não pode ser recolhido."}
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

/** Rótulo e variante do selo por estado do consentimento de envio. */
const CONSENT_BADGE: Record<
  GuardianConsentState,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  none: { label: "Ainda não pedido", variant: "outline" },
  pending: { label: "Aguardando resposta", variant: "secondary" },
  accepted: { label: "Aceito pelo responsável", variant: "default" },
  declined: { label: "Recusado pelo responsável", variant: "destructive" },
  expired: { label: "Pedido expirado", variant: "outline" },
  revoked: { label: "Aceite revogado", variant: "outline" },
  school_declared: { label: "Declarado pela escola", variant: "secondary" },
};

function consentStateDetail(
  status: GuardianConsentStatus | undefined,
): string | null {
  if (!status) return null;
  switch (status.state) {
    case "pending":
      return `Pedido enviado${
        status.requestedAt ? ` em ${formatDateTime(status.requestedAt)}` : ""
      }. O link vale até ${
        status.expiresAt ? formatDateTime(status.expiresAt) : "as próximas 24 horas"
      }.`;
    case "accepted":
      return status.answeredAt
        ? `Aceito em ${formatDateTime(status.answeredAt)} pelo link enviado ao WhatsApp verificado.`
        : "Aceito pelo link enviado ao WhatsApp verificado.";
    case "declined":
      return status.answeredAt
        ? `Recusado em ${formatDateTime(status.answeredAt)}.`
        : "Recusado pelo responsável.";
    case "expired":
      return "O link expirou sem resposta. Pedir de novo gera um novo link.";
    case "revoked":
      return "O aceite foi revogado; uma nova entrega exige novo aceite.";
    case "school_declared":
      return "A escola declarou a autorização, mas ela não substitui o aceite do responsável e não libera a entrega.";
    case "none":
      return null;
  }
}
