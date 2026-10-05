import { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
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
import { BrandLogo } from "@/components/brand-logo";
import { getDataLayer } from "@/lib/data";
import type { GuardianConsentAnswer } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

/**
 * Página pública do consentimento (Fase 5, W2). Fica fora do `AuthGate`: a
 * posse do token do link é a credencial. O responsável confere escola e
 * criança, lê o termo versionado e aceita ou recusa — a escola nunca aceita
 * por ele.
 */
export default function ConsentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const data = getDataLayer();
  const [outcome, setOutcome] = useState<GuardianConsentAnswer | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);

  const view = useQuery({
    queryKey: ["guardian-consent-view", token],
    queryFn: () => data.guardianConsent.getByToken(token),
    retry: false,
    enabled: token.length > 0,
  });

  const respond = useMutation({
    mutationFn: (action: "accept" | "decline") =>
      data.guardianConsent.respond(token, action),
    onSuccess: (answer) => setOutcome(answer),
  });

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-xl space-y-4">
        <div className="flex justify-center">
          <BrandLogo />
        </div>

        {outcome ? (
          <Card className="border-border">
            <CardContent className="space-y-3 pt-6 text-center">
              {outcome === "accepted" ? (
                <>
                  <CheckCircle2 className="mx-auto size-10 text-primary" />
                  <h1 className="text-lg font-semibold">Autorização registrada</h1>
                  <p className="text-sm text-muted-foreground">
                    A escola foi informada. As fotos do evento chegam pelo
                    WhatsApp quando o álbum for aprovado — a mensagem traz
                    apenas um link privado.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto size-10 text-muted-foreground" />
                  <h1 className="text-lg font-semibold">Resposta registrada</h1>
                  <p className="text-sm text-muted-foreground">
                    Nenhuma foto será enviada por este aceite. Se mudar de
                    ideia, peça um novo link à escola.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : view.isLoading ? (
          <Card className="border-border">
            <CardContent className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
              <Spinner className="size-6" />
              Abrindo a solicitação…
            </CardContent>
          </Card>
        ) : view.isError || !view.data ? (
          <Card className="border-border">
            <CardContent className="space-y-3 pt-6 text-center">
              <AlertTriangle className="mx-auto size-10 text-destructive" />
              <h1 className="text-lg font-semibold">Não foi possível abrir</h1>
              <p className="text-sm text-muted-foreground">
                {view.error instanceof Error
                  ? view.error.message
                  : "Este link não é válido. Peça um novo à escola."}
              </p>
            </CardContent>
          </Card>
        ) : view.data.state !== "pending" ? (
          <Card className="border-border">
            <CardContent className="space-y-3 pt-6 text-center">
              <ShieldCheck className="mx-auto size-10 text-primary" />
              <h1 className="text-lg font-semibold">
                {view.data.state === "accepted"
                  ? "Este envio já foi autorizado"
                  : view.data.state === "declined"
                    ? "Este pedido foi recusado"
                    : view.data.state === "expired"
                      ? "Este link expirou"
                      : "Este link foi substituído"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {view.data.state === "accepted"
                  ? "Você já autorizou este envio. Para revogar, fale com a escola."
                  : "Peça um novo link à escola se quiser responder de novo."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border" data-testid="card-consent-request">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="size-5 text-primary" />
                {view.data.terms.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <p>
                {view.data.guardianFirstName ? `Olá, ${view.data.guardianFirstName}. ` : ""}
                <strong>{view.data.schoolName}</strong> pediu sua autorização
                para enviar por WhatsApp as fotos em que{" "}
                {view.data.studentFirstNames.length > 0
                  ? view.data.studentFirstNames.join(" e ")
                  : "seu filho"}{" "}
                aparece.
              </p>

              <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
                {view.data.terms.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-xs text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Termo {view.data.terms.version}
                {view.data.expiresAt
                  ? ` · este link vale até ${formatDateTime(view.data.expiresAt)}`
                  : ""}
                . Link privado e de uso único: não compartilhe.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  className="sm:flex-1"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate("accept")}
                  data-testid="button-consent-accept"
                >
                  {respond.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Autorizar envio
                </Button>
                <Button
                  variant="outline"
                  className="sm:flex-1"
                  disabled={respond.isPending}
                  onClick={() => setConfirmDecline(true)}
                  data-testid="button-consent-decline"
                >
                  Não autorizar
                </Button>
              </div>

              {respond.isError && (
                <p className="text-center text-xs text-destructive">
                  {respond.error instanceof Error
                    ? respond.error.message
                    : "Não foi possível registrar a resposta."}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={confirmDecline} onOpenChange={setConfirmDecline}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar o envio das fotos?</AlertDialogTitle>
            <AlertDialogDescription>
              Nenhuma foto será enviada por este aceite. A escola vê apenas que
              você recusou — o motivo não é pedido nem registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-decline">
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDecline(false);
                respond.mutate("decline");
              }}
              data-testid="button-confirm-decline"
            >
              Recusar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
