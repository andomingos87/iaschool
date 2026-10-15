import { Router, type IRouter } from "express";
import multer from "multer";
import sharp from "sharp";
import { OpenAI, toFile } from "openai";
import { requireSupabaseUser } from "../middlewares/supabase-auth";
import { consumeDailyQuota, getDailyQuotaUsage } from "../lib/generation-quota";
import {
  newLogId,
  writeGenerationLog,
  type GenerationLogEntry,
  type LogAttachment,
} from "../lib/generation-log";
import { ensureProtectionRule, personEditConflict, photoPromptInstructions } from "../lib/art-protection";
import { createHash } from "node:crypto";
import { backgroundPrompt, prepareOriginal, composeOriginal, COMPOSITION_VERSION } from "../lib/original-composition";

// Geração da arte de post escolar (IAschool) com a OpenAI GPT Image.
// A chave OPENAI_API_KEY fica somente no backend — nunca no navegador.

const router: IRouter = Router();

// Id da API. Não existe modelo chamado "gpt-image-2.5": a família 2.5
// publica flare (uso geral) e sunburst (edição mais precisa, mais lenta).
const IMAGE_MODEL = "gpt-image-2.5-flare";
const IMAGE_SIZE = "1024x1024";

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
  const simpleMode = req.body?.mode === "photo_prompt";

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
  const attachments: LogAttachment[] = files.map((f, i) => ({
    role: simpleMode ? "Foto de referência" : i === 0 ? "Modelo de estilo" : "Original para composição",
    fileName: `imagem-${i + 1}`,
    mimeType: f.mimetype,
    sizeBytes: f.size,
    // No photo bytes or original names in audit metadata.
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
      studentName: null,
      status: status >= 200 && status < 300 ? "success" : "error",
      durationMs: Date.now() - startedAt,
      prompt: null,
      payload: {
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        imageCount: files.length,
        totalImageBytes: files.reduce((sum, f) => sum + f.size, 0),
        compositionVersion: simpleMode ? null : COMPOSITION_VERSION,
        protectionVersion: simpleMode ? "photo-prompt-identity-v1" : "original-no-model-v1",
        templateSource: clientMeta?.["templateSource"] === "saved" ? "saved" : "fallback",
        templateHash: typeof clientMeta?.["template"] === "string" ? createHash("sha256").update(clientMeta["template"]).digest("hex") : null,
        promptHash: typeof rawPrompt === "string" ? createHash("sha256").update(rawPrompt).digest("hex") : null,
      },
      attachments,
      openaiResponse,
      serverStatus: status,
      serverResponse: body,
      resultB64: null,
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

    if (typeof rawPrompt !== "string" || !rawPrompt.trim()) {
      respond(400, { error: "Campo 'prompt' é obrigatório." });
      return;
    }
    // Regra fixa de preservação da pessoa (ART-05): aplicada aqui, e não só na
    // tela, para valer também em chamadas diretas ao endpoint.
    if (!simpleMode && personEditConflict(rawPrompt)) {
      respond(400, { error: "As instruções pedem mudar a pessoa original. Remova pedidos de trocar roupa, corpo, expressão ou aparência; os ajustes podem alterar somente os elementos da arte." });
      return;
    }
    const normalizedPrompt = rawPrompt.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/g, IMAGE_SIZE);
    const prompt = simpleMode ? photoPromptInstructions(normalizedPrompt) : ensureProtectionRule(normalizedPrompt);
    if (prompt.length > MAX_PROMPT_CHARS) {
      respond(400, { error: "Prompt longo demais." });
      return;
    }
    if (files.length !== (simpleMode ? 1 : 2)) {
      respond(400, {
        error: simpleMode ? "Envie uma foto de referência." : "Envie exatamente o modelo de arte e a foto original do aluno.",
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

    let composition: unknown;
    let originalCut: Buffer | undefined;
    let referencePhoto: Buffer | undefined;
    try {
      if (simpleMode) {
        const input = sharp(files[0]!.buffer, { limitInputPixels: 40_000_000, failOn: "warning" });
        const metadata = await input.metadata();
        if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("invalid photo");
        // Decodifica antes de consumir cota; metadata() sozinho só lê cabeçalhos.
        // Mesma foto sem recorte: corrige orientação e não exporta EXIF/GPS à IA.
        referencePhoto = await input.autoOrient().png().toBuffer();
        if (referencePhoto.length > MAX_IMAGE_BYTES) {
          respond(400, { error: "A foto normalizada ultrapassa 8 MB. Envie uma foto menor. Nenhuma geração foi consumida." });
          return;
        }
      } else {
        composition = JSON.parse(String(req.body.composition ?? "null"));
        originalCut = await prepareOriginal(files[1]!.buffer, composition);
      }
    } catch {
      respond(400, { error: simpleMode ? "Não foi possível ler a foto. Envie outra imagem em PNG, JPEG ou WebP. Nenhuma geração foi consumida." : "Recorte não conferido ou região da cabeça/pescoço cortada. Ajuste o contorno, confirme a prévia ou escolha outra foto. Nenhuma geração foi consumida." });
      return;
    }
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

    const openai = new OpenAI({ apiKey, maxRetries: 0, timeout: 150_000 });

    const openaiFiles = await Promise.all(
      files.slice(0, 1).map((f, i) => {
        const ext = simpleMode ? "png" : f.mimetype.split("/")[1] ?? "png";
        return toFile(simpleMode ? referencePhoto! : f.buffer, `${simpleMode ? "foto-referencia" : "modelo-estilo"}.${ext}`, {
          type: simpleMode ? "image/png" : f.mimetype,
        });
      }),
    );

    const result = await openai.images.edit({
      model: IMAGE_MODEL,
      image: openaiFiles,
      prompt: simpleMode ? prompt : backgroundPrompt(prompt),
      size: IMAGE_SIZE,
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

    const generated = Buffer.from(b64, "base64");
    const composed = simpleMode
      ? await sharp(generated, { limitInputPixels: 40_000_000 }).png().toBuffer()
      : await composeOriginal(generated, originalCut!);
    resultB64 = composed.toString("base64");
    // O corpo real leva a imagem; o log guarda só um resumo (ver respond()).
    res.json({ imageUrl: `data:image/png;base64,${resultB64}`, logId });
    const entry: GenerationLogEntry = {
      id: logId,
      userId: req.supabaseUserId ?? null,
      userEmail: null,
      userName: null,
      schoolName: null,
      studentName: null,
      status: "success",
      durationMs: Date.now() - startedAt,
      prompt: null,
      payload: {
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        imageCount: files.length,
        totalImageBytes: totalBytes,
        compositionVersion: simpleMode ? null : COMPOSITION_VERSION,
        protectionVersion: simpleMode ? "photo-prompt-identity-v1" : "original-no-model-v1",
        templateSource: clientMeta?.["templateSource"] === "saved" ? "saved" : "fallback",
        templateHash: typeof clientMeta?.["template"] === "string" ? createHash("sha256").update(clientMeta["template"]).digest("hex") : null,
        promptHash: typeof rawPrompt === "string" ? createHash("sha256").update(rawPrompt).digest("hex") : null,
      },
      attachments,
      openaiResponse,
      serverStatus: 200,
      serverResponse: {
        imageUrl: `data:image/png;base64,<${composed.length} bytes>`,
        logId,
      },
      resultB64: null,
    };
    void writeGenerationLog(entry);
  } catch (err) {
    req.log.error({ errorType: err instanceof Error ? err.name : "unknown" }, "Falha na geração de imagem");
    const message =
      err instanceof OpenAI.APIError
        ? "O serviço de imagem não concluiu a geração. Confira as instruções ou tente novamente."
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
