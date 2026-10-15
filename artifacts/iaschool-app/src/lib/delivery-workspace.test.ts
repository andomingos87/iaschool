import { describe, expect, it } from "vitest";
import {
  problematicRecipientPhotos,
  removeRecipientPhotos,
  changeRecipientSelection,
  orderedRecipientPhotos,
  selectionFromDraft,
  validateDeliveryFields,
  validateDraftSelection,
  deliveryPreviewReady,
  deliveryPreparationState,
  deliverySendBlockCopy,
  deliverySendView,
  deliveryPreviewProblem,
  deliveryPhotoProblemLabel,
  canRevokeDeliveryAccess,
  isActiveDeliveryBatch,
  canApproveDeliveryForSchool,
  requiresDeliveryApproval,
  deliveryMessage,
  canResendRecipient,
  canTransmitRecipient,
  type DeliveryDraft,
} from "./delivery-workspace";
const fields = {
  eventName: "Festa",
  callToAction: "Confira as fotos",
  signature: "Escola Teste",
};
const draft: DeliveryDraft = {
  batch: {
    id: "lote",
    eventId: "evento",
    status: "draft",
    version: 1,
    approvedVersion: null,
    fields,
  },
  recipients: [
    {
      id: "familia-a",
      guardianName: "Responsável A",
      phoneMasked: "***1234",
      status: "awaiting_review",
      students: [],
      items: [
        {
          id: "a1",
          photoId: "p1",
          order: 1,
          selected: true,
          renderStatus: "done",
        },
        {
          id: "a2",
          photoId: "p1",
          order: 1,
          selected: true,
          renderStatus: "done",
        },
        {
          id: "a3",
          photoId: "p2",
          order: 2,
          selected: true,
          renderStatus: "queued",
        },
      ],
    },
    {
      id: "familia-b",
      guardianName: "Responsável B",
      phoneMasked: "***4321",
      status: "draft",
      students: [],
      items: [
        {
          id: "b1",
          photoId: "p3",
          order: 1,
          selected: true,
          renderStatus: "done",
        },
      ],
    },
  ],
};
describe("rascunho aprovado por família", () => {
  it("deduplica a foto de irmãos e mantém ordem", () => {
    expect(
      orderedRecipientPhotos(draft.recipients[0]!.items).map((p) => p.photoId),
    ).toEqual(["p1", "p2"]);
    expect(selectionFromDraft(draft)[0]!.photoIds).toEqual(["p1", "p2"]);
  });
  it("retira e reordena só na família selecionada", () => {
    const initial = selectionFromDraft(draft);
    expect(changeRecipientSelection(initial, "familia-a", "p2", "up")).toEqual([
      { recipientId: "familia-a", photoIds: ["p2", "p1"] },
      initial[1],
    ]);
    expect(
      changeRecipientSelection(initial, "familia-a", "p1", "toggle")[0]!
        .photoIds,
    ).toEqual(["p2"]);
    expect(initial[0]!.photoIds).toEqual(["p1", "p2"]);
  });
  it("recusa foto de outra família, seleção duplicada e conjunto vazio", () => {
    expect(
      validateDraftSelection(draft, [
        { recipientId: "familia-a", photoIds: ["p3"] },
        { recipientId: "familia-b", photoIds: [] },
      ]),
    ).toBeTruthy();
    expect(
      validateDraftSelection(draft, [
        { recipientId: "familia-a", photoIds: ["p1", "p1"] },
        { recipientId: "familia-b", photoIds: [] },
      ]),
    ).toBeTruthy();
    expect(
      validateDraftSelection(
        draft,
        draft.recipients.map((r) => ({ recipientId: r.id, photoIds: [] })),
      ),
    ).toBeTruthy();
    expect(validateDraftSelection(draft, selectionFromDraft(draft))).toBeNull();
  });
  it("limita os campos e impede trocar o link do sistema", () => {
    expect(validateDeliveryFields(fields)).toBeNull();
    expect(validateDeliveryFields({ ...fields, signature: "" })).toBeTruthy();
    expect(
      validateDeliveryFields({ ...fields, eventName: "a".repeat(121) }),
    ).toBeTruthy();
    expect(
      validateDeliveryFields({ ...fields, eventName: " ".repeat(120) + "a" }),
    ).toBeTruthy();
    expect(
      validateDeliveryFields({
        ...fields,
        callToAction: "https://fora.example",
      }),
    ).toBeTruthy();
    expect(
      validateDeliveryFields({ ...fields, callToAction: "quebra\nlinha" }),
    ).toBeTruthy();
    expect(deliveryMessage(fields)).toContain("sessão de 24 horas");
  });
  it("não oferece retry para resultado incerto nem envia estados terminais", () => {
    for (const state of [
      "unknown",
      "sending",
      "delivered",
      "read",
      "revoked",
      "expired",
    ])
      expect(canTransmitRecipient(state, true)).toBe(false);
    expect(canTransmitRecipient("queued", true)).toBe(true);
    expect(canTransmitRecipient("ready", false)).toBe(false);
    expect(canResendRecipient("delivered")).toBe(true);
    expect(canResendRecipient("failed")).toBe(true);
    expect(canResendRecipient("unknown")).toBe(false);
  });
});

