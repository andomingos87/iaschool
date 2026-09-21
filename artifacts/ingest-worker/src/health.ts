// GET /health (spec §11): 200 quando o laço está vivo e nenhum lote está
// parado; 503 com o motivo caso contrário. A Fly usa isto para reiniciar a
// máquina; por isso lote abandonado pelo cliente (sem job pendente) NÃO
// derruba o health (ver `stalled_batch_jobs.pending_jobs`).

import { createServer, type Server } from "node:http";

export interface HealthState {
  inFlight(): number;
  lastClaimAt(): number | null;
  lastTickAt(): number;
  /** Último valor lido de `stalled_batch_jobs` (null = ainda não consultou). */
  stalledCount(): number | null;
  stopping(): boolean;
}

export interface HealthOptions {
  loopStaleMs: number;
  now?: () => number;
  /** Interface de escuta; padrão 0.0.0.0 (a Fly fala com a máquina por IPv4/6 interno). */
  host?: string;
}

export function healthReport(state: HealthState, opts: HealthOptions): { status: number; body: Record<string, unknown> } {
  const now = (opts.now ?? Date.now)();
  const stalled = state.stalledCount();
  const loopAge = now - state.lastTickAt();
  const base = {
    inFlight: state.inFlight(),
    lastClaimAt: state.lastClaimAt() ? new Date(state.lastClaimAt()!).toISOString() : null,
    loopAgeMs: loopAge,
    stalled: stalled ?? 0,
  };
  if (state.stopping()) return { status: 503, body: { ok: false, reason: "stopping", ...base } };
  if (loopAge > opts.loopStaleMs) return { status: 503, body: { ok: false, reason: "loop_stale", ...base } };
  if ((stalled ?? 0) > 0) return { status: 503, body: { ok: false, reason: "stalled_batches", ...base } };
  return { status: 200, body: { ok: true, ...base } };
}

export function startHealthServer(
  port: number,
  state: HealthState,
  opts: HealthOptions,
): { server: Server; close(): Promise<void>; port(): number } {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || (req.url !== "/health" && req.url !== "/health/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "not_found" }));
      return;
    }
    const { status, body } = healthReport(state, opts);
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  });
  server.listen(port, opts.host ?? "0.0.0.0");
  return {
    server,
    port() {
      const addr = server.address();
      return typeof addr === "object" && addr ? addr.port : port;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
