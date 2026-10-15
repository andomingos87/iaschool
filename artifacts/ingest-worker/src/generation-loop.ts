import { createHmac } from "node:crypto";
import type { WorkerClient } from "./supabase";
import { defaultSleep } from "./loop";
interface GenerationJob {
    id: string;
    lease_id: string;
    attempt: number;
}
export interface GenerationLoopDeps {
    claim(): Promise<GenerationJob[]>;
    process(job: GenerationJob): Promise<void>;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    onError?: () => void;
}
/** Uma geração por vez; falha de transporte não repete o pedido ao provedor. */
export function startGenerationLoop(deps: GenerationLoopDeps) {
    let stopping = false;
    const controller = new AbortController();
    const finished = (async () => {
        while (!stopping) {
            try {
                const jobs = await deps.claim();
                for (const job of jobs) {
                    if (stopping)
                        break;
                    try {
                        await deps.process(job);
                    }
                    catch {
                        deps.onError?.();
                    }
                }
            }
            catch {
                deps.onError?.();
            }
            if (!stopping)
                await (deps.sleep ?? defaultSleep)(5000, controller.signal);
        }
    })();
    return { async stop() { stopping = true; controller.abort(); await finished; } };
}
export function makeGenerationLoopDeps(client: WorkerClient, serviceKey: string, apiUrl: string, fetcher: typeof fetch = fetch): GenerationLoopDeps {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash)
        throw new Error("GENERATION_API_URL inválida");
    return {
        async claim() {
            const { data, error } = await client.rpc("claim_generation_batch_items", { p_limit: 1, p_lease_seconds: 600 });
            if (error)
                throw new Error("fila de geração indisponível");
            return (data ?? []) as GenerationJob[];
        },
        async process(job) {
            const path = "/generation/batches/internal/process";
            const timestamp = String(Date.now());
            const body = JSON.stringify({ itemId: job.id, leaseId: job.lease_id });
            const signature = createHmac("sha256", serviceKey).update(`POST\n${path}\n${timestamp}\n${body}`).digest("hex");
            const response = await fetcher(`${apiUrl.replace(/\/$/, "")}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-iaschool-timestamp": timestamp, "x-iaschool-signature": signature }, body, signal: AbortSignal.timeout(420000) });
            if (!response.ok)
                throw new Error("processamento de geração indisponível");
            // A API já conclui ou registra a falha; transporte incerto aguarda recovery SQL.
        },
    };
}
