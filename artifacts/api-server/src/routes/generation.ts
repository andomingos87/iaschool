import { Router, type IRouter } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { requireSupabaseUser } from "../middlewares/supabase-auth";
import { consumeDailyQuota } from "../lib/generation-quota";

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
  try {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      res.status(503).json({
        error:
          "OPENAI_API_KEY não configurada no servidor. Configure o secret para gerar imagens.",
      });
      return;
    }

    const prompt = (req.body as { prompt?: unknown })?.["prompt"];
    const files = (req.files ?? []) as Express.Multer.File[];

    // Rajada: por usuário autenticado; sem usuário (modo dev), por IP.
    const burstKey = req.supabaseUserId
      ? `burst:user:${req.supabaseUserId}`
      : `burst:ip:${req.ip ?? "unknown"}`;
    if (consumeBucket(burstKey, RATE_WINDOW_MS, RATE_MAX_REQUESTS)) {
      res.status(429).json({
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
        res.status(429).json({
          error: `Você atingiu a cota diária de ${DAILY_MAX_REQUESTS} gerações. Tente novamente amanhã.`,
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
          res.status(429).json({
            error: `Você atingiu a cota diária de ${DAILY_MAX_REQUESTS} gerações. Tente novamente amanhã.`,
          });
          return;
        }
      }
    }

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Campo 'prompt' é obrigatório." });
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      res.status(400).json({ error: "Prompt longo demais." });
      return;
    }
    if (files.length === 0) {
      res.status(400).json({
        error: "Envie ao menos uma imagem (referência e foto do aluno).",
      });
      return;
    }
    if (files.length > MAX_IMAGES) {
      res
        .status(400)
        .json({ error: `No máximo ${MAX_IMAGES} imagens por geração.` });
      return;
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      res
        .status(400)
        .json({ error: "Imagens grandes demais no total (máx. 24 MB)." });
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
    if (!b64) {
      res
        .status(502)
        .json({ error: "A OpenAI não retornou imagem. Tente novamente." });
      return;
    }

    res.json({ imageUrl: `data:image/png;base64,${b64}` });
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
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: message,
    });
  }
});

export default router;
