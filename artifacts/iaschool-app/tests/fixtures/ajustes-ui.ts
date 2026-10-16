/** Respostas falsas para ENSAIO de UI. Nenhum provedor, banco ou cookie real.
 * O teste transacional do SQL e os testes de pixels rodam separadamente. */
import {createMockGenerationBatchService,installGenerationBatchFixtureService} from "../../src/lib/generation-batches";
import type { DataLayer, DeliveryBatchSummary, DeliveryPreviewItem, Photo, ReviewFace, SchoolEvent } from "../../src/lib/data";
import { regionValidationError, type PhotoPersonReview, type ConfirmedReferencePhoto } from "../../src/lib/data/review-media";
import type { DeliveryDraft } from "../../src/lib/delivery-workspace";
export async function prepareAdjustmentsUi(data: DataLayer, syntheticUrl: string, syntheticArtUrl = syntheticUrl) {
  if (!data.isMock || !["localhost", "127.0.0.1"].includes(location.hostname)) throw new Error("Fixture somente local.");
  const read = <T,>(key: string): T[] => JSON.parse(localStorage.getItem(`iaschool:${key}`) ?? "[]");
  const write = (key: string, value: unknown) => localStorage.setItem(`iaschool:${key}`, JSON.stringify(value));
  const photos = read<Photo>("photos");
  const faces = () => read<ReviewFace & { eventId: string }>("photo-faces");
  const events = read<SchoolEvent>("events");
  const references = new Set<string>();
  data.reviewMedia.referenceCandidates = async studentId => {
    const result: ConfirmedReferencePhoto[] = [];
    for (const face of faces().filter(face => face.state === "confirmed" && face.studentId === studentId)) {
      const photo = photos.find(p => p.id === face.photoId)!;
      const event = events.find(e => e.id === photo.eventId)!;
      result.push({ photo_id: photo.id, face_id: face.id, event_id: event.id, event_name: event.name,
        event_date: event.eventDate, width: photo.width!, height: photo.height!, bbox: face.bbox,
        storage_path: photo.storagePath, already_used: references.has(face.id), imageUrl: await data.photos.signPhotoUrl(photo) });
    }
    return result;
  };
  data.reviewMedia.enqueueEventReference = async (studentId, faceId) => {
    if (!faces().some(f => f.id === faceId && f.studentId === studentId && f.state === "confirmed")) throw new Error("Rosto não confirmado");
    if (references.has(faceId)) return { id: faceId, duplicate: true };
    references.add(faceId);
    write("reference-jobs", [...read("reference-jobs"), { id: `reference-${faceId}`, studentId, schoolId: "user-escola",
      storagePath: "test/cropped-face.jpg", sourceKind: "event_face", sourceFaceId: faceId, status: "queued", attempts: 0, createdAt: new Date().toISOString() }]);
    return { id: faceId, duplicate: false };
  };
  const reviews = new Map<string, PhotoPersonReview>();
  data.reviewMedia.photoReview = async photoId => {
    if (reviews.has(photoId)) return structuredClone(reviews.get(photoId)!);
    const photo = photos.find(p => p.id === photoId)!;
    return { photo_id: photoId, regions_version: 0, reviewed_version: null, all_people_reviewed: false,
      width: photo.width!, height: photo.height!, storage_path: photo.storagePath,
      faces: faces().filter(f => f.photoId === photoId).map(f => ({ id: f.id, state: f.state, student_id: f.studentId ?? null, student_name: f.studentName ?? null, bbox: f.bbox })),
      regions: [], imageUrl: await data.photos.signPhotoUrl(photo) };
  };
  data.reviewMedia.savePhotoReview = async input => {
    const current = await data.reviewMedia.photoReview(input.photoId);
    if (current.regions_version !== input.expectedVersion) throw new Error("A versão mudou");
    for (const region of input.regions) { const error = regionValidationError(region, input.width, input.height); if (error) throw new Error(error); }
    const next = { ...current, regions: input.regions, regions_version: current.regions_version + 1,
      reviewed_version: input.allPeopleReviewed ? current.regions_version + 1 : null, all_people_reviewed: input.allPeopleReviewed };
    reviews.set(input.photoId, next); return structuredClone(next);
  };
  const batchId = "10000000-0000-4000-8000-000000000001";
  const recipientId = "20000000-0000-4000-8000-000000000001";
  const draft: DeliveryDraft = { batch: { id: batchId, eventId: "evento-b", status: "awaiting_review", version: 1, approvedVersion: null,
    fields: { eventName: "Evento Sintético", callToAction: "Confira o álbum da escola", signature: "Escola Horizonte" } },
    recipients: [{ id: recipientId, guardianName: "Responsável Sintético", phoneMasked: "+55 (***) *****-1234", status: "ready",
      students: [{ id: "aluno-a", name: "Aluno Sintético A" }, { id: "aluno-b", name: "Aluno Sintético B" }],
      items: photos.filter(p => p.eventId === "evento-b").map((p, index) => ({ id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        photoId: p.id, order: index, selected: true, renderStatus: "done" })) }] };
  function summary(): DeliveryBatchSummary { return { id: batchId, status: draft.batch.status as DeliveryBatchSummary["status"], termsVersion: "test.v1",
    recipientCount: 1, itemCount: draft.recipients[0]!.items.filter(i => i.selected).length,
    renderedCount: draft.recipients[0]!.items.filter(i => i.selected && i.renderStatus === "done").length, failedCount: draft.recipients[0]!.items.filter(i => i.selected && i.renderStatus === "failed").length,
    createdAt: new Date().toISOString(), approvedAt: draft.batch.approvedVersion != null ? "2026-10-15T09:46:00.000Z" : undefined, recipientsByStatus: { [draft.recipients[0]!.status]: 1 } }; }
  const params = new URLSearchParams(location.search);
  const deliveryFailure = params.get("falha") === "1";
  const sendReady = params.get("envio") === "1";
  let previewFailure = deliveryFailure;
  let refreshRequired = params.get("atualizar") === "1";
  if (deliveryFailure) { draft.batch.status = "preparing"; draft.recipients[0]!.status = "preparing"; draft.recipients[0]!.items[0]!.renderStatus = "failed"; }
  if (refreshRequired) { draft.batch.status = "preparing"; draft.recipients[0]!.status = "preparing"; for (const item of draft.recipients[0]!.items) item.renderStatus = "failed"; }
  if (params.get("aprovado") === "1") { draft.batch.approvedVersion = draft.batch.version; draft.batch.status = "queued"; draft.recipients[0]!.status = "queued"; }
  data.deliveries.retryFailedRenders = async () => {
    refreshRequired = false;
    const failed = draft.recipients[0]!.items.filter(item => item.selected && item.renderStatus === "failed");
    for (const item of failed) item.renderStatus = "done";
    draft.batch.status = "awaiting_review"; draft.recipients[0]!.status = "ready"; return failed.length;
  };
  data.deliveries.cancelBatch = async () => { draft.batch.status = "canceled"; draft.recipients[0]!.status = "canceled"; return { canceledRecipients: 1, canceledJobs: 0 }; };
  const previews: DeliveryPreviewItem[] = draft.recipients[0]!.items.map(i => ({ itemId: i.id, studentName: "Alunos sintéticos", url: syntheticUrl }));
  data.deliveries.preflight = async () => ({ event: { id: "evento-b", name: "Evento Sintético" }, unassignedPendingFaces: 0, recipients: [] });
  data.deliveries.batchesForEvent = async eventId => eventId === "evento-b" ? [summary()] : [];
  data.deliveries.batchDetail = async () => ({ batch: { ...summary(), eventId: "evento-b" }, recipients: [{ id: recipientId,
    guardianName: "Responsável Sintético", phoneMasked: "+55 (***) *****-1234", status: draft.recipients[0]!.status as "ready",
    students: ["Aluno Sintético A", "Aluno Sintético B"], lastError: refreshRequired ? "render_atualizacao_necessaria" : undefined, itemsTotal: summary().itemCount, itemsRendered: summary().renderedCount, itemsFailed: summary().failedCount }] });
  data.deliveries.previewItems = async () => { if (previewFailure) { previewFailure = false; throw new Error("Serviço temporariamente indisponível"); } if (refreshRequired) return previews.map(p => ({ itemId: p.itemId, studentName: p.studentName, problem: "refresh_required" })); return previews.filter(p => draft.recipients[0]!.items.some(i => i.id === p.itemId && i.renderStatus === "done")); };
  data.deliveries.previewAssetUrl = async () => syntheticUrl;
  data.deliveries.approveBatch = async () => { draft.batch.approvedVersion = draft.batch.version; draft.batch.status = "queued";
    draft.recipients[0]!.status = "queued"; return { approved: 1, blocked: 0 }; };
  data.auth.getAccessToken = async () => "synthetic-fixture-jwt";
  // A UI de geração usa um resultado falso; a composição REAL tem teste de pixels no servidor.
  data.generation.getQuota = async () => ({ limit: 50, used: 0, remaining: 50 });
  data.generation.generate = async (_request, progress) => {
    progress?.(100);
    return { imageUrl: syntheticArtUrl, details: { prompt: "Resultado falso para ensaio de interface", model: "fixture-local", size: "1024x1024", images: [] } };
  };
  installGenerationBatchFixtureService(createMockGenerationBatchService(data, {failStudentIds:["aluno-b"],eventPhotos:{"aluno-a":[{source:"event",id:"solo-evento-sintetico",url:syntheticUrl,eventId:"evento-a",eventName:"Evento Sintético (aluno sozinho)"}]}}));
  const realFetch = window.fetch.bind(window);
  let session = false;
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const album = () => ({ eventName: draft.batch.fields.eventName, signature: draft.batch.fields.signature,
    sessionExpiresAt: new Date(Date.now() + 86400_000).toISOString(), filesExpireAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    items: draft.recipients[0]!.items.filter(i => i.selected).sort((a, b) => a.order - b.order).map((item, index) => ({
      id: item.id, photoId: item.photoId, width: 320, height: 240, thumbUrl: syntheticUrl,
      eventId: index % 2 === 0 ? "20000000-0000-4000-8000-0000000000a1" : "20000000-0000-4000-8000-0000000000a2",
      eventName: index % 2 === 0 ? "Formatura" : "Festa junina",
    })) });
  window.fetch = async (input, init) => {
    const endpoint = String(input);
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
    if (endpoint.endsWith("/rest/v1/rpc/delivery_draft_detail")) return json(structuredClone(draft));
    if (endpoint.endsWith("/rest/v1/rpc/save_delivery_draft")) {
      if (body.p_expected_version !== draft.batch.version) return json({ code: "version_changed" }, 409);
      draft.batch.version += 1; draft.batch.approvedVersion = null; draft.batch.fields = body.p_fields;
      for (const row of body.p_selection) for (const item of draft.recipients[0]!.items) { item.order = row.photoIds.indexOf(item.photoId); item.selected = item.order >= 0; }
      const pending = draft.recipients[0]!.items.some(item => item.selected && item.renderStatus !== "done");
      draft.batch.status = pending ? "preparing" : "awaiting_review";
      draft.recipients[0]!.status = pending ? "preparing" : "ready";
      return json({ version: draft.batch.version });
    }
    if (endpoint.endsWith("/functions/v1/school-delivery")) {
      if (body.action === "capability") return json(sendReady ? { ok: true, sending: "ready" } : { ok: true, sending: "blocked", reason: "paused" });
      if (!sendReady && body.action !== "revoke") return json({ code: "sending_disabled", reason: "paused" }, 503);
      draft.recipients[0]!.status = body.action === "revoke" ? "revoked" : "accepted";
      if (body.action === "revoke") session = false;
      return json({ status: draft.recipients[0]!.status });
    }
    if (endpoint === "/api/guardian-album") {
      if (body.action === "consume") session = true;
      if (!session) return json({ error: "unavailable" }, 401);
      if (body.action === "download") {
        // Bytes de imagem são fornecidos pela própria fixture, sem Storage real.
        return json({ url: `${location.origin}/tests/fixtures/ajustes-synthetic.jpg`, filename: "foto-sintetica.jpg", expiresAt: new Date(Date.now() + 300_000).toISOString() });
      }
      if (body.action === "audit_zip") return json({ ok: true });
      return json(album());
    }
    if (endpoint.endsWith("ajustes-synthetic.jpg")) return new Response(await (await realFetch(syntheticUrl)).blob(), { headers: { "Content-Type": "image/jpeg" } });
    return realFetch(input, init);
  };
}
