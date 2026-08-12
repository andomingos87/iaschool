// Geração real via backend (/api/generation/post-image → OpenAI GPT Image).
// Substitui o mock de canvas. A chave da OpenAI vive apenas no servidor.

import type { ImageGenerationService } from "./contract";
import type { GenerationRequest } from "./types";

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

function buildPrompt(request: GenerationRequest): string {
  const parts: string[] = [];
  parts.push(
    "Crie uma arte de post de Instagram (1080x1080) para uma escolinha de futebol, seguindo fielmente o estilo, composição, tipografia e clima da PRIMEIRA imagem enviada (a referência).",
    `Use a foto do aluno enviada como imagem principal do post. Nome do aluno: ${request.student.name.toUpperCase()}.`,
  );
  if (request.student.position) {
    parts.push(`Posição do aluno: ${request.student.position}.`);
  }
  if (request.metrics.length > 0) {
    const metricas = request.metrics
      .map((m) => `${m.name}: ${m.value}`)
      .join(", ");
    parts.push(
      `Exiba com destaque estas estatísticas do aluno, com números grandes e legíveis: ${metricas}.`,
    );
  }
  if (request.showClubLogo && request.club) {
    parts.push(
      `Inclua o brasão do clube ${request.club.name} (imagem enviada) em posição de destaque discreto.`,
    );
    if (request.club.colors?.length) {
      parts.push(
        `Use as cores oficiais do clube na composição: ${request.club.colors.join(", ")}.`,
      );
    }
  }
  if (request.uniform) {
    parts.push(
      "Uma das imagens enviadas mostra o uniforme do clube — use-o como referência de vestuário/cores.",
    );
  }
  if (request.includeR9Logo) {
    parts.push(
      "Inclua a marca 'R9 ESCOLINHAS' de forma discreta (selo/rodapé), usando o logotipo IAsport enviado como referência de marca.",
    );
  }
  parts.push(
    "Texto em português do Brasil, sem erros de ortografia. Resultado profissional, pronto para publicação.",
  );
  return parts.join(" ");
}

export function createOpenAIGenerationService(): ImageGenerationService {
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

      const res = await fetch("/api/generation/post-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt(request), images }),
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
