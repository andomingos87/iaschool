// Geração real via backend (/api/generation/post-image → OpenAI GPT Image).
// Substitui o mock de canvas. A chave da OpenAI vive apenas no servidor.

import imageCompression from "browser-image-compression";
import type { ImageGenerationService } from "./contract";
import type { GenerationPayloadImage } from "./types";
import { buildGenerationPrompt } from "../prompt-template";

// Espelham o payload montado pelo servidor (api-server/routes/generation.ts).
const GENERATION_MODEL = "gpt-image-2";
const GENERATION_SIZE = "1024x1024";

// Acima disso, redimensiona/comprime antes de enviar (payload menor = mais rápido
// e bem abaixo dos limites do servidor).
const COMPRESS_THRESHOLD_BYTES = 1 * 1024 * 1024;
const COMPRESS_OPTIONS = {
  maxWidthOrHeight: 1600,
  maxSizeMB: 0.8,
  useWebWorker: true,
};

async function toUploadFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar imagem para envio");
  let blob: Blob = await res.blob();
  if (blob.size > COMPRESS_THRESHOLD_BYTES && blob.type.startsWith("image/")) {
    try {
      const file = new File([blob], name, { type: blob.type });
      blob = await imageCompression(file, COMPRESS_OPTIONS);
    } catch {
      // se a compressão falhar, envia o original (servidor ainda valida limites)
    }
  }
  return new File([blob], name, { type: blob.type || "image/png" });
}

/**
 * POST multipart via XMLHttpRequest para acompanhar o progresso REAL do
 * upload (fetch não expõe progresso de envio de forma ampla nos navegadores).
 * Resolve com status + corpo JSON (ou null se não for JSON).
 */
function uploadWithProgress(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  timeoutMs: number,
  onUploadProgress?: (percent: number) => void,
): Promise<{ status: number; body: { imageUrl?: string; error?: string } | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = () => onUploadProgress?.(100);
    xhr.onload = () => {
      let body: { imageUrl?: string; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as {
          imageUrl?: string;
          error?: string;
        };
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.ontimeout = () =>
      reject(new Error("A geração demorou demais. Tente novamente."));
    xhr.onerror = () =>
      reject(new Error("Falha de conexão ao enviar as fotos. Verifique sua internet e tente novamente."));
    xhr.send(formData);
  });
}

export function createOpenAIGenerationService(
  getAccessToken?: () => Promise<string | null>,
  /** Carrega o template salvo pelo admin; null/erro → padrão embutido. */
  getTemplate?: () => Promise<string | null>,
): ImageGenerationService {
  return {
    async generate(request, onUploadProgress) {
      const files: File[] = [];
      // Metadados de cada imagem enviada (papel/nome/tamanho) — nunca bytes.
      const imagesMeta: GenerationPayloadImage[] = [];
      const pushFile = (file: File, role: string) => {
        files.push(file);
        imagesMeta.push({ role, fileName: file.name, sizeBytes: file.size });
      };

      // Ordem importa: a referência é sempre a primeira imagem.
      pushFile(
        await toUploadFile(request.reference.image.url, "referencia.png"),
        "Referência",
      );
      pushFile(
        await toUploadFile(request.studentPhoto.url, "foto-aluno.png"),
        "Foto do aluno",
      );
      if (request.showClubLogo && request.club?.logo) {
        pushFile(
          await toUploadFile(request.club.logo.url, "brasao-clube.png"),
          "Escudo do clube",
        );
      }
      if (request.uniform) {
        pushFile(
          await toUploadFile(request.uniform.url, "uniforme.png"),
          "Uniforme",
        );
      }
      if (request.includeR9Logo) {
        try {
          pushFile(
            await toUploadFile(
              `${import.meta.env.BASE_URL}iasport-logo-color.png`,
              "logo-iasport.png",
            ),
            "Logo R9",
          );
        } catch {
          // sem o arquivo do logo, o prompt ainda pede o selo em texto
        }
      }

      // Sem Content-Type manual: o navegador define o boundary do multipart.
      const headers: Record<string, string> = {};
      if (getAccessToken) {
        const token = await getAccessToken();
        if (!token) {
          throw new Error("Sua sessão expirou. Entre novamente para gerar posts.");
        }
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Template salvo pelo admin; se falhar ao carregar, usa o padrão.
      let template: string | null = null;
      if (getTemplate) {
        try {
          template = await getTemplate();
        } catch {
          template = null;
        }
      }

      const prompt = buildGenerationPrompt(request, template);
      const formData = new FormData();
      formData.append("prompt", prompt);
      for (const file of files) {
        formData.append("images", file, file.name);
      }

      // XHR (em vez de fetch) para expor o progresso real do upload.
      // Timeout total continua evitando loader infinito se a geração travar.
      const { status, body } = await uploadWithProgress(
        "/api/generation/post-image",
        formData,
        headers,
        180_000,
        onUploadProgress,
      );

      if (status < 200 || status >= 300 || !body?.imageUrl) {
        if (status === 413) {
          throw new Error(
            "As imagens enviadas são grandes demais. Use imagens menores (ou re-envie as fotos) e tente novamente.",
          );
        }
        throw new Error(
          body?.error ?? `Falha na geração (HTTP ${status}). Tente novamente.`,
        );
      }

      return {
        imageUrl: body.imageUrl,
        details: {
          prompt,
          model: GENERATION_MODEL,
          size: GENERATION_SIZE,
          images: imagesMeta,
        },
      };
    },
  };
}
