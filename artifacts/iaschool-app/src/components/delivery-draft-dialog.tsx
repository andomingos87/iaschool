import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@workspace/iaschool-ui/components/ui/button";
import { Input } from "@workspace/iaschool-ui/components/ui/input";
import { Label } from "@workspace/iaschool-ui/components/ui/label";
import { Checkbox } from "@workspace/iaschool-ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/iaschool-ui/components/ui/dialog";
import { toast } from "@workspace/iaschool-ui/hooks/use-toast";
import { ErrorState } from "./data-state";
import { getDataLayer, type DeliveryPreviewProblem } from "@/lib/data";
import { getDeliveryService } from "@/lib/delivery-service";
import {
  DELIVERY_FIELD_LIMITS,
  changeRecipientSelection,
  deliveryMessage,
  orderedRecipientPhotos,
  deliveryPhotoProblemLabel,
  problematicRecipientPhotos,
  removeRecipientPhotos,
  deliveryPreviewReady,
  deliveryPreviewProblem,
  requiresDeliveryApproval,
  selectionFromDraft,
  validateDeliveryFields,
  validateDraftSelection,
  type DeliveryDraft,
  type DeliveryFields,
  type RecipientSelection,
} from "@/lib/delivery-workspace";

export function DeliveryDraftDialog({
  batchId,
  canApprove,
  eventName,
  onClose,
  onApprove,
  onRetry,
}: {
  batchId: string | null;
  canApprove: boolean;
  eventName?: string;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
}) {
  const draft = useQuery({
    queryKey: ["delivery-draft", batchId],
    enabled: Boolean(batchId),
    queryFn: () => getDeliveryService().draft(batchId!),
    retry: false,
    refetchOnMount: "always",
  });
  const preview = useQuery({
    queryKey: ["delivery-preview", batchId],
    enabled: Boolean(batchId),
    queryFn: () => getDataLayer().deliveries.previewItems(batchId!),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  return (
    <Dialog
      open={Boolean(batchId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conferir fotos e mensagem</DialogTitle>
          <DialogDescription>
            1. Confira as fotos. 2. Ajuste a mensagem. 3. Aprove o álbum. O
            envio é uma ação separada.
          </DialogDescription>
        </DialogHeader>
        {draft.isLoading ? (
          <p role="status" className="flex items-center gap-2 py-6">
            <Loader2 className="size-4 animate-spin" /> Carregando o rascunho…
          </p>
        ) : draft.isError ? (
          <ErrorState
            message={draft.error.message}
            onRetry={() => void draft.refetch()}
          />
        ) : draft.data ? (
          <DraftEditor
            key={`${draft.data.batch.id}:${draft.data.batch.version}`}
            draft={draft.data}
            canApprove={canApprove}
            eventName={eventName}
            urls={
              new Map(
                (preview.isError || preview.isFetching
                  ? []
                  : (preview.data ?? [])
                ).flatMap((item) =>
                  item.url && !item.problem
                    ? [[item.itemId, item.url] as [string, string]]
                    : [],
                ),
              )
            }
            problems={
              new Map(
                (preview.isError || preview.isFetching
                  ? []
                  : (preview.data ?? [])
                ).flatMap((item) =>
                  item.problem
                    ? [
                        [item.itemId, item.problem] as [
                          string,
                          DeliveryPreviewProblem,
                        ],
                      ]
                    : [],
                ),
              )
            }
            previewFailed={preview.isError}
            previewLoading={preview.isFetching}
            previewMessage={preview.error?.message}
            onRefresh={() => Promise.all([draft.refetch(), preview.refetch()])}
            onApprove={onApprove}
            onRetry={onRetry}
          />
        ) : (
          <p>Nenhum rascunho disponível.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
function DraftEditor({
  draft,
  canApprove,
  eventName,
  urls,
  problems,
  previewFailed,
  previewLoading,
  previewMessage,
  onRefresh,
  onApprove,
  onRetry,
}: {
  draft: DeliveryDraft;
  canApprove: boolean;
  eventName?: string;
  urls: Map<string, string>;
  problems: Map<string, DeliveryPreviewProblem>;
  previewFailed: boolean;
  previewLoading: boolean;
  previewMessage?: string;
  onRefresh: () => Promise<unknown>;
  onApprove: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<DeliveryFields>({
    ...draft.batch.fields,
  });
  const initialSelection = useMemo(() => selectionFromDraft(draft), [draft]);
  const [selection, setSelection] =
    useState<RecipientSelection[]>(initialSelection);
  const [reviewed, setReviewed] = useState(false);
  const [approving, setApproving] = useState(false);
  const [updatingPhotos, setUpdatingPhotos] = useState(false);
  const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({});
  const [failedUrls, setFailedUrls] = useState<Record<string, string>>({});
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const mutable =
    !draft.recipients.some((r) =>
      ["sending", "accepted", "sent", "delivered", "read", "unknown"].includes(
        r.status,
      ),
    ) &&
    !["canceled", "completed", "completed_with_errors"].includes(
      draft.batch.status,
    );
  const dirty =
    JSON.stringify(fields) !== JSON.stringify(draft.batch.fields) ||
    JSON.stringify(selection) !== JSON.stringify(initialSelection);
  const error =
    validateDeliveryFields(fields) ?? validateDraftSelection(draft, selection);
  const save = useMutation({
    mutationFn: () =>
      getDeliveryService().save(
        draft.batch.id,
        draft.batch.version,
        fields,
        selection,
      ),
    onSuccess: async () => {
      toast({
        title: "Rascunho salvo",
        description:
          "A versão mudou. Confira as imagens e a mensagem novamente antes de aprovar.",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["delivery-draft", draft.batch.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["delivery-preview", draft.batch.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["delivery-batches", draft.batch.eventId],
        }),
      ]);
    },
    onError: (err) =>
      toast({
        variant: "destructive",
        title: "Rascunho não salvo",
        description: err.message,
      }),
  });
  const busy = save.isPending || approving || updatingPhotos;
  const refreshRequired = draft.recipients.some((recipient) =>
    recipient.items.some((item) =>
      selection.some((row) => row.recipientId === recipient.id && row.photoIds.includes(item.photoId)) &&
      problems.get(item.id) === "refresh_required",
    ),
  );
  const approvalRequired = requiresDeliveryApproval(draft.batch);
  const selectedItems = draft.recipients.flatMap((r) => {
    const ids =
      selection.find((row) => row.recipientId === r.id)?.photoIds ?? [];
    return ids.map((id) => r.items.find((item) => item.photoId === id));
  });
  const ready = deliveryPreviewReady(
    selectedItems,
    urls,
    loadedUrls,
    previewFailed || previewLoading,
  );
  async function approve() {
    if (
      busy ||
      dirty ||
      error ||
      !reviewed ||
      !ready ||
      !canApprove ||
      !approvalRequired
    )
      return;
    setApproving(true);
    try {
      await onApprove(draft.batch.id);
      await queryClient.invalidateQueries({
        queryKey: ["delivery-draft", draft.batch.id],
      });
    } finally {
      setApproving(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">1. Fotos de cada família</h3>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || previewLoading}
          onClick={() => {
            setReviewed(false);
            setFailedUrls({});
            setLoadedUrls({});
            setPreviewAttempt((value) => value + 1);
            void onRefresh();
          }}
        >
          <RefreshCw
            className={previewLoading ? "size-4 animate-spin" : "size-4"}
          />{" "}
          Atualizar prévia
        </Button>
      </div>
      {refreshRequired && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm">Atualize as fotos deste álbum para usar a versão nítida.</p>
          <Button
            size="sm"
            disabled={!mutable || busy || dirty || previewLoading}
            onClick={async () => {
              setUpdatingPhotos(true);
              setReviewed(false);
              setFailedUrls({});
              setLoadedUrls({});
              try {
                await onRetry(draft.batch.id);
                await onRefresh();
              } finally {
                setUpdatingPhotos(false);
              }
            }}
          >
            <RefreshCw className={updatingPhotos ? "size-4 animate-spin" : "size-4"} />
            {updatingPhotos ? "Atualizando fotos…" : "Atualizar fotos"}
          </Button>
          {dirty && <p className="text-xs text-muted-foreground">Salve suas escolhas antes de atualizar.</p>}
        </div>
      )}
      {previewFailed && (
        <p role="alert" className="text-sm text-destructive">
          {deliveryPreviewProblem(previewMessage ?? "")}
        </p>
      )}
      {Object.keys(failedUrls).length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Uma foto não carregou. Atualize a prévia ou retire a foto do álbum e
          salve a seleção para seguir com as demais.
        </p>
      )}
      {previewLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando as fotos…
        </p>
      )}
      {draft.recipients.length === 0 && (
        <p className="text-sm">
          Nenhum responsável neste lote. Volte ao evento para preparar outra
          entrega.
        </p>
      )}
      {draft.recipients.map((recipient) => {
        const selected =
          selection.find((row) => row.recipientId === recipient.id)?.photoIds ??
          [];
        const available = orderedRecipientPhotos(recipient.items);
        const problematic = problematicRecipientPhotos(
          recipient.items,
          selected,
          urls,
          failedUrls,
          previewLoading || previewFailed,
          problems,
        );
        const ordered = [
          ...selected.map((id) =>
            available.find((item) => item.photoId === id)!,
          ),
          ...available.filter((item) => !selected.includes(item.photoId)),
        ];
        return (
          <section
            key={recipient.id}
            className="space-y-3 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">
                  {recipient.guardianName}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {recipient.phoneMasked}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {recipient.students.map((s) => s.name).join(" · ")}
                </p>
              </div>
              <span className="text-sm" aria-live="polite">
                {selected.length}{" "}
                {selected.length === 1
                  ? "foto selecionada"
                  : "fotos selecionadas"}
              </span>
            </div>
            {problematic.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {problematic.length}{" "}
                  {problematic.length === 1
                    ? "foto selecionada está indisponível"
                    : "fotos selecionadas estão indisponíveis"}
                  . {problematic.length < selected.length
                    ? "Você pode retirar essas fotos e seguir com as demais."
                    : "Tente preparar as fotos novamente ou escolha outras fotos para continuar."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!mutable || busy || previewLoading}
                  onClick={() => {
                    setSelection((previous) =>
                      removeRecipientPhotos(
                        previous,
                        recipient.id,
                        problematic,
                      ),
                    );
                    setReviewed(false);
                  }}
                >
                  Retirar fotos com falha
                </Button>
              </div>
            )}
            {selected.length > 30 && (
              <p className="text-xs text-muted-foreground">
                Este conjunto tem muitas fotos. Confira a seleção e a ordem
                antes de aprovar.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!mutable || busy || available.length === 0}
                onClick={() => {
                  setSelection((prev) =>
                    prev.map((row) =>
                      row.recipientId === recipient.id
                        ? { ...row, photoIds: available.map((p) => p.photoId) }
                        : row,
                    ),
                  );
                  setReviewed(false);
                }}
              >
                Selecionar todas
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!mutable || busy || selected.length === 0}
                onClick={() => {
                  setSelection((prev) =>
                    prev.map((row) =>
                      row.recipientId === recipient.id
                        ? { ...row, photoIds: [] }
                        : row,
                    ),
                  );
                  setReviewed(false);
                }}
              >
                Desmarcar todas
              </Button>
            </div>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma foto confirmada disponível para esta família.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {ordered.map((item) => {
                  const position = selected.indexOf(item.photoId);
                  return (
                    <div
                      key={item.photoId}
                      className={`overflow-hidden rounded-md border ${position >= 0 ? "border-primary" : "border-border"}`}
                    >
                      {urls.get(item.id) &&
                      failedUrls[item.id] !== urls.get(item.id) ? (
                        <img
                          key={`${item.id}:${previewAttempt}`}
                          src={urls.get(item.id)}
                          onLoad={() =>
                            setLoadedUrls((prev) => ({
                              ...prev,
                              [item.id]: urls.get(item.id)!,
                            }))
                          }
                          onError={() => {
                            setLoadedUrls((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                            setFailedUrls((prev) => ({
                              ...prev,
                              [item.id]: urls.get(item.id)!,
                            }));
                            setReviewed(false);
                          }}
                          alt={`Foto ${position >= 0 ? position + 1 : "disponível"} do álbum`}
                          className="aspect-square w-full bg-muted object-contain"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-muted p-3 text-center text-xs">
                          {failedUrls[item.id] &&
                          failedUrls[item.id] === urls.get(item.id)
                            ? "Esta foto não carregou — atualize ou retire do álbum"
                            : problems.has(item.id)
                              ? deliveryPhotoProblemLabel(
                                  problems.get(item.id)!,
                                )
                              : previewLoading
                                ? "Carregando foto…"
                                : item.renderStatus === "failed"
                                  ? "Esta foto falhou no preparo"
                                  : item.renderStatus === "queued"
                                    ? "Foto ainda em preparo"
                                    : previewFailed
                                      ? "Prévia indisponível — atualize"
                                      : "Prévia desta foto indisponível"}
                        </div>
                      )}
                      <div className="space-y-2 p-2">
                        <label className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={position >= 0}
                            disabled={!mutable || busy}
                            onCheckedChange={() => {
                              setSelection((prev) =>
                                changeRecipientSelection(
                                  prev,
                                  recipient.id,
                                  item.photoId,
                                  "toggle",
                                ),
                              );
                              setReviewed(false);
                            }}
                          />
                          {position >= 0
                            ? `Foto ${position + 1}`
                            : "Incluir foto"}
                        </label>
                        {position >= 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={!mutable || busy}
                            onClick={() => {
                              setSelection((previous) =>
                                removeRecipientPhotos(previous, recipient.id, [
                                  item.photoId,
                                ]),
                              );
                              setReviewed(false);
                            }}
                          >
                            Retirar do álbum
                          </Button>
                        )}
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Mover foto para cima"
                            disabled={!mutable || busy || position <= 0}
                            onClick={() => {
                              setSelection((prev) =>
                                changeRecipientSelection(
                                  prev,
                                  recipient.id,
                                  item.photoId,
                                  "up",
                                ),
                              );
                              setReviewed(false);
                            }}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Mover foto para baixo"
                            disabled={
                              !mutable ||
                              busy ||
                              position < 0 ||
                              position >= selected.length - 1
                            }
                            onClick={() => {
                              setSelection((prev) =>
                                changeRecipientSelection(
                                  prev,
                                  recipient.id,
                                  item.photoId,
                                  "down",
                                ),
                              );
                              setReviewed(false);
                            }}
                          >
                            <ArrowDown className="size-4" />
                          </Button>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      <h3 className="font-semibold">2. Mensagem para as famílias</h3>
      {eventName && fields.eventName !== eventName && mutable && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setFields((prev) => ({ ...prev, eventName }));
            setReviewed(false);
          }}
        >
          Usar nome do evento: {eventName}
        </Button>
      )}
      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Mensagem do evento"
      >
        {(
          [
            { name: "eventName", label: "Nome do evento" },
            { name: "callToAction", label: "Mensagem curta" },
            { name: "signature", label: "Assinatura da escola" },
          ] as const
        ).map((field) => (
          <div key={field.name} className="space-y-1">
            <Label htmlFor={`delivery-${field.name}`}>{field.label}</Label>
            <Input
              id={`delivery-${field.name}`}
              value={fields[field.name]}
              maxLength={DELIVERY_FIELD_LIMITS[field.name]}
              disabled={!mutable || busy}
              onChange={(event) => {
                setFields((prev) => ({
                  ...prev,
                  [field.name]: event.target.value,
                }));
                setReviewed(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {fields[field.name].length}/{DELIVERY_FIELD_LIMITS[field.name]}
            </p>
          </div>
        ))}
      </section>
      <section
        className="rounded-lg border bg-muted/30 p-4"
        aria-label="Prévia da mensagem"
      >
        <h3 className="mb-2 font-medium">
          É assim que a família recebe a mensagem
        </h3>
        <p
          className="whitespace-pre-wrap text-sm"
          data-testid="delivery-message-preview"
        >
          {deliveryMessage(fields)}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          O link do álbum será criado no envio. As fotos ficam dentro do álbum
          privado.
        </p>
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">3. Aprovar o álbum</h3>
        <p className="text-xs text-muted-foreground">
          Versão {draft.batch.version}
          {draft.batch.approvedVersion != null
            ? ` · aprovação da versão ${draft.batch.approvedVersion}`
            : " · ainda não aprovada"}
          . Alterar o rascunho exige salvar e conferir uma nova prévia.
        </p>
        {dirty && (
          <p className="text-sm text-muted-foreground">
            Salve para aplicar a seleção. Retirar do álbum não apaga a foto do
            evento.
          </p>
        )}
        {mutable && (
          <Button
            disabled={busy || !dirty || Boolean(error)}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}{" "}
            Salvar alterações
          </Button>
        )}
        {canApprove && mutable && approvalRequired && (
          <>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={reviewed}
                disabled={busy || dirty || !ready || Boolean(error)}
                onCheckedChange={(value) => setReviewed(value === true)}
              />
              Conferi as fotos, a mensagem e os responsáveis que vão receber.
            </label>
            <Button
              disabled={busy || dirty || !ready || Boolean(error) || !reviewed}
              onClick={() => void approve()}
            >
              <CheckCircle2 className="size-4" /> Aprovar esta versão
            </Button>
          </>
        )}
        {!approvalRequired && (
          <p className="text-sm text-muted-foreground">
            Esta versão já foi aprovada. Se alterar o rascunho, salve e confira
            a nova versão antes de enviar.
          </p>
        )}
        {!ready && (
          <p className="text-xs text-muted-foreground">
            As fotos selecionadas precisam carregar antes da aprovação.
            Você pode retirar uma foto com falha e salvar para continuar com as demais.
          </p>
        )}
        {!canApprove && (
          <p className="text-xs text-muted-foreground">
            Um administrador ou membro da equipe da escola precisa aprovar e
            enviar.
          </p>
        )}
      </div>
    </div>
  );
}
