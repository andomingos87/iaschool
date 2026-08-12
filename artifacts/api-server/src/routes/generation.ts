import express, { Router, type IRouter } from "express";
import OpenAI, { toFile } from "openai";
import { requireSupabaseUser } from "../middlewares/supabase-auth";

// Geração da arte de post (R9 Escolinhas) com a OpenAI GPT Image.
// A chave OPENAI_API_KEY fica somente no backend — nunca no navegador.

const router: IRouter = Router();

const MAX_IMAGES = 6;
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // por imagem, decodificada
const MAX_TOTAL_BYTES = 24 * 1024 * 1024; // total decodificado
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Rate limit simples em memória por IP (geração é cara: paga por chamada).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 10;
const rateBuckets = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (hits.length >= RATE_MAX_REQUESTS) {
    rateBuckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(ip, hits);
  return false;
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Imagem inválida (esperado data URL base64)");
  const mime = match[1]!;
  if (!ALLOWED_MIMES.has(mime)) {
    throw new Error(`Tipo de imagem não suportado: ${mime}. Use PNG, JPEG ou WebP.`);
  }
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Imagem muito grande (máx. 8 MB por imagem).");
  }
  return { buffer, mime };
}

// Limite de corpo específico desta rota (imagens em base64).
router.post(
  "/generation/post-image",
  express.json({ limit: "40mb" }),
  requireSupabaseUser,
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

    const { prompt, images } = req.body as {
      prompt?: string;
      images?: Array<{ dataUrl: string; name: string }>;
    };

    if (isRateLimited(req.ip ?? "unknown")) {
      res.status(429).json({
        error: "Muitas gerações em pouco tempo. Aguarde alguns minutos e tente de novo.",
      });
      return;
    }

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Campo 'prompt' é obrigatório." });
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      res.status(400).json({ error: "Prompt longo demais." });
      return;
    }
    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({
        error: "Envie ao menos uma imagem (referência e foto do aluno).",
      });
      return;
    }
    if (images.length > MAX_IMAGES) {
      res
        .status(400)
        .json({ error: `No máximo ${MAX_IMAGES} imagens por geração.` });
      return;
    }

    const openai = new OpenAI({ apiKey });

    let totalBytes = 0;
    const files = await Promise.all(
      images.map(async (img, i) => {
        const { buffer, mime } = dataUrlToBuffer(img.dataUrl);
        totalBytes += buffer.length;
        const ext = mime.split("/")[1] ?? "png";
        return toFile(buffer, img.name || `imagem-${i + 1}.${ext}`, {
          type: mime,
        });
      }),
    );
    if (totalBytes > MAX_TOTAL_BYTES) {
      res
        .status(400)
        .json({ error: "Imagens grandes demais no total (máx. 24 MB)." });
      return;
    }

    const result = await openai.images.edit({
      model: "gpt-image-2",
      image: files,
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
