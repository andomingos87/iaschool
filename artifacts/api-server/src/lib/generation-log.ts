// Log de auditoria das gerações de imagem (tela /admin/logs do app R9).
//
// Cada tentativa de geração grava uma linha em public.generation_logs no
// Supabase (via service_role) com prompt, payload, anexos (com miniaturas no
// Storage), resposta da OpenAI e resposta do servidor. A gravação é
// best-effort: roda depois de responder ao cliente e NUNCA propaga erro —
// falha de log não pode quebrar nem atrasar a geração.

import { randomUUID } from "node:crypto";
import { logger } from "./logger";

export const LOGS_BUCKET = "generation-logs";
const THUMB_SIZE = 256;
const REQUEST_TIMEOUT_MS = 15_000;

export interface LogAttachment {
  role: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** bytes originais — usados só para gerar a miniatura, nunca gravados */
  buffer?: Buffer;
  /** preenchido após o upload da miniatura */
  thumbPath?: string;
}

export interface GenerationLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  schoolName: string | null;
  studentName: string | null;
  status: "success" | "error";
  durationMs: number;
  prompt: string | null;
  payload: Record<string, unknown> | null;
  attachments: LogAttachment[];
  openaiResponse: Record<string, unknown> | null;
  serverStatus: number;
  serverResponse: Record<string, unknown> | null;
  /** imagem gerada (base64 sem prefixo) — vira miniatura no Storage */
  resultB64?: string | null;
}

export function newLogId(): string {
  return randomUUID();
}

export function logsConfig(): { url: string; serviceKey: string } | null {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

/** Miniatura webp (lado máx. 256px). Retorna null se o sharp falhar. */
async function makeThumbnail(input: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(input)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
  } catch (err) {
    logger.warn({ err }, "generation-log: falha ao gerar miniatura");
    return null;
  }
}

async function uploadThumb(
  config: { url: string; serviceKey: string },
  path: string,
  bytes: Buffer,
): Promise<boolean> {
  const resp = await fetch(
    `${config.url}/storage/v1/object/${LOGS_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "image/webp",
        "x-upsert": "true",
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    logger.warn(
      { status: resp.status, body: body.slice(0, 200), path },
      "generation-log: upload de miniatura falhou",
    );
  }
  return resp.ok;
}

/** URL assinada (1h) para um arquivo do bucket de logs; null se falhar. */
export async function signLogFile(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const config = logsConfig();
  if (!config) return null;
  try {
    const resp = await fetch(
      `${config.url}/storage/v1/object/sign/${LOGS_BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!resp.ok) return null;
    const body = (await resp.json()) as { signedURL?: string };
    if (!body.signedURL) return null;
    return `${config.url}/storage/v1${body.signedURL}`;
  } catch {
    return null;
  }
}

/**
 * Grava o log no Supabase. Chame com `void writeGenerationLog(...)` DEPOIS de
 * responder ao cliente — nunca lança e não bloqueia a resposta.
 */
export async function writeGenerationLog(
  entry: GenerationLogEntry,
): Promise<void> {
  try {
    const config = logsConfig();
    if (!config) return; // sem Supabase configurado, não há onde gravar

    // Enriquecimento: e-mail/nome/escola do usuário via profiles (best-effort).
    if (entry.userId && !entry.userEmail) {
      try {
        const resp = await fetch(
          `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(entry.userId)}&select=email,name,school_name&limit=1`,
          {
            headers: {
              apikey: config.serviceKey,
              Authorization: `Bearer ${config.serviceKey}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );
        if (resp.ok) {
          const rows = (await resp.json()) as Array<{
            email?: string;
            name?: string;
            school_name?: string | null;
          }>;
          const p = rows[0];
          if (p) {
            entry.userEmail = p.email ?? null;
            entry.userName = p.name ?? null;
            entry.schoolName = p.school_name ?? null;
          }
        }
      } catch {
        // sem perfil no log — segue com o user_id
      }
    }

    // Miniaturas dos anexos (best-effort, em paralelo).
    await Promise.all(
      entry.attachments.map(async (att, i) => {
        if (!att.buffer) return;
        const thumb = await makeThumbnail(att.buffer);
        if (!thumb) return;
        const path = `attachments/${entry.id}/${i + 1}.webp`;
        if (await uploadThumb(config, path, thumb)) att.thumbPath = path;
      }),
    );

    // Miniatura do resultado gerado.
    let resultThumbPath: string | null = null;
    if (entry.resultB64) {
      const thumb = await makeThumbnail(Buffer.from(entry.resultB64, "base64"));
      if (thumb) {
        const path = `results/${entry.id}.webp`;
        if (await uploadThumb(config, path, thumb)) resultThumbPath = path;
      }
    }

    const row = {
      id: entry.id,
      user_id: entry.userId,
      user_email: entry.userEmail,
      user_name: entry.userName,
      school_name: entry.schoolName,
      student_name: entry.studentName,
      status: entry.status,
      duration_ms: Math.round(entry.durationMs),
      prompt: entry.prompt,
      payload: entry.payload,
      attachments: entry.attachments.map((a) => ({
        role: a.role,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        thumbPath: a.thumbPath ?? null,
      })),
      openai_response: entry.openaiResponse,
      server_status: entry.serverStatus,
      server_response: entry.serverResponse,
      result_thumb_path: resultThumbPath,
    };

    const resp = await fetch(`${config.url}/rest/v1/generation_logs`, {
      method: "POST",
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, body: body.slice(0, 300) },
        "generation-log: insert em generation_logs falhou",
      );
    }
  } catch (err) {
    logger.warn({ err }, "generation-log: falha inesperada ao gravar log");
  }
}

/**
 * Vincula a URL do resultado final (post salvo no Storage pelo app) ao log.
 * Só atualiza se o log pertencer ao usuário informado. Best-effort.
 */
export async function attachGenerationResult(
  logId: string,
  userId: string,
  resultUrl: string,
): Promise<boolean> {
  try {
    const config = logsConfig();
    if (!config) return false;
    const resp = await fetch(
      `${config.url}/rest/v1/generation_logs?id=eq.${encodeURIComponent(logId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ result_url: resultUrl }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}