it("aprovacao exige prévia realmente carregada da versão/URL atual sem erro de consulta", () => {
  const photo = draft.recipients[0]!.items[0]!;
  const urls = new Map([[photo.id, "signed-current"]]);
  expect(deliveryPreviewReady([photo], urls, {}, false)).toBe(false);
  expect(
    deliveryPreviewReady([photo], urls, { [photo.id]: "signed-old" }, false),
  ).toBe(false);
  expect(
    deliveryPreviewReady([photo], urls, { [photo.id]: "signed-current" }, true),
  ).toBe(false);
  expect(deliveryPreviewReady([undefined], urls, {}, false)).toBe(false);
  expect(
    deliveryPreviewReady(
      [photo],
      urls,
      { [photo.id]: "signed-current" },
      false,
    ),
  ).toBe(true);
});

it("lote em transmissão continua ativo e papel usa escola do evento", () => {
  expect(isActiveDeliveryBatch("processing")).toBe(true);
  expect(isActiveDeliveryBatch("completed")).toBe(false);
  const schools = [
    { schoolId: "escola-a", role: "school_admin" },
    { schoolId: "escola-b", role: "school_viewer" },
  ];
  expect(canApproveDeliveryForSchool(schools, "escola-a")).toBe(true);
  expect(canApproveDeliveryForSchool(schools, "escola-b")).toBe(false);
  expect(canApproveDeliveryForSchool(schools, undefined)).toBe(false);
});

it("não repete aprovação da versão atual; salvar outra versão exige novo aceite", () => {
  expect(
    requiresDeliveryApproval({
      ...draft.batch,
      version: 2,
      approvedVersion: 2,
    }),
  ).toBe(false);
  expect(
    requiresDeliveryApproval({
      ...draft.batch,
      version: 3,
      approvedVersion: 2,
    }),
  ).toBe(true);
  expect(
    requiresDeliveryApproval({ ...draft.batch, approvedVersion: null }),
  ).toBe(true);
});

it("falha no preparo pede atenção e não promete entrega", () => {
  const batch = {
    status: "preparing",
    itemCount: 5,
    renderedCount: 4,
    failedCount: 1,
  };
  expect(deliveryPreparationState(batch)?.label).toBe("Precisa de atenção");
  expect(deliveryPreparationState({ ...batch, failedCount: 0 })?.label).toBe(
    "Preparando fotos",
  );
  expect(
    deliveryPreparationState({
      ...batch,
      status: "awaiting_review",
      failedCount: 0,
    })?.description,
  ).toContain("Nada foi enviado");
  expect(
    deliveryPreparationState({ ...batch, status: "canceled" })?.label,
  ).toBe("Cancelado");
});
it("orienta atualização do álbum sem pedir revisão de proteção", () => {
  expect(
    deliveryPreviewProblem("render_atualizacao_necessaria"),
  ).toContain("versão nítida");
  expect(deliveryPreviewProblem("Prévia expirada")).toContain("Atualize");
  expect(deliveryPreviewProblem("erro de rede")).toContain("Atualize");
});
it("só oferece revogação quando um acesso pode ter sido emitido", () => {
  for (const status of [
    "preparing",
    "queued",
    "ready",
    "failed",
    "revoked",
    "canceled",
    "expired",
  ])
    expect(canRevokeDeliveryAccess(status)).toBe(false);
  for (const status of ["accepted", "sent", "delivered", "read", "unknown"])
    expect(canRevokeDeliveryAccess(status)).toBe(true);
});

