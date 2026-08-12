// Geração real via backend (/api/generation/post-image → OpenAI GPT Image).
// Substitui o mock de canvas. A chave da OpenAI vive apenas no servidor.

import type { ImageGenerationService } from "./contract";
import { buildGenerationPrompt } from "../prompt-template";

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar imagem para envio");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(blob);
  });
}

export function createOpenAIGenerationService(
  getAccessToken?: () => Promise<string | null>,
  /** Carrega o template salvo pelo admin; null/erro → padrão embutido. */
  getTemplate?: () => Promise<string | null>,
): ImageGenerationService {
  return {
    async generate(request) {
      const images: Array<{ dataUrl: string; name: string }> = [];

      // Ordem importa: a referência é sempre a primeira imagem.
      images.push({
        dataUrl: await toDataUrl(request.reference.image.url),
        name: "referencia.png",
      });
      images.push({
        dataUrl: await toDataUrl(request.studentPhoto.url),
        name: "foto-aluno.png",
      });
      if (request.showClubLogo && request.club?.logo) {
        images.push({
          dataUrl: await toDataUrl(request.club.logo.url),
          name: "brasao-clube.png",
        });
      }
      if (request.uniform) {
        images.push({
          dataUrl: await toDataUrl(request.uniform.url),
          name: "uniforme.png",
        });
      }
      if (request.includeR9Logo) {
        try {
          images.push({
            dataUrl: await toDataUrl(
              `${import.meta.env.BASE_URL}iasport-logo-color.png`,
            ),
            name: "logo-iasport.png",
          });
        } catch {
          // sem o arquivo do logo, o prompt ainda pede o selo em texto
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
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

      const res = await fetch("/api/generation/post-image", {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: buildGenerationPrompt(request, template),
          images,
        }),
        // Evita loader infinito se a geração travar.
        signal: AbortSignal.timeout(180_000),
      }).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          throw new Error("A geração demorou demais. Tente novamente.");
        }
        throw err;
      });

      const body = (await res.json().catch(() => null)) as
        | { imageUrl?: string; error?: string }
        | null;

      if (!res.ok || !body?.imageUrl) {
        throw new Error(
          body?.error ?? `Falha na geração (HTTP ${res.status}). Tente novamente.`,
        );
      }

      return { imageUrl: body.imageUrl };
    },
  };
}
