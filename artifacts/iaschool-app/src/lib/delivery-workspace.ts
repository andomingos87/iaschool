import type { DeliveryPreviewProblem } from "./data/types";
/** Contrato do rascunho compartilhado por escola e álbum (S06/S07). */
export interface DeliveryFields {
  eventName: string;
  callToAction: string;
  signature: string;
}
export interface DraftPhoto {
  id: string;
  photoId: string;
  order: number;
  selected: boolean;
  renderStatus: "queued" | "done" | "failed";
}
export interface DraftRecipient {
  id: string;
  guardianName: string;
  phoneMasked: string;
  status: string;
  students: { id: string; name: string }[];
  items: DraftPhoto[];
  updatedAt?: string;
  blockedReason?: string;
}
export interface DeliveryDraft {
  batch: {
    id: string;
    eventId: string;
    status: string;
    version: number;
    approvedVersion: number | null;
    fields: DeliveryFields;
  };
  recipients: DraftRecipient[];
}
export interface RecipientSelection {
  recipientId: string;
  photoIds: string[];
}
export const DELIVERY_FIELD_LIMITS = {
  eventName: 120,
  callToAction: 160,
  signature: 80,
} as const;
export function validateDeliveryFields(fields: DeliveryFields): string | null {
  for (const name of Object.keys(
    DELIVERY_FIELD_LIMITS,
  ) as (keyof DeliveryFields)[]) {
    const value = fields[name].trim();
    if (
      (name !== "callToAction" && !value) ||
      fields[name].length > DELIVERY_FIELD_LIMITS[name]
    )
      return "Preencha o nome do evento e a assinatura e respeite o limite de cada campo.";
    if (
      /(?:https?:|www\.|javascript:|data:)/i.test(value) ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
      return "O sistema acrescenta o link e as informações de acesso. Não inclua URLs ou quebras de linha nos campos.";
  }
  return null;
}
export function deliveryMessage(
  fields: DeliveryFields,
  link = "[link exclusivo gerado pelo sistema]",
): string {
  return [
    fields.eventName.trim(),
    fields.callToAction.trim(),
    fields.signature.trim(),
    `Acesse seu álbum pelo link exclusivo: ${link}`,
    "O mesmo link abre de novo enquanto as fotos continuarem disponíveis. A escola pode revogar o acesso.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
/** Irmãos mantêm a relação de aluno, mas a foto aparece uma única vez. */
export function orderedRecipientPhotos(
  items: readonly DraftPhoto[],
): DraftPhoto[] {
  const byPhoto = new Map<string, DraftPhoto>();
  for (const item of [...items].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  )) {
    if (!byPhoto.has(item.photoId)) byPhoto.set(item.photoId, item);
  }
  return [...byPhoto.values()];
}
export function selectionFromDraft(draft: DeliveryDraft): RecipientSelection[] {
  return draft.recipients.map((recipient) => ({
    recipientId: recipient.id,
    photoIds: orderedRecipientPhotos(recipient.items)
      .filter((item) => item.selected)
      .map((item) => item.photoId),
  }));
}
export function changeRecipientSelection(
  selection: readonly RecipientSelection[],
  recipientId: string,
  photoId: string,
  command: "toggle" | "up" | "down",
): RecipientSelection[] {
  return selection.map((row) => {
    if (row.recipientId !== recipientId)
      return { ...row, photoIds: [...row.photoIds] };
    const ids = [...row.photoIds];
    const index = ids.indexOf(photoId);
    if (command === "toggle") {
      if (index < 0) ids.push(photoId);
      else ids.splice(index, 1);
    } else if (index >= 0) {
      const destination = index + (command === "up" ? -1 : 1);
      if (destination >= 0 && destination < ids.length)
        [ids[index], ids[destination]] = [ids[destination]!, ids[index]!];
    }
    return { recipientId, photoIds: ids };
  });
}
export function validateDraftSelection(
  draft: DeliveryDraft,
  selection: readonly RecipientSelection[],
): string | null {
  if (
    selection.length !== draft.recipients.length ||
    new Set(selection.map((r) => r.recipientId)).size !== selection.length
  )
    return "Confira novamente os responsáveis deste lote.";
  let total = 0;
  for (const row of selection) {
    const recipient = draft.recipients.find((r) => r.id === row.recipientId);
    if (
      !recipient ||
      new Set(row.photoIds).size !== row.photoIds.length ||
      row.photoIds.some(
        (id) => !recipient.items.some((item) => item.photoId === id),
      )
    )
      return "A seleção contém uma foto fora desta família.";
    total += row.photoIds.length;
  }
  return total > 0 ? null : "Selecione pelo menos uma foto antes de salvar.";
}
export function canTransmitRecipient(
  status: string,
  approvalCurrent: boolean,
): boolean {
  return approvalCurrent && (status === "queued" || status === "ready");
}
export function canResendRecipient(status: string): boolean {
  return ["accepted", "sent", "delivered", "read", "failed"].includes(status);
}

/** A signed URL alone is not evidence the school could view its image. */
export function deliveryPreviewReady(
  items: readonly (DraftPhoto | undefined)[],
  urls: ReadonlyMap<string, string>,
  loadedUrls: Readonly<Record<string, string>>,
  unavailable: boolean,
): boolean {
  return (
    !unavailable &&
    items.length > 0 &&
    items.every((item) =>
      Boolean(
        item &&
        item.renderStatus === "done" &&
        urls.get(item.id) &&
        loadedUrls[item.id] === urls.get(item.id),
      ),
    )
  );
}

export function isActiveDeliveryBatch(status: string): boolean {
  return [
    "draft",
    "preparing",
    "awaiting_review",
    "ready",
    "queued",
    "processing",
  ].includes(status);
}
export function canApproveDeliveryForSchool(
  schools: readonly { schoolId: string; role: string }[],
  schoolId: string | undefined,
): boolean {
  return Boolean(
    schoolId &&
    schools.some(
      (s) =>
        s.schoolId === schoolId &&
        ["school_admin", "school_staff"].includes(s.role),
    ),
  );
}

export function requiresDeliveryApproval(
  batch: DeliveryDraft["batch"],
): boolean {
  return batch.approvedVersion !== batch.version;
}

export const DELIVERY_SEND_BLOCKS = [
  "paused",
  "provider_missing",
  "album_not_ready",
  "public_url_invalid",
  "instance_missing",
] as const;
export type DeliverySendBlock = (typeof DELIVERY_SEND_BLOCKS)[number];
export type DeliverySendView = "loading" | "ready" | DeliverySendBlock | "unknown";

export function isDeliverySendBlock(value: unknown): value is DeliverySendBlock {
  return (
    typeof value === "string" &&
    (DELIVERY_SEND_BLOCKS as readonly string[]).includes(value)
  );
}

/** O navegador só repete o motivo. Valor de segredo ou URL não entra aqui. */
export function deliverySendBlockCopy(view: Exclude<DeliverySendView, "loading" | "ready">): string {
  if (view === "album_not_ready")
    return "O álbum ainda não está liberado para o responsável. Nenhuma mensagem sai.";
  if (view === "public_url_invalid")
    return "O endereço público do álbum ainda não está configurado. Nenhuma mensagem sai.";
  if (view === "provider_missing" || view === "instance_missing")
    return "O envio ainda não está configurado. Nenhuma mensagem sai.";
  if (view === "paused")
    return "O envio pelo WhatsApp está pausado. As fotos ficam neste preparo e nenhuma mensagem sai.";
  return "Não foi possível confirmar se o envio está liberado. Nenhuma mensagem sai até essa confirmação.";
}

export function deliverySendView(state: {
  isPending: boolean;
  isError: boolean;
  data?: { sending?: string; reason?: unknown } | null;
}): DeliverySendView {
  if (state.isPending) return "loading";
  if (state.isError || !state.data) return "unknown";
  if (state.data.sending === "ready") return "ready";
  if (state.data.sending === "blocked" && isDeliverySendBlock(state.data.reason))
    return state.data.reason;
  return "unknown";
}

export function deliverySendBlocked(view: DeliverySendView): boolean {
  return view !== "loading" && view !== "ready";
}

/** Preparo de imagem não significa entrega ao responsável. */
export function deliveryPreparationState(batch: {
  status: string;
  itemCount: number;
  renderedCount: number;
  failedCount: number;
}, refreshRequired = false, sendBlocked = false) {
  if (batch.status === "canceled")
    return {
      label: "Cancelado",
      description:
        "Este preparo foi cancelado. Nenhuma nova mensagem será enviada por ele.",
    };
  if (refreshRequired && ["draft", "preparing", "awaiting_review"].includes(batch.status))
    return {
      label: "Atualizar fotos",
      description: "Atualize as fotos deste álbum para usar a versão nítida. Depois, confira e aprove.",
    };
  if (
    batch.failedCount > 0 &&
    ["draft", "preparing", "awaiting_review"].includes(batch.status)
  )
    return {
      label: "Precisa de atenção",
      description: `${batch.failedCount} ${batch.failedCount === 1 ? "foto falhou" : "fotos falharam"} no preparo. Tente novamente ou retire a foto do álbum para continuar com as demais.`,
    };
  if (["draft", "preparing"].includes(batch.status))
    return {
      label: "Preparando fotos",
      description:
        "As fotos estão sendo preparadas. Ainda falta conferir e aprovar o álbum.",
    };
  if (batch.status === "awaiting_review")
    return {
      label: "Conferir fotos",
      description:
        "Confira as fotos e a mensagem antes de aprovar. Nada foi enviado nesta etapa.",
    };
  if (sendBlocked && batch.status === "queued")
    return {
      label: "Aprovado, sem envio",
      description:
        "As fotos já foram conferidas. O envio ao responsável continua desligado.",
    };
  return null;
}
export function deliveryPreviewProblem(message: string): string {
  if (/render_atualizacao_necessaria|refresh_required|atualiza[cç][aã]o necess[aá]ria/i.test(message))
    return "Atualize as fotos deste álbum para continuar com a versão nítida.";
  if (/expirad/i.test(message))
    return "O acesso à prévia expirou. Atualize as fotos para tentar novamente.";
  return "Não foi possível carregar as fotos agora. Atualize a prévia para tentar novamente.";
}
export function canRevokeDeliveryAccess(status: string): boolean {
  return ["accepted", "sent", "delivered", "read", "unknown"].includes(status);
}

/** Retirar do álbum muda só a seleção desta família; a origem permanece intacta. */
export function removeRecipientPhotos(
  selection: readonly RecipientSelection[],
  recipientId: string,
  photoIds: readonly string[],
): RecipientSelection[] {
  const removed = new Set(photoIds);
  return selection.map((row) => ({
    ...row,
    photoIds:
      row.recipientId === recipientId
        ? row.photoIds.filter((id) => !removed.has(id))
        : [...row.photoIds],
  }));
}
/** Não confunde carregamento pendente com falha; URL ausente nunca fica pronta. */
export function problematicRecipientPhotos(
  items: readonly DraftPhoto[],
  selected: readonly string[],
  urls: ReadonlyMap<string, string>,
  failedUrls: Readonly<Record<string, string>>,
  previewUnavailable: boolean,
  problems: ReadonlyMap<string, DeliveryPreviewProblem> = new Map(),
): string[] {
  const included = new Set(selected);
  return orderedRecipientPhotos(items)
    .filter(
      (item) =>
        included.has(item.photoId) &&
        problems.get(item.id) !== "refresh_required" &&
        (item.renderStatus === "failed" ||
          (!previewUnavailable &&
            (problems.has(item.id) ||
              Boolean(
                urls.get(item.id) && failedUrls[item.id] === urls.get(item.id),
              )))),
    )
    .map((item) => item.photoId);
}

export function deliveryPhotoProblemLabel(
  problem: DeliveryPreviewProblem,
): string {
  return {
    refresh_required: "Atualize para ver a foto nítida",
    render_failed: "Esta foto falhou no preparo",
    unavailable: "Esta foto está indisponível",
  }[problem];
}