it("retira falhas apenas desta família sem apagar origem, ordem ou seleção das demais", () => {
  const original = selectionFromDraft(draft),
    before = structuredClone(draft);
  const removed = removeRecipientPhotos(original, "familia-a", ["p2"]);
  expect(removed[0]!.photoIds).toEqual(["p1"]);
  expect(removed[1]).toEqual(original[1]);
  expect(original[0]!.photoIds).toEqual(["p1", "p2"]);
  expect(draft).toEqual(before);
  expect(validateDraftSelection(draft, removed)).toBeNull();
});
it("atalho distingue falha atual de carregamento, URL antiga e falha global", () => {
  const items = [
    {
      id: "ok",
      photoId: "ok-photo",
      order: 0,
      selected: true,
      renderStatus: "done" as const,
    },
    {
      id: "no-url",
      photoId: "protected",
      order: 1,
      selected: true,
      renderStatus: "done" as const,
    },
    {
      id: "failed",
      photoId: "broken",
      order: 2,
      selected: true,
      renderStatus: "failed" as const,
    },
    {
      id: "loading",
      photoId: "waiting",
      order: 3,
      selected: true,
      renderStatus: "queued" as const,
    },
  ];
  const urls = new Map([["ok", "current"]]),
    ids = items.map((i) => i.photoId);
  expect(
    problematicRecipientPhotos(items, ids, urls, { ok: "old" }, false),
  ).toEqual(["broken"]);
  expect(
    problematicRecipientPhotos(items, ids, urls, { ok: "current" }, false),
  ).toEqual(["ok-photo", "broken"]);
  expect(
    problematicRecipientPhotos(items, ids, urls, { ok: "current" }, true),
  ).toEqual(["broken"]);
  expect(
    problematicRecipientPhotos(items, ["ok-photo"], urls, {}, false),
  ).toEqual([]);
  expect(deliveryPreviewReady([items[0]], urls, { ok: "current" }, false)).toBe(
    true,
  );
  expect(
    deliveryPreviewReady([items[0], items[1]], urls, { ok: "current" }, false),
  ).toBe(false);
});

it("problema explícito retira só afetadas, enquanto URL ausente continua bloqueando aprovação", () => {
  const photo = draft.recipients[0]!.items[0]!,
    queued = draft.recipients[0]!.items[2]!;
  expect(
    problematicRecipientPhotos(
      [photo, queued],
      ["p1", "p2"],
      new Map(),
      {},
      false,
      new Map([[photo.id, "unavailable"]]),
    ),
  ).toEqual(["p1"]);
  expect(
    problematicRecipientPhotos([photo], ["p1"], new Map(), {}, false),
  ).toEqual([]);
  expect(deliveryPreviewReady([photo], new Map(), {}, false)).toBe(false);
});

it("foto antiga pede atualização sem ser retirada como falha", () => {
  const photo = { ...draft.recipients[0]!.items[0]!, renderStatus: "failed" as const };
  const problems = new Map([[photo.id, "refresh_required" as const]]);
  expect(problematicRecipientPhotos([photo], [photo.photoId], new Map(), {}, false, problems)).toEqual([]);
  expect(deliveryPreviewReady([photo], new Map(), {}, false)).toBe(false);
  expect(deliveryPhotoProblemLabel("refresh_required")).toContain("nítida");
  const batch = { status: "preparing", itemCount: 5, renderedCount: 0, failedCount: 5 };
  expect(deliveryPreparationState(batch, true)?.label).toBe("Atualizar fotos");
  expect(deliveryPreparationState({ ...batch, status: "canceled" }, true)?.label).toBe("Cancelado");
});

it("aprovado com envio fechado não se apresenta como fila", () => {
  const batch = { status: "queued", itemCount: 2, renderedCount: 2, failedCount: 0 };
  expect(deliveryPreparationState(batch, false, true)?.label).toBe("Aprovado, sem envio");
  expect(deliveryPreparationState(batch, false, true)?.description).toContain("continua desligado");
  expect(deliveryPreparationState(batch)?.label).toBeUndefined();
  expect(deliverySendBlockCopy("paused")).toContain("pausado");
  expect(deliverySendBlockCopy("album_not_ready")).toContain("álbum ainda não está liberado");
  expect(deliverySendBlockCopy("public_url_invalid")).toContain("endereço público");
  expect(deliverySendBlockCopy("provider_missing")).toBe(deliverySendBlockCopy("instance_missing"));
  expect(deliverySendBlockCopy("unknown")).toContain("confirmar");
  expect(deliverySendView({ isPending: true, isError: false })).toBe("loading");
  expect(deliverySendView({ isPending: false, isError: true })).toBe("unknown");
  expect(deliverySendView({ isPending: false, isError: false, data: { sending: "ready" } })).toBe("ready");
  expect(deliverySendView({ isPending: false, isError: false, data: { sending: "blocked", reason: "paused" } })).toBe("paused");
  expect(deliverySendView({ isPending: false, isError: false, data: { sending: "blocked", reason: "ZAPI_TOKEN" } })).toBe("unknown");
});
