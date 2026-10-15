import sharp from "sharp";
import { OpenAI, toFile } from "openai";
import { photoPromptInstructions } from "./art-protection";
import { BatchError, batchRpc, putObject, readObject, safeObjectPath } from "./generation-batch-service";
export interface BatchItemContext {
    prompt: string;
    source: "profile" | "event";
    source_path: string;
    school_id: string;
    student_id: string;
    result_path: string;
    provider_started: boolean;
}
export const generationBatchDeps = {
    rpc: batchRpc, read: readObject, put: putObject,
    async generate(photo: Buffer, prompt: string): Promise<Buffer> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey)
            throw new BatchError("configuration_missing");
        const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 150000 });
        const response = await client.images.edit({ model: "gpt-image-2.5-flare", size: "1024x1024", image: [await toFile(photo, "foto-referencia.png", { type: "image/png" })], prompt: photoPromptInstructions(prompt) });
        const b64 = response.data?.[0]?.b64_json;
        if (!b64 || b64.length > 48000000)
            throw new BatchError("provider_result_invalid");
        return Buffer.from(b64, "base64");
    },
};
/** Cada tentativa pode chamar a IA uma vez. Recuperação de persistência usa o mesmo objeto. */
export async function processGenerationBatchItem(itemId: string, leaseId: string, deps = generationBatchDeps): Promise<{
    status: string;
}> {
    const args = { p_item_id: itemId, p_lease_id: leaseId };
    let started = false;
    let uploaded = false;
    let resultPath: string | undefined;
    async function complete() {
        const result = await deps.rpc<{
            status: string;
        }>("complete_generation_batch_item", args);
        if (result.status !== "completed" && resultPath)
            await deps.rpc("discard_generation_batch_asset", { p_item_id: itemId, p_result_path: resultPath });
        return result;
    }
    try {
        let context = await deps.rpc<BatchItemContext | null>("generation_batch_item_context", args);
        if (!context) {
            await deps.rpc("fail_generation_batch_item", { ...args, p_error_code: "authorization_changed", p_unknown: false });
            return { status: "failed" };
        }
        resultPath = safeObjectPath(context.result_path, context.school_id, "generated");
        if (!resultPath.includes(`/generation-batches/`))
            throw new BatchError("photo_ineligible", 409);
        const existing = await deps.read("generated", resultPath, 32000000, true);
        if (existing) {
            await sharp(existing, { limitInputPixels: 40000000, failOn: "warning" }).png().toBuffer();
            uploaded = true;
            return await complete();
        }
        if (context.provider_started) {
            await deps.rpc("fail_generation_batch_item", { ...args, p_error_code: "provider_outcome_unknown", p_unknown: true });
            return { status: "unknown" };
        }
        if (!process.env.OPENAI_API_KEY && deps === generationBatchDeps)
            throw new BatchError("configuration_missing");
        const bucket = context.source === "profile" ? "students" : "event-photos";
        const sourcePath = safeObjectPath(context.source_path, context.school_id, bucket);
        const raw = await deps.read(bucket, sourcePath, 8 * 1024 * 1024);
        if (!raw)
            throw new BatchError("photo_ineligible", 409);
        const input = sharp(raw, { limitInputPixels: 40000000, failOn: "warning" });
        const metadata = await input.metadata();
        if (!["png", "jpeg", "webp"].includes(metadata.format ?? ""))
            throw new BatchError("photo_ineligible", 409);
        const photo = await input.autoOrient().png().toBuffer();
        if (photo.length > 8 * 1024 * 1024)
            throw new BatchError("image_too_large", 409);
        // O SQL revalida vínculo, autorização, foto e lease no ato anterior ao provedor.
        if (!await deps.rpc<boolean>("begin_generation_batch_item", args))
            return { status: "stale" };
        started = true;
        const generated = await deps.generate(photo, context.prompt);
        const png = await sharp(generated, { limitInputPixels: 40000000, failOn: "warning" }).png().toBuffer();
        if (png.length > 32000000)
            throw new BatchError("provider_result_invalid");
        context = await deps.rpc<BatchItemContext | null>("generation_batch_item_context", args);
        if (!context)
            throw new BatchError("authorization_changed", 409);
        // Retenta apenas salvar estes mesmos bytes, nunca gerar novamente.
        let persisted = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (!await deps.rpc("generation_batch_item_context", args))
                throw new BatchError("authorization_changed", 409);
            try {
                await deps.put(resultPath, png);
                persisted = true;
                break;
            }
            catch {
                const recovered = await deps.read("generated", resultPath, 32000000, true).catch(() => null);
                if (recovered?.equals(png)) {
                    persisted = true;
                    break;
                }
            }
        }
        if (!persisted)
            throw new BatchError("storage_unavailable");
        uploaded = true;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await complete();
            }
            catch { /* Persistência somente: mesmo asset e tentativa. */ }
        }
        return { status: "persist_pending" };
    }
    catch (error) {
        if (uploaded) {
            if (resultPath)
                await deps.rpc("discard_generation_batch_asset", { p_item_id: itemId, p_result_path: resultPath }).catch(() => { });
            return { status: "persist_pending" };
        }
        const providerRejected = error instanceof OpenAI.APIError && typeof error.status === "number" && error.status >= 400 && error.status < 500 && error.status !== 408;
        const code = providerRejected ? "provider_rejected" : error instanceof BatchError ? error.code : started ? "provider_outcome_unknown" : "photo_unavailable";
        // Depois de iniciar o provedor, falha sem resultado salvo é ambígua: não repetir.
        const unknown = started && !providerRejected && code !== "authorization_changed" && code !== "provider_result_invalid";
        await deps.rpc("fail_generation_batch_item", { ...args, p_error_code: code, p_unknown: unknown }).catch(() => { });
        return { status: unknown ? "unknown" : "failed" };
    }
}
