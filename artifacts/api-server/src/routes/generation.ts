import { Router, type IRouter } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { requireSupabaseUser } from "../middlewares/supabase-auth";
import { consumeDailyQuota, getDailyQuotaUsage } from "../lib/generation-quota";
import {
  newLogId,
  writeGenerationLog,
  type GenerationLogEntry,
  type LogAttachment,
} from "../lib/generation-log";

// Geração da arte de post (R9 Escolinhas) com a OpenAI GPT Image.
// A chave OPENAI_API_KEY fica somente no backend — nunca no navegador.

const router: IRouter = Router();

const MAX_IMAGES = 6;
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // por imagem, decodificada
const MAX_TOTAL_BYTES = 24 * 1024 * 1024; // total decodificado
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Limites (geração é cara: paga por chamada).
// - Rajada: por usuário autenticado (fallback: IP) numa janela curta,
//   contada em memória (janela curta — perder no restart é aceitável).
// - Cota diária: por usuário autenticado, persistida no Supabase
//   (lib/generation-quota.ts) para resistir a reinícios e valer entre
//   instâncias; cai no contador em memória só se o banco não estiver
//   disponível/configurado.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 10;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_MAX_REQUESTS = Number(
  process.env["GENERATION_DAILY_QUOTA"] ?? 50,
);
const rateBuckets = new Map<string, number[]>();

function consumeBucket(
  key: string,
  windowMs: number,
  maxRequests: number,
): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= maxRequests) {
    rateBuckets.set(key, hits);
    return true; // limite atingido
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}

