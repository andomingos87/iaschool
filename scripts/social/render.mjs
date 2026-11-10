#!/usr/bin/env node
/**
 * render.mjs — exporta posts em HTML para PNG pelo Chrome headless (o mesmo do deck).
 *
 * Uso:
 *   node scripts/social/render.mjs <post.html> [mais.html ...] [--size 1080x1350] [--out post.png]
 *
 * Tamanho: --size, senão <meta name="social-size" content="1080x1350"> no HTML,
 * senão 1080x1350. O PNG sai ao lado do HTML com o mesmo nome; --out só vale
 * para um arquivo. Respeita CHROME_BIN se estiver definido.
 *
 * Falha se algum texto usa Bricolage Grotesque ou Plus Jakarta Sans e a fonte
 * não carregou: o PNG fica salvo, mas não deve ser usado.
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FONTES = ['Bricolage Grotesque', 'Plus Jakarta Sans'];

// Marca no <html> as fontes da marca que algum texto usa e não carregaram.
// Sem isso, se o Google Fonts falhar, o Chrome cai na fonte padrão em silêncio.
const VERIFICA_FONTES = `<script>document.fonts.ready.then(() => {
  const marca = ${JSON.stringify(FONTES)};
  const primeira = el => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/["']/g, '');
  const usadas = new Set([...document.querySelectorAll('body *')]
    // Só texto que aparece: fora script, style e o <title>/<desc> de SVG.
    .filter(el => !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'TITLE', 'DESC'].includes(el.tagName.toUpperCase()))
    .filter(el => el.getClientRects().length > 0)
    .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
    .map(primeira));
  const carregou = f => [...document.fonts].some(ff => ff.family.replace(/["']/g, '') === f && ff.status === 'loaded');
  document.documentElement.dataset.fontesFaltando = marca.filter(f => usadas.has(f) && !carregou(f)).join('|') || 'nenhuma';
});</script>`;

function falhar(msg) {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

function lerArgs(argv) {
  const args = { arquivos: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--size') args.size = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i].startsWith('--')) falhar(`argumento desconhecido: ${argv[i]}`);
    else args.arquivos.push(argv[i]);
  }
  if (args.arquivos.length === 0) falhar('informe ao menos um HTML');
  if (args.out && args.arquivos.length > 1) falhar('--out só vale para um arquivo');
  return args;
}

function tamanhoDe(html, forcado) {
  const valor = forcado ?? /<meta\s+name="social-size"\s+content="(\d+x\d+)"/.exec(html)?.[1] ?? '1080x1350';
  const m = /^(\d+)x(\d+)$/.exec(valor);
  if (!m) falhar(`tamanho inválido: ${valor}`);
  return [Number(m[1]), Number(m[2])];
}

const args = lerArgs(process.argv.slice(2));
const chrome = findChrome();
if (!chrome) falhar('Chrome não encontrado. Defina CHROME_BIN.');

for (const arquivo of args.arquivos) {
  const abs = resolve(arquivo);
  if (!existsSync(abs)) falhar(`não encontrado: ${arquivo}`);
  const html = readFileSync(abs, 'utf8');
  const [w, h] = tamanhoDe(html, args.size);
  const out = resolve(args.out ?? abs.replace(/\.html?$/i, '') + '.png');
  // Cópia com a verificação de fontes, na mesma pasta para os caminhos relativos valerem.
  const verificacao = join(dirname(abs), `.verifica-fontes-${process.pid}.html`);
  // Perfil descartável: não mexe no Chrome do usuário nem herda extensões.
  const perfil = mkdtempSync(join(tmpdir(), 'social-render-'));
  const base = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    '--force-device-scale-factor=1',
    `--window-size=${w},${h}`,
    // Dá tempo para as fontes do Google Fonts e as imagens carregarem.
    '--virtual-time-budget=10000',
  ];
  let faltando;
  try {
    writeFileSync(verificacao, html.replace(/<\/body>/i, `${VERIFICA_FONTES}</body>`));
    const dom = execFileSync(chrome, [...base, '--dump-dom', pathToFileURL(verificacao).href], { stdio: 'pipe' }).toString();
    faltando = /data-fontes-faltando="([^"]*)"/.exec(dom)?.[1];
    execFileSync(chrome, [...base, `--screenshot=${out}`, pathToFileURL(abs).href], { stdio: 'pipe' });
  } catch (erro) {
    falhar(`Chrome falhou em ${arquivo}: ${erro.stderr?.toString().trim().split('\n').pop() ?? erro.message}`);
  } finally {
    rmSync(verificacao, { force: true });
    rmSync(perfil, { recursive: true, force: true });
  }
  if (!existsSync(out)) falhar(`Chrome não gerou ${out}`);
  if (faltando === undefined) falhar(`não deu para verificar as fontes de ${arquivo} (o HTML tem </body>?)`);
  if (faltando !== 'nenhuma') falhar(`fonte da marca não carregou em ${arquivo}: ${faltando.replaceAll('|', ', ')}. Confira a rede e exporte de novo.`);
  console.log(`PNG ${w}x${h} salvo em ${out} (fontes da marca carregadas)`);
}
