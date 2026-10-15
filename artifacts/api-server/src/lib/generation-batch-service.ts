import { createHmac, timingSafeEqual } from "node:crypto";
export const BATCH_PROCESS_PATH = "/generation/batches/internal/process";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class BatchError extends Error {
    constructor(public code: string, public status = 503) { super(code); }
}
export function batchConfig() {
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !service)
        throw new BatchError("configuration_missing");
    return { url: url.replace(/\/$/, ""), anon, service };
}
export async function batchRpc<T>(name: string, args: Record<string, unknown>, token?: string): Promise<T> {
    const cfg = batchConfig();
    const response = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { apikey: token ? cfg.anon : cfg.service, Authorization: `Bearer ${token ?? cfg.service}`, "Content-Type": "application/json" },
        body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({})) as {
            message?: string;
        };
        const safeCodes = ["quota_exceeded", "student_ineligible", "photo_ineligible", "forbidden", "batch_not_found", "invalid_input", "request_conflict", "retry_not_allowed"];
        const code = safeCodes.find(c => error.message === c) ?? "batch_unavailable";
        throw new BatchError(code, code === "forbidden" ? 403 : code === "batch_not_found" ? 404 : code === "batch_unavailable" ? 503 : 409);
    }
    return await response.json() as T;
}
export function workerSignature(secret: string, timestamp: string, body: string): string {
    return createHmac("sha256", secret).update(`POST\n${BATCH_PROCESS_PATH}\n${timestamp}\n${body}`).digest("hex");
}
export function validWorkerSignature(secret: string, timestamp: unknown, signature: unknown, body: string, now = Date.now()): boolean {
    if (typeof timestamp !== "string" || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60000 || typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature))
        return false;
    return timingSafeEqual(Buffer.from(workerSignature(secret, timestamp, body), "hex"), Buffer.from(signature, "hex"));
}
export function safeObjectPath(path: unknown, schoolId: string, bucket: string): string {
    if (typeof path !== "string")
        throw new BatchError("photo_ineligible", 409);
    const raw = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
    if (!raw.startsWith(`${schoolId}/`) || raw.length > 1024 || !/^[a-zA-Z0-9/_.-]+$/.test(raw) || raw.split("/").some(p => !p || p === "." || p === ".."))
        throw new BatchError("photo_ineligible", 409);
    return raw;
}
export async function readObject(bucket: string, path: string, maxBytes: number, allowMissing = false): Promise<Buffer | null> {
    const cfg = batchConfig();
    const response = await fetch(`${cfg.url}/storage/v1/object/authenticated/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}` }, signal: AbortSignal.timeout(30000) });
    if (allowMissing && response.status === 404)
        return null;
    if (allowMissing && response.status === 400) {
        const problem = await response.json().catch(() => ({})) as {
            statusCode?: string;
            error?: string;
        };
        if (problem.statusCode === "404" || problem.error === "not_found")
            return null;
        throw new BatchError("storage_unavailable");
    }
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > maxBytes)
        throw new BatchError("storage_unavailable");
    const reader = response.body?.getReader();
    if (!reader)
        throw new BatchError("storage_unavailable");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.byteLength;
            if (size > maxBytes)
                throw new BatchError("image_too_large", 409);
            chunks.push(part.value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
    }
    return Buffer.concat(chunks);
}
export async function putObject(path: string, bytes: Buffer): Promise<void> {
    const cfg = batchConfig();
    const response = await fetch(`${cfg.url}/storage/v1/object/generated/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "image/png", "x-upsert": "false" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(30000) });
    if (!response.ok)
        throw new BatchError("storage_unavailable");
}
export async function signObject(bucket: string, path: string): Promise<string> {
    const cfg = batchConfig();
    const response = await fetch(`${cfg.url}/storage/v1/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }), signal: AbortSignal.timeout(10000) });
    if (!response.ok)
        throw new BatchError("storage_unavailable");
    const data = await response.json() as {
        signedURL?: string;
    };
    if (!data.signedURL?.startsWith("/object/sign/"))
        throw new BatchError("storage_unavailable");
    return `${cfg.url}/storage/v1${data.signedURL}`;
}
