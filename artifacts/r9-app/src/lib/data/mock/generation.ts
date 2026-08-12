// Composição da imagem estilo post de Instagram via canvas (modo mock).
// Ponto de troca isolado: quando a OpenAI (GPT Image) for integrada, apenas a
// implementação de ImageGenerationService em ./index.ts muda — este arquivo
// deixa de ser usado.

import type { GenerationRequest } from "../types";

const SIZE = 1080;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export async function composePostImage(
  request: GenerationRequest,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador");

  const [c1, c2, c3] = [
    request.club?.colors?.[0] ?? "#2e2e2e",
    request.club?.colors?.[1] ?? "#1c1c1c",
    request.club?.colors?.[2] ?? "#39ff14",
  ];

  // Fundo em degradê com as cores do clube (ou da marca)
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Foto do aluno (metade direita, com recorte diagonal)
  try {
    const photo = await loadImage(request.studentPhoto.url);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(SIZE * 0.42, 0);
    ctx.lineTo(SIZE, 0);
    ctx.lineTo(SIZE, SIZE);
    ctx.lineTo(SIZE * 0.3, SIZE);
    ctx.closePath();
    ctx.clip();
    drawCover(ctx, photo, SIZE * 0.3, 0, SIZE * 0.7, SIZE);
    // sobreposição para legibilidade
    const overlay = ctx.createLinearGradient(SIZE * 0.3, 0, SIZE, 0);
    overlay.addColorStop(0, "rgba(0,0,0,0.55)");
    overlay.addColorStop(0.4, "rgba(0,0,0,0.05)");
    ctx.fillStyle = overlay;
    ctx.fillRect(SIZE * 0.3, 0, SIZE * 0.7, SIZE);
    ctx.restore();
  } catch {
    // segue sem foto
  }

  // Faixa de destaque
  ctx.fillStyle = c3;
  ctx.fillRect(0, 0, 18, SIZE);

  // Nome do aluno
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 72px Prometo, 'DM Sans', sans-serif";
  ctx.textBaseline = "top";
  const name = request.student.name.toUpperCase();
  wrapText(ctx, name, 56, 72, SIZE * 0.5, 78);

  // Posição
  if (request.student.position) {
    ctx.fillStyle = c3;
    ctx.font = "700 40px Prometo, 'DM Sans', sans-serif";
    ctx.fillText(request.student.position.toUpperCase(), 56, 260);
  }

  // Métricas
  const startY = 360;
  ctx.textBaseline = "alphabetic";
  request.metrics.slice(0, 6).forEach((m, i) => {
    const y = startY + i * 108;
    ctx.fillStyle = c3;
    ctx.font = "900 64px Prometo, 'DM Sans', sans-serif";
    ctx.fillText(String(m.value), 56, y + 58);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "500 30px Prometo, 'DM Sans', sans-serif";
    ctx.fillText(m.name.toUpperCase(), 56, y + 96);
  });

  // Brasão do clube
  if (request.showClubLogo && request.club?.logo) {
    try {
      const logo = await loadImage(request.club.logo.url);
      const w = 140;
      const h = (logo.height / logo.width) * w;
      ctx.drawImage(logo, SIZE - w - 48, 48, w, h);
    } catch {
      /* ignora */
    }
  }

  // Marca R9
  if (request.includeR9Logo) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, 48, SIZE - 128, 190, 80, 16);
    ctx.fill();
    ctx.fillStyle = c3;
    ctx.font = "900 52px Prometo, 'DM Sans', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("R9", 76, SIZE - 88);
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 26px Prometo, 'DM Sans', sans-serif";
    ctx.fillText("ESCOLINHAS", 138, SIZE - 88);
    ctx.textBaseline = "alphabetic";
  }

  return canvas.toDataURL("image/png");
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
