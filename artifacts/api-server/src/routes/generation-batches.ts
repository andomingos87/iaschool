import { Router, type Request, type Response, type IRouter } from "express";
import { requireSupabaseUser } from "../middlewares/supabase-auth";
import { BatchError, BATCH_PROCESS_PATH, UUID, batchConfig, batchRpc, safeObjectPath, signObject, validWorkerSignature } from "../lib/generation-batch-service";
import { processGenerationBatchItem } from "../lib/generation-batch-process";
import { composeBatchPrompt } from "../lib/art-protection";
const router: IRouter = Router();
export const generationBatchRoutesDeps = { rpc: batchRpc, sign: signObject, process: processGenerationBatchItem };
const errors: Record<string, string> = { reference_unavailable: "O modelo de arte não está mais disponível. Escolha outro.", quota_exceeded: "O lote ultrapassa sua cota diária disponível.", student_ineligible: "Um aluno deixou de estar apto. Atualize a seleção.", photo_ineligible: "Uma foto deixou de estar disponível para este aluno.", forbidden: "Você não tem permissão para esta escola.", invalid_input: "Confira os dados do lote.", retry_not_allowed: "Só itens que falharam podem ser repetidos manualmente.", request_conflict: "Esta solicitação já foi usada para outro lote." };
function photoBucket(source: string): string {
    if (source === "profile")
        return "students";
    if (source === "reference_face")
        return "student-refs";
    return "event-photos";
}
function flag(value: unknown): boolean {
    if (value === undefined)
        return false;
    if (typeof value !== "boolean")
        throw new BatchError("invalid_input", 400);
    return value;
}
function fail(res: Response, error: unknown) {
    const e = error instanceof BatchError ? error : new BatchError("batch_unavailable");
    res.status(e.status).json({ code: e.code, error: errors[e.code] ?? "Não foi possível acessar o lote. Tente novamente." });
}
function token(req: Request): string {
    const value = req.headers.authorization;
    if (!req.supabaseUserId || !value?.startsWith("Bearer "))
        throw new BatchError("forbidden", 403);
    return value.slice(7);
}
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value))
    throw new BatchError("invalid_input", 400); return value; }
