import { Router, type IRouter } from "express";
import { requireLogsAdmin } from "../middlewares/logs-admin-auth";
import { requireSupabaseUser } from "../middlewares/supabase-auth";
import {
  attachGenerationResult,
  logsConfig,
  signLogFile,
} from "../lib/generation-log";

// API de leitura dos logs de geração (restrita ao admin da IAsport) e
// vinculação do resultado final (feita pelo app após salvar o post).

const router: IRouter = Router();

const LIST_COLUMNS =
  "id, created_at, user_email, user_name, school_name, student_name, status, duration_ms, result_thumb_path";

interface LogRow {
  id: string;
  created_at: string;
  user_id?: string | null;
  user_email: string | null;
  user_name: string | null;
  school_name: string | null;
  student_name: string | null;
  status: string;
  duration_ms: number | null;
  prompt?: string | null;
  payload?: Record<string, unknown> | null;
  attachments?: Array<{
    role: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    thumbPath: string | null;
  }> | null;
  openai_response?: Record<string, unknown> | null;
  server_status?: number | null;
  server_response?: Record<string, unknown> | null;
  result_thumb_path: string | null;
  result_url?: string | null;
}

router.get("/generation/logs", requireLogsAdmin, async (req, res) => {
  const config = logsConfig();
  if (!config) {
    res.status(503).json({
      error:
        "Logs indisponíveis: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.",
    });
    return;
  }

  const page = Math.max(1, Number(req.query["page"]) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query["pageSize"]) || 20));
  const status = req.query["status"];
  const from = req.query["from"];
  const to = req.query["to"];

  const params = new URLSearchParams();
  params.set("select", LIST_COLUMNS);
  params.set("order", "created_at.desc");
  params.set("limit", String(pageSize));
  params.set("offset", String((page - 1) * pageSize));
  if (status === "success" || status === "error") {
    params.append("status", `eq.${status}`);
  }
  if (typeof from === "string" && !Number.isNaN(Date.parse(from))) {
    params.append("created_at", `gte.${new Date(from).toISOString()}`);
  }
  if (typeof to === "string" && !Number.isNaN(Date.parse(to))) {
    params.append("created_at", `lte.${new Date(to).toISOString()}`);
  }

  try {
    const resp = await fetch(
      `${config.url}/rest/v1/generation_logs?${params.toString()}`,
      {
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          Prefer: "count=exact",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      // 404/42P01 = tabela ainda não criada no Supabase.
      req.log.warn(
        { status: resp.status, body: body.slice(0, 300) },
        "Falha ao listar generation_logs",
      );
      res.status(502).json({
        error: body.includes("generation_logs")
          ? "A tabela de logs ainda não existe no Supabase. Rode supabase/generation-logs.sql no SQL Editor."
          : "Não foi possível carregar os logs. Tente novamente.",
      });
      return;
    }
    const total = Number(
      (resp.headers.get("content-range") ?? "0/0").split("/")[1] ?? 0,
    );
    const rows = (await resp.json()) as LogRow[];
    const items = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        createdAt: r.created_at,
        userEmail: r.user_email,
        userName: r.user_name,
        schoolName: r.school_name,
        studentName: r.student_name,
        status: r.status,
        durationMs: r.duration_ms,
        resultThumbUrl: r.result_thumb_path
          ? await signLogFile(r.result_thumb_path)
          : null,
      })),
    );
    res.json({ items, total, page, pageSize });
  } catch (err) {
    req.log.error({ err }, "Erro ao listar logs de geração");
    res
      .status(502)
      .json({ error: "Não foi possível carregar os logs. Tente novamente." });
  }
});

router.get("/generation/logs/:id", requireLogsAdmin, async (req, res) => {
  const config = logsConfig();
  if (!config) {
    res.status(503).json({
      error:
        "Logs indisponíveis: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.",
    });
    return;
  }
  try {
    const resp = await fetch(
      `${config.url}/rest/v1/generation_logs?id=eq.${encodeURIComponent(String(req.params["id"] ?? ""))}&limit=1`,
      {
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok) {
      res
        .status(502)
        .json({ error: "Não foi possível carregar o log. Tente novamente." });
      return;
    }
    const rows = (await resp.json()) as LogRow[];
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Log não encontrado." });
      return;
    }
    const attachments = await Promise.all(
      (row.attachments ?? []).map(async (a) => ({
        role: a.role,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        thumbUrl: a.thumbPath ? await signLogFile(a.thumbPath) : null,
      })),
    );
    res.json({
      id: row.id,
      createdAt: row.created_at,
      userEmail: row.user_email,
      userName: row.user_name,
      schoolName: row.school_name,
      studentName: row.student_name,
      status: row.status,
      durationMs: row.duration_ms,
      prompt: row.prompt ?? null,
      payload: row.payload ?? null,
      attachments,
      openaiResponse: row.openai_response ?? null,
      serverStatus: row.server_status ?? null,
      serverResponse: row.server_response ?? null,
      resultThumbUrl: row.result_thumb_path
        ? await signLogFile(row.result_thumb_path)
        : null,
      resultUrl: row.result_url ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Erro ao detalhar log de geração");
    res
      .status(502)
      .json({ error: "Não foi possível carregar o log. Tente novamente." });
  }
});

// O app chama após salvar o post no Storage, para vincular a URL final ao log.
// Autenticação normal (dono da geração); só atualiza o próprio log.
router.post(
  "/generation/logs/:id/result",
  requireSupabaseUser,
  async (req, res) => {
    const imageUrl = (req.body as { imageUrl?: unknown })?.["imageUrl"];
    if (typeof imageUrl !== "string" || !/^https?:\/\//.test(imageUrl)) {
      res.status(400).json({ error: "Campo 'imageUrl' inválido." });
      return;
    }
    if (!req.supabaseUserId) {
      res.status(401).json({ error: "Você precisa estar logado." });
      return;
    }
    const ok = await attachGenerationResult(
      String(req.params["id"] ?? ""),
      req.supabaseUserId,
      imageUrl.slice(0, 2000),
    );
    res.json({ ok });
  },
);

export default router;
