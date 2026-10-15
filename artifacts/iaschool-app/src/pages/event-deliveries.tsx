import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { Badge } from "@workspace/iaschool-ui/components/ui/badge";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/iaschool-ui/components/ui/card";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
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
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { DeliveryDraftDialog } from "@/components/delivery-draft-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDeliveryService } from "@/lib/delivery-service";
import { canResendRecipient, canTransmitRecipient, isActiveDeliveryBatch, canApproveDeliveryForSchool, deliveryPreparationState, canRevokeDeliveryAccess } from "@/lib/delivery-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useEvent } from "@/hooks/use-events";
import {
  useApproveDeliveryBatch,
  useCancelDeliveryBatch,
  useCreateDeliveryBatch,
  useDeliveryBatchDetail,
  useDeliveryBatches,
  useDeliveryPreflight,
  useRetryDeliveryRenders,
} from "@/hooks/use-deliveries";
import { getDataLayer } from "@/lib/data";
import type {
  DeliveryBatchSummary,
  DeliveryRecipientStatus,
} from "@/lib/data";
import {
  DELIVERY_BATCH_STATUS_LABEL,
  DELIVERY_BLOCKED_REASON_LABEL,
  DELIVERY_RECIPIENT_STATUS_LABEL,
  DELIVERY_TERMS_VERSION,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";

const TERMINAL_BATCH_STATUSES = ["completed", "completed_with_errors", "canceled"];

function statusBadgeVariant(status: DeliveryBatchSummary["status"]) {
  if (status === "canceled") return "secondary" as const;
  if (status === "awaiting_review") return "outline" as const;
  if (status === "queued" || status === "processing") return "default" as const;
  return status === "completed" ? ("default" as const) : ("secondary" as const);
}

function recipientBadgeVariant(status: DeliveryRecipientStatus) {
  if (status === "blocked" || status === "failed" || status === "expired" || status === "revoked") {
    return "destructive" as const;
  }
  if (status === "delivered" || status === "read" || status === "accepted") return "default" as const;
  return "secondary" as const;
}

/**
 * Entregas do evento (Fase 5, W3 — `/eventos/:id/entregas`): preflight por
 * responsável, criação do lote, progresso das fotos, prévia nítida e
 * aprovação por papel. O envio em si chega no W4. Enquanto não há sinal de
 * modo no cliente, esta tela prepara o lote e diz que o WhatsApp está desligado.
 */
export default function EventDeliveriesPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? "";
  const event = useEvent(eventId || null);
  const preflight = useDeliveryPreflight(eventId || null);
  const batches = useDeliveryBatches(eventId || null);
  const createBatch = useCreateDeliveryBatch(eventId);
  const approveBatch = useApproveDeliveryBatch(eventId);
  const cancelBatch = useCancelDeliveryBatch(eventId);
  const retryRenders = useRetryDeliveryRenders(eventId);
  const { session } = useAuth();

  const canApprove = canApproveDeliveryForSchool(session?.user.schools ?? [], event.data?.schoolId);

  /** Destinatários desmarcados; o padrão é todo mundo apto selecionado. */
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [previewBatch, setPreviewBatch] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const eligible = useMemo(
    () => (preflight.data?.recipients ?? []).filter((r) => r.eligible && r.guardianId),
    [preflight.data],
  );
  const selected = eligible
    .filter((r) => !deselected.has(r.guardianId!))
    .map((r) => r.guardianId!);
  const activeBatch = (batches.data ?? []).find((b) =>
    isActiveDeliveryBatch(b.status),
  );

  async function onCreate() {
    try {
      await createBatch.mutateAsync({
        guardianIds: selected,
        termsVersion: DELIVERY_TERMS_VERSION,
      });
      setDeselected(new Set());
      toast({
        title: "Lote criado",
        description:
          "As fotos estão sendo preparadas. Depois, confira as fotos e a mensagem para aprovar.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível criar o lote",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function onApprove(batchId: string) {
    try {
      const result = await approveBatch.mutateAsync(batchId);
      toast(
        result.approved > 0
          ? {
              title: "Lote aprovado",
              description:
                `${result.approved} ${result.approved === 1 ? "destinatário entrou" : "destinatários entraram"} na fila do servidor. Aprovar não transmite a mensagem; o envio revalida o modo, o número, as autorizações e os arquivos` +
                (result.blocked > 0
                  ? ` · ${result.blocked} bloqueado(s) por número ou aceite.`
                  : "."),
            }
          : {
              variant: "destructive",
              title: "Nenhum destinatário liberado",
              description: "O número, a autorização ou as fotos mudaram. Confira o álbum novamente.",
            },
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível aprovar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function onCancel(batchId: string) {
    setConfirmCancel(null);
    try {
      await cancelBatch.mutateAsync(batchId);
      toast({
        title: "Lote cancelado",
        description: "Este preparo foi cancelado. As fotos preparadas serão removidas.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível cancelar",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  async function onRetry(batchId: string) {
    try {
      const count = await retryRenders.mutateAsync(batchId);
      toast({
        title: count > 0 ? `${count} ${count === 1 ? "foto voltou" : "fotos voltaram"} para o preparo` : "Nenhuma foto precisa de nova tentativa",
        description: "As fotos selecionadas que precisam de atualização serão preparadas novamente. Depois, confira o álbum.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível tentar novamente",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  }

  if (event.isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <CardsSkeleton count={2} />
      </div>
    );
  }
  if (event.isError || !event.data) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState onRetry={() => event.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href={`/eventos/${eventId}`} data-testid="link-back-event">
            <ArrowLeft className="size-4" /> {event.data.name}
          </Link>
        </Button>
        <PageHeader
          title="Entregas aos responsáveis"
          description="Escolha as fotos, confira a mensagem e aprove o álbum. Todas as fotos ficam nítidas."
        />
        <ol className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground" aria-label="Etapas da entrega">
          <li>1. Preparar fotos</li><li>2. Conferir e aprovar</li><li>3. Enviar acesso ao álbum</li>
        </ol>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-whatsapp-off">O WhatsApp envia uma mensagem com o link do álbum privado. Preparar ou aprovar fotos não envia a mensagem.</p>
      </div>

      <Card className="border-border" data-testid="card-delivery-preflight">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="size-4 text-primary" /> Quem pode receber
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {preflight.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-4" /> Conferindo responsáveis e autorizações…
            </div>
          ) : preflight.isError ? (
            <p className="text-destructive">
              Não foi possível conferir os responsáveis deste evento.
            </p>
          ) : (preflight.data?.recipients.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">
              Nenhum aluno com fotos ou revisão pendente neste evento ainda.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {eligible.length}{" "}
                {eligible.length === 1 ? "responsável apto" : "responsáveis aptos"}
                {preflight.data && preflight.data.unassignedPendingFaces > 0
                  ? ` · ${preflight.data.unassignedPendingFaces} rosto(s) sem atribuição na revisão`
                  : ""}
                .
              </p>
              <div className="space-y-2">
                {preflight.data?.recipients.map((recipient) => {
                  const key = recipient.guardianId ?? `sem-${recipient.students[0]?.studentId}`;
                  const checked =
                    !!recipient.guardianId && !deselected.has(recipient.guardianId);
                  return (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                      data-testid={`delivery-recipient-${key}`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {recipient.eligible && recipient.guardianId && !activeBatch && (
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = new Set(deselected);
                              if (v === true) next.delete(recipient.guardianId!);
                              else next.add(recipient.guardianId!);
                              setDeselected(next);
                            }}
                            className="mt-0.5"
                            data-testid={`checkbox-recipient-${key}`}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium">
                            {recipient.guardianName ?? "Sem responsável cadastrado"}
                            {recipient.phoneMasked ? (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">
                                {recipient.phoneMasked}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {recipient.students
                              .map(
                                (s) =>
                                  `${s.name} (${s.confirmedPhotos} foto${s.confirmedPhotos === 1 ? "" : "s"}${
                                    s.pendingFaces > 0 ? `, ${s.pendingFaces} em revisão` : ""
                                  })`,
                              )
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      {recipient.eligible ? (
                        <Badge variant="default" data-testid={`badge-eligible-${key}`}>
                          Apto
                        </Badge>
                      ) : (
                        <Badge variant="destructive" data-testid={`badge-blocked-${key}`}>
                          {DELIVERY_BLOCKED_REASON_LABEL[recipient.blockedReason ?? ""] ??
                            "Bloqueado"}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              {activeBatch ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-4 text-primary" />
                  O preparo abaixo já inclui os responsáveis. Confira as fotos para continuar.
                </p>
              ) : (
                <Button
                  onClick={() => void onCreate()}
                  disabled={selected.length === 0 || createBatch.isPending}
                  data-testid="button-create-delivery-batch"
                >
                  {createBatch.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Preparar fotos para {selected.length}{" "}
                  {selected.length === 1 ? "responsável" : "responsáveis"}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {batches.isError ? (
        <ErrorState onRetry={() => batches.refetch()} />
      ) : (batches.data?.length ?? 0) > 0 && (
        <section className="space-y-4" data-testid="section-delivery-batches">
          {batches.data!.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              canApprove={canApprove}
              busy={
                approveBatch.isPending ||
                cancelBatch.isPending ||
                retryRenders.isPending
              }
              onPreview={() => setPreviewBatch(batch.id)}
              onCancel={() => setConfirmCancel(batch.id)}
              onRetry={() => void onRetry(batch.id)}
            />
          ))}
        </section>
      )}

      {!preflight.isLoading &&
        !preflight.isError &&
        (preflight.data?.recipients.length ?? 0) === 0 &&
        (batches.data?.length ?? 0) === 0 && (
          <EmptyState
            icon={<Send className="size-6" />}
            title="Nada para entregar ainda"
            description="Confirme os alunos nas fotos do evento para ver quem pode receber."
          />
        )}

      <DeliveryDraftDialog batchId={previewBatch} canApprove={canApprove} onClose={() => setPreviewBatch(null)}
        eventName={event.data.name} onApprove={onApprove} onRetry={onRetry} />

      <AlertDialog
        open={confirmCancel !== null}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o preparo?</AlertDialogTitle>
            <AlertDialogDescription>
              Interrompe este preparo e remove as cópias preparadas. As fotos originais do evento ficam preservadas. Mensagens já enviadas não podem ser desfeitas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delivery-abort">
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => confirmCancel && void onCancel(confirmCancel)}
              data-testid="button-confirm-cancel-delivery"
            >
              Cancelar preparo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BatchCard({
  batch,
  canApprove,
  busy,
  onPreview,
  onCancel,
  onRetry,
}: {
  batch: DeliveryBatchSummary;
  canApprove: boolean;
  busy: boolean;
  onPreview: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const detail = useDeliveryBatchDetail(batch.id);
  const pct =
    batch.itemCount > 0
      ? Math.round((batch.renderedCount / batch.itemCount) * 100)
      : 0;
  const terminal = TERMINAL_BATCH_STATUSES.includes(batch.status);
  const needsPhotoUpdate = detail.data?.recipients.some((recipient) => recipient.lastError === "render_atualizacao_necessaria") ?? false;
  const preparation = deliveryPreparationState(batch, needsPhotoUpdate);

  return (
    <Card className="border-border" data-testid={`card-delivery-batch-${batch.id}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge variant={statusBadgeVariant(batch.status)} data-testid={`badge-batch-status-${batch.id}`}>
              {preparation?.label ?? DELIVERY_BATCH_STATUS_LABEL[batch.status]}
            </Badge>
            <span className="text-xs font-normal text-muted-foreground">
              criado em {formatDateTime(batch.createdAt)}
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant={batch.status === "awaiting_review" ? "default" : "outline"} size="sm" onClick={onPreview} data-testid={`button-preview-${batch.id}`}>
              Conferir fotos e mensagem
            </Button>
            {batch.failedCount > 0 && !terminal && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onRetry} data-testid={`button-retry-${batch.id}`}>
                <RefreshCw className="size-4" /> {needsPhotoUpdate ? "Atualizar fotos" : "Tentar novamente"} ({batch.failedCount})
              </Button>
            )}
            {batch.approvedAt && (
              <span className="self-center text-xs text-muted-foreground">
                aprovado em {formatDateTime(batch.approvedAt)}
              </span>
            )}
            {!terminal && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onCancel} data-testid={`button-cancel-${batch.id}`}>
                <XCircle className="size-4" /> Cancelar preparo
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {preparation && <p className="rounded-md bg-muted/40 p-3 text-sm" role="status">{preparation.description}</p>}
        <p className="text-xs text-muted-foreground">Abra o álbum para conferir as fotos e a mensagem antes de aprovar.</p>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {batch.renderedCount} de {batch.itemCount} fotos processadas
              {batch.failedCount > 0 ? ` · ${batch.failedCount} ${needsPhotoUpdate ? "para atualizar" : "com falha"}` : ""}
            </span>
            <span>{pct}% do preparo</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-2 rounded bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {batch.recipientCount}{" "}
          {batch.recipientCount === 1 ? "responsável" : "responsáveis"} ·{" "}
          {Object.entries(batch.recipientsByStatus)
            .map(
              ([status, count]) =>
                `${DELIVERY_RECIPIENT_STATUS_LABEL[status as DeliveryRecipientStatus] ?? status}: ${count}`,
            )
            .join(" · ")}
        </p>

        {detail.data && (
          <div className="space-y-1">
            {detail.data.recipients.map((recipient) => (
              <div
                key={recipient.id}
                className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2 text-xs"
                data-testid={`delivery-batch-recipient-${recipient.id}`}
              >
                <span className="min-w-0 truncate">
                  {recipient.guardianName}{" "}
                  <span className="font-mono text-muted-foreground">{recipient.phoneMasked}</span>{" "}
                  · {recipient.students.join(", ")}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">
                    {recipient.itemsRendered} de {recipient.itemsTotal} fotos processadas
                  </span>
                  {recipient.lastError && (
                    <span className="text-destructive">
                      {DELIVERY_BLOCKED_REASON_LABEL[recipient.lastError] ?? recipient.lastError}
                    </span>
                  )}
                  <Badge variant={recipientBadgeVariant(recipient.status)}>
                    {recipient.lastError === "render_atualizacao_necessaria" ? "Atualizar fotos" : recipient.status === "preparing" && recipient.itemsFailed > 0 ? "Precisa de atenção" : DELIVERY_RECIPIENT_STATUS_LABEL[recipient.status]}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        )}
        <RecipientDeliveryActions batchId={batch.id} canApprove={canApprove} />
      </CardContent>
    </Card>
  );
}

function RecipientDeliveryActions({ batchId, canApprove }: { batchId: string; canApprove: boolean }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<{ action: "dispatch" | "resend" | "revoke"; id: string; name: string; phone: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const draft = useQuery({ queryKey: ["delivery-draft", batchId], queryFn: () => getDeliveryService().draft(batchId), retry: false, refetchInterval: 15_000 });
  const act = useMutation({ mutationFn: (input: { action: "dispatch" | "resend" | "revoke"; id: string }) => getDeliveryService().act(input.action, input.id),
    onSuccess: async result => {
      setNotice(result.status === "unknown" ? "O resultado é incerto. Não repita o envio; aguarde a reconciliação pelo servidor."
        : result.status === "accepted" ? "Mensagem aceita pelo provedor. A entrega e a leitura dependem das confirmações recebidas."
        : result.status === "failed" ? "A mensagem não foi transmitida. Confira o motivo e corrija os dados antes de retomar o envio."
        : result.status === "revoked" ? "Acesso revogado. Novos acessos e assinaturas foram bloqueados; arquivos já baixados não são recolhidos."
        : "A ação foi registrada. Confira o estado atualizado abaixo.");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["delivery-draft", batchId] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-batch", batchId] }), queryClient.invalidateQueries({ queryKey: ["delivery-batches"] })]);
    }, onError: err => setNotice(err.message) });
  if (!draft.data) return draft.isError ? <p className="text-xs text-destructive" role="alert">As ações de envio estão indisponíveis. {draft.error.message}</p> : null;
  return <div className="space-y-3 border-t pt-3">
    <h3 className="font-medium">Envio e acesso ao álbum</h3>
    <p className="text-xs text-muted-foreground">Depois da aprovação, envie o link. A confirmação de entrega aparece quando o WhatsApp informar o resultado.</p>
    {draft.data.recipients.map(recipient => <div key={recipient.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div><p className="text-sm font-medium">{recipient.guardianName} <span className="font-mono text-xs">{recipient.phoneMasked}</span></p>
        <p className="text-xs text-muted-foreground">{DELIVERY_RECIPIENT_STATUS_LABEL[recipient.status as DeliveryRecipientStatus] ?? recipient.status}
          {recipient.updatedAt ? ` · atualizado em ${formatDateTime(recipient.updatedAt)}` : ""}</p>
        {recipient.blockedReason && <p className="text-xs text-destructive">{DELIVERY_BLOCKED_REASON_LABEL[recipient.blockedReason] ?? "Confira a autorização, o número e a disponibilidade das fotos."}</p>}</div>
      {canApprove && <div className="flex flex-wrap gap-2">
        {canTransmitRecipient(recipient.status, draft.data.batch.approvedVersion === draft.data.batch.version) && <Button size="sm" disabled={act.isPending} onClick={() => setConfirm({ action: "dispatch", id: recipient.id, name: recipient.guardianName, phone: recipient.phoneMasked })}>Enviar texto e link</Button>}
        {canResendRecipient(recipient.status) && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => setConfirm({ action: "resend", id: recipient.id, name: recipient.guardianName, phone: recipient.phoneMasked })}>{recipient.status === "failed" ? "Retomar envio" : "Reenviar acesso"}</Button>}
        {canRevokeDeliveryAccess(recipient.status) && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => setConfirm({ action: "revoke", id: recipient.id, name: recipient.guardianName, phone: recipient.phoneMasked })}>Revogar acesso</Button>}
      </div>}
    </div>)}
    {notice && <p role="status" className="rounded-md bg-muted p-3 text-sm">{notice}</p>}
    <AlertDialog open={Boolean(confirm)} onOpenChange={open => { if (!open && !act.isPending) setConfirm(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.action === "revoke" ? "Revogar acesso?" : confirm?.action === "resend" ? "Revalidar e reenviar o acesso?" : "Enviar texto e link?"}</AlertDialogTitle>
        <AlertDialogDescription>{confirm?.name} · {confirm?.phone}. {confirm?.action === "revoke"
          ? "Bloqueia sessões e novos downloads. URLs de arquivo já emitidas podem continuar por até 5 minutos e cópias baixadas não são recolhidas."
          : confirm?.action === "resend" ? "Confira o número cadastrado e o vínculo deste responsável. O servidor revalida número verificado, autorização e arquivos. O novo link invalida links anteriores ainda não usados e mantém sessões já abertas até as 24 horas originais."
          : "O servidor envia somente texto e link ao número cadastrado e verificado. Revalida a versão aprovada e o modo permitido antes de transmitir."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={act.isPending}>Voltar</AlertDialogCancel>
          <AlertDialogAction disabled={act.isPending} onClick={() => { if (!confirm || act.isPending) return; const input = confirm; setConfirm(null); act.mutate({ action: input.action, id: input.id }); }}>Confirmar ação</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
