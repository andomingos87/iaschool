import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";
import { Spinner } from "@workspace/iaschool-ui/components/ui/spinner";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { PageHeader } from "@/components/app-shell";
import { CardsSkeleton, EmptyState, ErrorState } from "@/components/data-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { useAuth } from "@/hooks/use-auth";
import { useEvent } from "@/hooks/use-events";
import {
  useApproveDeliveryBatch,
  useCancelDeliveryBatch,
  useCreateDeliveryBatch,
  useDeliveryBatchDetail,
  useDeliveryBatches,
  useDeliveryPreflight,
  useDeliveryPreview,
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

const ACTIVE_BATCH_STATUSES = ["draft", "preparing", "awaiting_review", "ready", "queued"];
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
 * responsável, criação do lote, progresso do render, prévia protegida e
 * aprovação por papel. O envio em si chega no W4.
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

  const membership = session?.user.schools.find(
    (s) => s.schoolId === session.activeSchoolId,
  );
  const canApprove =
    membership?.role === "school_admin" || membership?.role === "school_staff";

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
    ACTIVE_BATCH_STATUSES.includes(b.status),
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
          "Os derivados estão sendo gerados. Quando ficarem prontos, o lote pede a revisão da prévia.",
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
                `${result.approved} ${result.approved === 1 ? "destinatário entrou" : "destinatários entraram"} na fila de envio` +
                (result.blocked > 0
                  ? ` · ${result.blocked} bloqueado(s) por número ou aceite.`
                  : "."),
            }
          : {
              variant: "destructive",
              title: "Nenhum destinatário liberado",
              description: "Número, aceite ou derivados mudaram desde a preparação.",
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
        description: "Os derivados gerados foram enfileirados para expurgo.",
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
        title: `${count} ${count === 1 ? "derivado reenfileirado" : "derivados reenfileirados"}`,
        description: "O worker vai tentar de novo.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível reenfileirar",
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
          description="O aluno aparece nítido; as outras crianças, desfocadas. Nada é enviado antes da aprovação de uma pessoa autorizada."
        />
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
              <Spinner className="size-4" /> Calculando o preflight…
            </div>
          ) : preflight.isError ? (
            <p className="text-destructive">
              Não foi possível calcular o preflight deste evento.
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
                  Já existe um lote em andamento para este evento.
                </p>
              ) : (
                <Button
                  onClick={() => void onCreate()}
                  disabled={selected.length === 0 || createBatch.isPending}
                  data-testid="button-create-delivery-batch"
                >
                  {createBatch.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Criar lote para {selected.length}{" "}
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
              onApprove={() => void onApprove(batch.id)}
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
            description="Confirme os rostos na revisão do evento e o preflight mostra os responsáveis aptos."
          />
        )}

      <PreviewDialog batchId={previewBatch} onClose={() => setPreviewBatch(null)} />

      <AlertDialog
        open={confirmCancel !== null}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Os destinatários ainda não enviados são cancelados e os derivados
              gerados vão para o expurgo. O que já tiver sido entregue não volta.
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
              Cancelar lote
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
  onApprove,
  onCancel,
  onRetry,
}: {
  batch: DeliveryBatchSummary;
  canApprove: boolean;
  busy: boolean;
  onPreview: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const detail = useDeliveryBatchDetail(batch.id);
  const pct =
    batch.itemCount > 0
      ? Math.round((batch.renderedCount / batch.itemCount) * 100)
      : 0;
  const terminal = TERMINAL_BATCH_STATUSES.includes(batch.status);

  return (
    <Card className="border-border" data-testid={`card-delivery-batch-${batch.id}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge variant={statusBadgeVariant(batch.status)} data-testid={`badge-batch-status-${batch.id}`}>
              {DELIVERY_BATCH_STATUS_LABEL[batch.status]}
            </Badge>
            <span className="text-xs font-normal text-muted-foreground">
              criado em {formatDateTime(batch.createdAt)} · termo {batch.termsVersion}
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onPreview} data-testid={`button-preview-${batch.id}`}>
              Ver prévia
            </Button>
            {batch.failedCount > 0 && !terminal && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onRetry} data-testid={`button-retry-${batch.id}`}>
                <RefreshCw className="size-4" /> Reenfileirar falhas ({batch.failedCount})
              </Button>
            )}
            {canApprove && batch.status === "awaiting_review" && (
              <Button size="sm" disabled={busy} onClick={onApprove} data-testid={`button-approve-${batch.id}`}>
                <CheckCircle2 className="size-4" /> Aprovar e enfileirar
              </Button>
            )}
            {batch.approvedAt && (
              <span className="self-center text-xs text-muted-foreground">
                aprovado em {formatDateTime(batch.approvedAt)}
              </span>
            )}
            {!terminal && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onCancel} data-testid={`button-cancel-${batch.id}`}>
                <XCircle className="size-4" /> Cancelar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {batch.renderedCount} de {batch.itemCount} derivados prontos
              {batch.failedCount > 0 ? ` · ${batch.failedCount} com falha` : ""}
            </span>
            <span>{pct}%</span>
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
                    {recipient.itemsRendered}/{recipient.itemsTotal}
                  </span>
                  {recipient.lastError && (
                    <span className="text-destructive">
                      {DELIVERY_BLOCKED_REASON_LABEL[recipient.lastError] ?? recipient.lastError}
                    </span>
                  )}
                  <Badge variant={recipientBadgeVariant(recipient.status)}>
                    {DELIVERY_RECIPIENT_STATUS_LABEL[recipient.status]}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewDialog({
  batchId,
  onClose,
}: {
  batchId: string | null;
  onClose: () => void;
}) {
  const data = getDataLayer();
  const preview = useDeliveryPreview(batchId, batchId !== null);
  const [fullSrc, setFullSrc] = useState<string | null>(null);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);

  async function openFull(itemId: string) {
    if (!batchId) return;
    setLoadingItem(itemId);
    try {
      setFullSrc(await data.deliveries.previewAssetUrl(batchId, itemId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Não foi possível abrir a imagem",
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setLoadingItem(null);
    }
  }

  return (
    <>
      <Dialog open={batchId !== null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-border">
          <DialogHeader>
            <DialogTitle>Prévia da entrega</DialogTitle>
            <DialogDescription>
              A versão exata que o responsável verá: o filho dele nítido, as
              outras crianças desfocadas. Links válidos por 5 minutos.
            </DialogDescription>
          </DialogHeader>
          {preview.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Spinner className="size-5" /> Carregando os derivados…
            </div>
          ) : preview.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Não foi possível carregar a prévia.
            </p>
          ) : (preview.data?.length ?? 0) === 0 ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <AlertTriangle className="size-4" /> Nenhum derivado pronto ainda.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="grid-delivery-preview">
              {preview.data!.map((item) => (
                <button
                  key={item.itemId}
                  type="button"
                  onClick={() => void openFull(item.itemId)}
                  className="group overflow-hidden rounded-md border border-border text-left"
                  data-testid={`preview-item-${item.itemId}`}
                >
                  <img
                    src={item.url}
                    alt={item.studentName || "Derivado da entrega"}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
                    {item.studentName}
                    {loadingItem === item.itemId && <Loader2 className="size-3 animate-spin" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ImageLightbox
        src={fullSrc}
        alt="Derivado da entrega"
        onClose={() => setFullSrc(null)}
      />
    </>
  );
}