// Upload multipart (FormData): as imagens chegam como arquivos binários,
// sem inflar ~33% como base64. O multer valida tamanho/quantidade por arquivo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_IMAGES,
    fileSize: MAX_IMAGE_BYTES,
    fieldSize: 64 * 1024, // campos de texto (prompt)
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(
        new Error(
          `Tipo de imagem não suportado: ${file.mimetype}. Use PNG, JPEG ou WebP.`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

router.post(
  "/generation/post-image",
  requireSupabaseUser,
  (req, res, next) => {
    upload.array("images", MAX_IMAGES)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        const messages: Record<string, string> = {
          LIMIT_FILE_SIZE: "Imagem muito grande (máx. 8 MB por imagem).",
          LIMIT_FILE_COUNT: `No máximo ${MAX_IMAGES} imagens por geração.`,
          LIMIT_UNEXPECTED_FILE: `No máximo ${MAX_IMAGES} imagens por geração.`,
        };
        res.status(400).json({
          error:
            messages[err.code] ?? "Falha ao receber as imagens. Tente novamente.",
        });
        return;
      }
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Falha ao receber as imagens. Tente novamente.",
      });
    });
  },
  async (req, res) => {
  // ---- Log de auditoria (best-effort, tela /admin/logs) ----
  const startedAt = Date.now();
  const logId = newLogId();
  const rawPrompt = (req.body as { prompt?: unknown })?.["prompt"];
  const files = (req.files ?? []) as Express.Multer.File[];

  // Metadados opcionais enviados pelo app (aluno, flags, métricas...).
  let clientMeta: Record<string, unknown> | null = null;
  const rawMeta = (req.body as { meta?: unknown })?.["meta"];
  if (typeof rawMeta === "string" && rawMeta.length <= 32_000) {
    try {
      const parsed: unknown = JSON.parse(rawMeta);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        clientMeta = parsed as Record<string, unknown>;
      }
    } catch {
      // meta inválido é ignorado — não impede a geração
    }
  }
  const metaImages = Array.isArray(clientMeta?.["images"])
    ? (clientMeta["images"] as Array<{ role?: unknown }>)
    : [];
  const attachments: LogAttachment[] = files.map((f, i) => ({
    role:
      typeof metaImages[i]?.role === "string"
        ? (metaImages[i]!.role as string)
        : `Imagem ${i + 1}`,
    fileName: f.originalname || `imagem-${i + 1}`,
    mimeType: f.mimetype,
    sizeBytes: f.size,
    buffer: f.buffer,
  }));

  let openaiResponse: Record<string, unknown> | null = null;
  let resultB64: string | null = null;

  /** Responde ao cliente e agenda a gravação do log (nunca bloqueia). */
  function respond(status: number, body: Record<string, unknown>): void {
    res.status(status).json(body);
    const entry: GenerationLogEntry = {
      id: logId,
      userId: req.supabaseUserId ?? null,
      userEmail: null, // resolvido pelo perfil na gravação
      userName: null,
      schoolName: null,
      studentName:
        typeof clientMeta?.["studentName"] === "string"
          ? (clientMeta["studentName"] as string)
          : null,
      status: status >= 200 && status < 300 ? "success" : "error",
      durationMs: Date.now() - startedAt,
      prompt: typeof rawPrompt === "string" ? rawPrompt : null,
      payload: {
        model: "gpt-image-2",
        size: "1024x1024",
        imageCount: files.length,
        totalImageBytes: files.reduce((sum, f) => sum + f.size, 0),
        ...(clientMeta ? { client: clientMeta } : {}),
      },
      attachments,
      openaiResponse,
      serverStatus: status,
      serverResponse: body,
      resultB64,
    };
    void writeGenerationLog(entry);
  }

  try {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      respond(503, {
        error:
          "OPENAI_API_KEY não configurada no servidor. Configure o secret para gerar imagens.",
      });
      return;
    }

    const prompt = rawPrompt;

    // Rajada: por usuário autenticado; sem usuário (modo dev), por IP.
    const burstKey = req.supabaseUserId
      ? `burst:user:${req.supabaseUserId}`
      : `burst:ip:${req.ip ?? "unknown"}`;
    if (consumeBucket(burstKey, RATE_WINDOW_MS, RATE_MAX_REQUESTS)) {
      respond(429, {
        error: "Muitas gerações em pouco tempo. Aguarde alguns minutos e tente de novo.",
      });
      return;
    }

    // Cota diária por usuário autenticado (persistida no banco).
    if (req.supabaseUserId) {
      const quota = await consumeDailyQuota(
        req.supabaseUserId,
        DAILY_MAX_REQUESTS,
      );
      if (quota.kind === "exceeded") {
        respond(429, {
          error: `Você atingiu a cota diária de ${DAILY_MAX_REQUESTS} gerações. Tente novamente amanhã.`,
        });
        return;
      }
      if (quota.kind === "outage") {
        // Banco de cota falhando repetidamente: negar (fail-closed) em vez
        // de confiar no contador em memória, que zera a cada reinício e
        // deixaria o custo com a OpenAI sem proteção.
        req.log.error(
          { reason: quota.reason, failures: quota.failures },
          "Cota diária persistida fora do ar — gerações bloqueadas (fail-closed)",
        );
        respond(503, {
          error:
            "O controle de cota de gerações está temporariamente indisponível. Para evitar gerações sem controle, novas gerações estão bloqueadas. Tente novamente em alguns minutos.",
        });
        return;
      }
      if (quota.kind === "unavailable") {
        // Fallback: contador em memória (comportamento antigo), para não
        // negar o serviço quando o banco não estiver acessível.
        req.log.warn(
          { reason: quota.reason },
          "Cota diária persistida indisponível — usando contador em memória",
        );
        if (
          consumeBucket(
            `daily:user:${req.supabaseUserId}`,
            DAILY_WINDOW_MS,
            DAILY_MAX_REQUESTS,
          )
        ) {
          respond(429, {
            error: `Você atingiu a cota diária de ${DAILY_MAX_REQUESTS} gerações. Tente novamente amanhã.`,
          });
          return;
        }
      }
    }

    if (!prompt || typeof prompt !== "string") {
      respond(400, { error: "Campo 'prompt' é obrigatório." });
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      respond(400, { error: "Prompt longo demais." });
      return;
    }
    if (files.length === 0) {
      respond(400, {
        error: "Envie ao menos uma imagem (referência e foto do aluno).",
      });
      return;
    }
    if (files.length > MAX_IMAGES) {
      respond(400, { error: `No máximo ${MAX_IMAGES} imagens por geração.` });
      return;
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      respond(400, { error: "Imagens grandes demais no total (máx. 24 MB)." });
      return;
    }

    const openai = new OpenAI({ apiKey });

    const openaiFiles = await Promise.all(
      files.map((f, i) => {
        const ext = f.mimetype.split("/")[1] ?? "png";
        return toFile(f.buffer, f.originalname || `imagem-${i + 1}.${ext}`, {
          type: f.mimetype,
        });
      }),
    );

    const result = await openai.images.edit({
      model: "gpt-image-2",
      image: openaiFiles,
      prompt,
      size: "1024x1024",
      // gpt-image sempre responde em base64
    });

    const b64 = result.data?.[0]?.b64_json;
    // Metadados da resposta da OpenAI — nunca o base64 (gigante).
    openaiResponse = {
      created: result.created ?? null,
      usage: (result as { usage?: unknown }).usage ?? null,
      imageReturned: Boolean(b64),
      imageBytes: b64 ? Math.floor((b64.length * 3) / 4) : 0,
    };
    if (!b64) {
      respond(502, { error: "A OpenAI não retornou imagem. Tente novamente." });
      return;
    }

    resultB64 = b64;
    // O corpo real leva a imagem; o log guarda só um resumo (ver respond()).
    res.json({ imageUrl: `data:image/png;base64,${b64}`, logId });
    const entry: GenerationLogEntry = {
      id: logId,
      userId: req.supabaseUserId ?? null,
      userEmail: null,
      userName: null,
      schoolName: null,
      studentName:
        typeof clientMeta?.["studentName"] === "string"
          ? (clientMeta["studentName"] as string)
          : null,
      status: "success",
      durationMs: Date.now() - startedAt,
      prompt,
      payload: {
        model: "gpt-image-2",
        size: "1024x1024",
        imageCount: files.length,
        totalImageBytes: totalBytes,
        ...(clientMeta ? { client: clientMeta } : {}),
      },
      attachments,
      openaiResponse,
      serverStatus: 200,
      serverResponse: {
        imageUrl: `data:image/png;base64,<${Math.floor((b64.length * 3) / 4)} bytes>`,
        logId,
      },
      resultB64,
    };
    void writeGenerationLog(entry);
  } catch (err) {
    req.log.error({ err }, "Falha na geração de imagem");
    const message =
      err instanceof OpenAI.APIError
        ? `OpenAI: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Erro inesperado na geração.";
    const status =
      err instanceof OpenAI.APIError && err.status ? err.status : 500;
    if (err instanceof OpenAI.APIError) {
      openaiResponse = {
        status: err.status ?? null,
        code: (err as { code?: unknown }).code ?? null,
        type: (err as { type?: unknown }).type ?? null,
        message: err.message,
      };
    }
    respond(status >= 400 && status < 600 ? status : 500, {
      error: message,
    });
  }
});

// Saldo da cota diária do usuário autenticado (sem consumir).
router.get("/generation/quota", requireSupabaseUser, async (req, res) => {
  if (!req.supabaseUserId) {
    res.json({ available: false, limit: DAILY_MAX_REQUESTS });
    return;
  }
  const status = await getDailyQuotaUsage(req.supabaseUserId);
  if (status.kind !== "ok") {
    req.log.warn(
      { reason: status.reason },
      "Saldo da cota diária indisponível",
    );
    res.json({ available: false, limit: DAILY_MAX_REQUESTS });
    return;
  }
  const used = Math.min(status.used, DAILY_MAX_REQUESTS);
  res.json({
    available: true,
    limit: DAILY_MAX_REQUESTS,
    used,
    remaining: DAILY_MAX_REQUESTS - used,
  });
});

export default router;