interface Detail {
    id: string;
    schoolId: string;
    status: string;
    prompt: string;
    total: number;
    completed: number;
    failed: number;
    items: Array<{
        id: string;
        studentId: string;
        status: string;
        photo: {
            source: string;
            id: string;
        };
        resultPath?: string | null;
        error?: string | null;
    }>;
}
async function detailProjection(data: Detail): Promise<unknown> {
    return { ...data, items: await Promise.all(data.items.map(async ({ resultPath, ...item }) => ({ ...item, ...(item.status === "completed" && resultPath ? { imageUrl: await generationBatchRoutesDeps.sign("generated", safeObjectPath(resultPath, data.schoolId, "generated")) } : {}) }))) };
}
router.post(BATCH_PROCESS_PATH, async (req, res) => {
    try {
        const { service } = batchConfig();
        if (!validWorkerSignature(service, req.headers["x-iaschool-timestamp"], req.headers["x-iaschool-signature"], JSON.stringify(req.body)))
            throw new BatchError("forbidden", 403);
        const itemId = uuid(req.body?.itemId), leaseId = uuid(req.body?.leaseId);
        res.json(await generationBatchRoutesDeps.process(itemId, leaseId));
    }
    catch (error) {
        fail(res, error);
    }
});
router.get("/generation/batches/eligibility", requireSupabaseUser, async (req, res) => {
    try {
        res.json(await generationBatchRoutesDeps.rpc("generation_batch_eligibility", { p_school_id: uuid(req.query.schoolId) }, token(req)));
    }
    catch (error) {
        fail(res, error);
    }
});
router.get("/generation/batches/photos", requireSupabaseUser, async (req, res) => {
    try {
        const data = await generationBatchRoutesDeps.rpc<{
            schoolId: string;
            photos: Array<{
                source: "profile" | "event" | "reference_face";
                id: string;
                path: string;
                eventId?: string;
                eventName?: string;
            }>;
        }>("generation_batch_photo_choices", { p_student_id: uuid(req.query.studentId) }, token(req));
        const photos = await Promise.all(data.photos.map(async ({ path, ...photo }) => {
            const bucket = photoBucket(photo.source);
            return { ...photo, url: await generationBatchRoutesDeps.sign(bucket, safeObjectPath(path, data.schoolId, bucket)) };
        }));
        res.json({ photos });
    }
    catch (error) {
        fail(res, error);
    }
});
router.post("/generation/batches", requireSupabaseUser, async (req, res) => {
    try {
        const body = req.body as {
            requestId?: unknown;
            schoolId?: unknown;
            prompt?: unknown;
            referenceId?: unknown;
            noLogo?: unknown;
            noText?: unknown;
            students?: unknown;
        };
        if (typeof body.prompt !== "string" || body.prompt.trim().length > 3000 || !Array.isArray(body.students) || body.students.length < 1 || body.students.length > 50)
            throw new BatchError("invalid_input", 400);
        const noLogo = flag(body.noLogo), noText = flag(body.noText);
        const prompt = composeBatchPrompt({ userPrompt: body.prompt, noLogo, noText });
        if (prompt.length > 3500)
            throw new BatchError("invalid_input", 400);
        const students = body.students.map((raw: unknown) => {
            const item = raw as {
                studentId?: unknown;
                photo?: {
                    source?: unknown;
                    id?: unknown;
                };
            };
            const studentId = uuid(item?.studentId), source = item?.photo?.source, photoId = item?.photo?.id;
            if (!["profile", "event", "reference_face"].includes(String(source)) || typeof photoId !== "string" || photoId.length < 1 || photoId.length > 1024)
                throw new BatchError("invalid_input", 400);
            if (source === "event" || source === "reference_face")
                uuid(photoId);
            return { studentId, source, photoId };
        });
        if (new Set(students.map(s => s.studentId)).size !== students.length)
            throw new BatchError("invalid_input", 400);
        const data = await generationBatchRoutesDeps.rpc<Detail>("create_generation_batch", { p_school_id: uuid(body.schoolId), p_request_id: uuid(body.requestId), p_prompt: prompt, p_students: students, p_reference_id: uuid(body.referenceId) }, token(req));
        res.status(201).json(await detailProjection(data));
    }
    catch (error) {
        fail(res, error);
    }
});
router.get("/generation/batches", requireSupabaseUser, async (req, res) => {
    try {
        res.json(await generationBatchRoutesDeps.rpc("generation_batches_for_school", { p_school_id: uuid(req.query.schoolId) }, token(req)));
    }
    catch (error) {
        fail(res, error);
    }
});
router.get("/generation/batches/:id", requireSupabaseUser, async (req, res) => {
    try {
        const data = await generationBatchRoutesDeps.rpc<Detail>("generation_batch_detail", { p_batch_id: uuid(req.params.id) }, token(req));
        res.json(await detailProjection(data));
    }
    catch (error) {
        fail(res, error);
    }
});
router.post("/generation/batches/:id/retry", requireSupabaseUser, async (req, res) => {
    try {
        if (!Array.isArray(req.body?.itemIds) || req.body.itemIds.length < 1 || req.body.itemIds.length > 50)
            throw new BatchError("invalid_input", 400);
        const itemIds = req.body.itemIds.map(uuid);
        if (new Set(itemIds).size !== itemIds.length)
            throw new BatchError("invalid_input", 400);
        const data = await generationBatchRoutesDeps.rpc<Detail>("retry_generation_batch", { p_batch_id: uuid(req.params.id), p_request_id: uuid(req.body?.requestId), p_item_ids: itemIds }, token(req));
        res.json(await detailProjection(data));
    }
    catch (error) {
        fail(res, error);
    }
});
export default router;
