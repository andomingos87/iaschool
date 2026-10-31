#!/usr/bin/env node
/**
 * gerar-imagem.mjs — gera o visual de um post da AIESCOLA pela API de imagens da OpenAI.
 *
 * Uso:
 *   node scripts/social/gerar-imagem.mjs --prompt-file <prompt.txt> --out <fundo.png>
 *     [--size 1088x1360] [--quality medium] [--model gpt-image-2.5-flare]
 *     [--background auto|opaque|transparent] [--ref <imagem>]...
 *
 * Sem --ref chama /v1/images/generations. Com --ref chama /v1/images/edits e
 * manda as referências como image[]. Referência só sai de branding/,
 * artifacts/iaschool-ui/public/brand/ ou social/referencias/: foto de aluno
 * nunca entra aqui.
 *
 * Cada execução é uma chamada paga. Ao lado do PNG fica um .json com modelo,
 * tamanho, qualidade, prompt e uso de tokens. A chave nunca é impressa.
 * Fonte das regras de tamanho e qualidade: guia de image generation da OpenAI
 * (developers.openai.com), consultado em 31/10/2026.
 */

import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, basename, extname, isAbsolute } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const QUALIDADES = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];
const FUNDOS = ['auto', 'opaque', 'transparent'];
const PASTAS_DE_REFERENCIA = [
  'branding',
  'artifacts/iaschool-ui/public/brand',
  'social/referencias',
];
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function falhar(msg) {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

/* --- Argumentos ----------------------------------------------------------- */
function lerArgs(argv) {
  const args = { size: '1088x1360', quality: 'medium', model: 'gpt-image-2.5-flare', background: 'auto', refs: [] };
  for (let i = 0; i < argv.length; i++) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (!chave.startsWith('--') || valor === undefined) falhar(`argumento inválido: ${chave}`);
    i++;
    switch (chave) {
      case '--prompt-file': args.promptFile = valor; break;
      case '--out': args.out = valor; break;
      case '--size': args.size = valor; break;
      case '--quality': args.quality = valor; break;
      case '--model': args.model = valor; break;
      case '--background': args.background = valor; break;
      case '--ref': args.refs.push(valor); break;
      default: falhar(`argumento desconhecido: ${chave}`);
    }
  }
  if (!args.promptFile || !args.out) falhar('informe --prompt-file e --out');
  if (!QUALIDADES.includes(args.quality)) falhar(`--quality deve ser ${QUALIDADES.join(', ')}`);
  if (!FUNDOS.includes(args.background)) falhar(`--background deve ser ${FUNDOS.join(', ')}`);
  return args;
}

/* --- Tamanho: múltiplos de 16, proporção 1:3 a 3:1, até 3840 por lado,
       entre 655.360 e 8.294.400 pixels. ------------------------------------ */
function validarTamanho(size) {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) falhar(`--size deve ser LARGURAxALTURA, recebi ${size}`);
  const [w, h] = [Number(m[1]), Number(m[2])];
  if (w % 16 || h % 16) falhar(`largura e altura precisam ser múltiplos de 16 (${size})`);
  if (w / h > 3 || h / w > 3) falhar(`proporção fora de 1:3 a 3:1 (${size})`);
  if (w > 3840 || h > 3840) falhar(`nenhum lado pode passar de 3840 (${size})`);
  const px = w * h;
  if (px < 655360 || px > 8294400) falhar(`total de pixels fora de 655.360–8.294.400 (${size} = ${px})`);
}

/* --- Referências: só das pastas de marca e de referência sintética. ------- */
function validarReferencia(caminho) {
  const abs = resolve(caminho);
  if (!existsSync(abs)) falhar(`referência não encontrada: ${caminho}`);
  const rel = relative(ROOT, realpathSync(abs));
  const permitida = !isAbsolute(rel) && PASTAS_DE_REFERENCIA.some(p => rel === p || rel.startsWith(`${p}/`));
  if (!permitida) falhar(`referência fora de ${PASTAS_DE_REFERENCIA.join(', ')}: ${caminho}`);
  const tipo = TIPOS[extname(abs).toLowerCase()];
  if (!tipo) falhar(`referência precisa ser PNG, JPEG ou WEBP: ${caminho}`);
  return { abs, tipo };
}

/* --- Chave: ambiente primeiro, depois .env.local. Nunca é impressa. ------- */
function lerChave() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const arquivo = join(ROOT, '.env.local');
  if (existsSync(arquivo)) {
    for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*)\s*$/.exec(linha);
      if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  falhar('OPENAI_API_KEY não está no ambiente nem em .env.local');
}

async function chamar(args, prompt, chave) {
  const comum = { model: args.model, prompt, size: args.size, quality: args.quality, background: args.background, n: 1 };
  const signal = AbortSignal.timeout(180_000);
  const headers = { Authorization: `Bearer ${chave}` };

  if (args.refs.length === 0) {
    return fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(comum),
      signal,
    });
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(comum)) form.append(k, String(v));
  for (const ref of args.refs.map(validarReferencia)) {
    form.append('image[]', new Blob([readFileSync(ref.abs)], { type: ref.tipo }), basename(ref.abs));
  }
  return fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers, body: form, signal });
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  validarTamanho(args.size);
  args.refs.forEach(validarReferencia);
  if (!existsSync(args.promptFile)) falhar(`prompt não encontrado: ${args.promptFile}`);
  const prompt = readFileSync(args.promptFile, 'utf8').trim();
  if (!prompt) falhar('prompt vazio');

  const inicio = Date.now();
  let resposta;
  try {
    resposta = await chamar(args, prompt, lerChave());
  } catch (erro) {
    falhar(erro.name === 'TimeoutError' ? 'a API não respondeu em 180 s' : `falha de rede: ${erro.message}`);
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) falhar(`API respondeu ${resposta.status}: ${corpo?.error?.message ?? 'sem detalhe'}`);
  const b64 = corpo?.data?.[0]?.b64_json;
  if (!b64) falhar('resposta sem imagem (data[0].b64_json)');

  const out = resolve(args.out);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  writeFileSync(out.replace(/\.[^.]+$/, '') + '.json', JSON.stringify({
    modelo: args.model,
    tamanho: args.size,
    qualidade: args.quality,
    fundo: args.background,
    referencias: args.refs.map(r => relative(ROOT, resolve(r))),
    prompt,
    uso: corpo.usage ?? null,
    segundos: Math.round((Date.now() - inicio) / 1000),
    geradoEm: new Date().toISOString(),
  }, null, 2) + '\n');

  console.log(`Imagem salva em ${relative(ROOT, out)} (${args.model}, ${args.size}, ${args.quality}).`);
}

main();
