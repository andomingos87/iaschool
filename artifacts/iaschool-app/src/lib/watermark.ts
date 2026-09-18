/**
 * Selo de transparência do caráter sintético da imagem.
 * Base: Decreto nº 12.880/2026, art. 11, I.
 *
 * O selo é aplicado no cliente logo após a geração e ANTES de salvar no
 * Storage, de modo que toda cópia que sai do produto (download, galeria,
 * área do aluno, envio ao responsável) já nasce marcada. Pedir a marca ao
 * modelo não serve: o modelo pode ignorar a instrução.
 */

import { AI_DISCLOSURE_LABEL } from "./eca";

/** Altura da faixa em relação ao lado menor da imagem. */
const BAND_RATIO = 0.058;
const MIN_BAND_PX = 28;

/**
 * Desenha uma faixa inferior com o aviso "IMAGEM GERADA POR IA".
 * Devolve um PNG em data URL. Em qualquer falha (canvas indisponível,
 * imagem de outra origem sem CORS), devolve a imagem original inalterada —
 * a marcação nunca pode impedir o usuário de ver o resultado.
 */
export async function stampAiDisclosure(src: string): Promise<string> {
  try {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const band = Math.max(
      MIN_BAND_PX,
      Math.round(Math.min(canvas.width, canvas.height) * BAND_RATIO),
    );
    const y = canvas.height - band;

    // Faixa escura translúcida: legível sobre qualquer arte gerada.
    ctx.fillStyle = "rgba(9, 9, 11, 0.78)";
    ctx.fillRect(0, y, canvas.width, band);

    const fontSize = Math.round(band * 0.42);
    ctx.font = `600 ${fontSize}px "Inter", system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    // letterSpacing ainda não está na lib DOM de todas as versões do TS.
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      `${Math.max(1, Math.round(fontSize * 0.08))}px`;
    ctx.fillText(AI_DISCLOSURE_LABEL, canvas.width / 2, y + band / 2);

    return canvas.toDataURL("image/png");
  } catch {
    return src;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Necessário para não "sujar" o canvas quando a imagem vem do Storage.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar a imagem"));
    img.src = src;
  });
}
