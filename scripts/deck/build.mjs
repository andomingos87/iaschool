#!/usr/bin/env node
/**
 * build.mjs — pipeline de build do deck IASchool.
 *
 * Fonte única de verdade: docs/apresentacao-iaschool.html (palco 16:9).
 * A partir dela este script gera, sempre em conjunto:
 *
 *   docs/apresentacao-iaschool-mobile.html   9:16, mesmo conteúdo + scripts/deck/mobile.css
 *   docs/apresentacao-iaschool.pdf           1920×1080, vetorial
 *   docs/apresentacao-iaschool-mobile.pdf    1080×1920, vetorial
 *
 * Não edite os arquivos gerados: a próxima execução sobrescreve tudo.
 *
 * Uso:
 *   node scripts/deck/build.mjs            # gera tudo
 *   node scripts/deck/build.mjs --html     # só o HTML mobile (rápido, sem Chrome)
 *
 * Os PDFs saem do modo de impressão do próprio deck (@media print), impresso
 * pelo Chrome headless. Por isso o texto fica vetorial e o arquivo, leve —
 * ao contrário de exportadores que capturam screenshot de cada slide.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const SRC_HTML    = join(ROOT, 'docs', 'apresentacao-iaschool.html');
const MOBILE_CSS  = join(HERE, 'mobile.css');
const MOBILE_HTML = join(ROOT, 'docs', 'apresentacao-iaschool-mobile.html');
const PDF_DESKTOP = join(ROOT, 'docs', 'apresentacao-iaschool.pdf');
const PDF_MOBILE  = join(ROOT, 'docs', 'apresentacao-iaschool-mobile.pdf');

const htmlOnly = process.argv.includes('--html');

/* --- Chrome ---------------------------------------------------------------
   Usado só para imprimir. Respeita CHROME_BIN se estiver definido.          */
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

/* --- 1. HTML mobile -------------------------------------------------------
   Mesma marcação, mesmo controlador. Muda o tamanho do palco e entra a
   camada de sobrescrita. Nenhum conteúdo é reescrito aqui.                  */
function buildMobileHtml() {
  let html = readFileSync(SRC_HTML, 'utf8');
  const css = readFileSync(MOBILE_CSS, 'utf8');

  const stageDecl = 'const STAGE_W = 1920, STAGE_H = 1080;';
  if (!html.includes(stageDecl)) {
    throw new Error(
      'Não achei a declaração do palco no HTML de origem:\n  ' + stageDecl +
      '\nO build mobile depende dessa linha. Restaure-a em docs/apresentacao-iaschool.html.'
    );
  }
  html = html.replace(stageDecl, 'const STAGE_W = 1080, STAGE_H = 1920;');

  if (!html.includes('</head>')) throw new Error('HTML de origem sem </head>.');
  html = html.replace(
    '</head>',
    '<style id="mobile-layer">\n/* GERADO — não edite aqui. Edite scripts/deck/mobile.css */\n' + css + '\n</style>\n</head>'
  );

  html = html.replace(
    '<title>IASchool — Apresentação</title>',
    '<title>IASchool — Apresentação (mobile)</title>'
  );

  html = html.replace(
    '<!DOCTYPE html>',
    '<!DOCTYPE html>\n<!-- ARQUIVO GERADO por scripts/deck/build.mjs a partir de docs/apresentacao-iaschool.html.\n     Qualquer edição aqui é perdida no próximo build. -->'
  );

  writeFileSync(MOBILE_HTML, html, 'utf8');
  return MOBILE_HTML;
}

/* --- 2. PDF ---------------------------------------------------------------
   O @media print do deck já expõe todos os slides, um por página, no estado
   final da animação. O Chrome só precisa imprimir.                          */
function printPdf(chrome, htmlPath, pdfPath) {
  execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--virtual-time-budget=15000',   /* espera fontes do Google carregarem */
    '--run-all-compositor-stages-before-draw',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });

  if (!existsSync(pdfPath)) throw new Error(`Chrome não gerou ${pdfPath}`);
  return statSync(pdfPath).size;
}

const kb = n => (n / 1024).toFixed(0) + ' KB';

/* --- Execução ------------------------------------------------------------ */
try {
  if (!existsSync(SRC_HTML)) throw new Error(`Fonte não encontrada: ${SRC_HTML}`);

  buildMobileHtml();
  console.log('✓ docs/apresentacao-iaschool-mobile.html');

  if (htmlOnly) process.exit(0);

  const chrome = findChrome();
  if (!chrome) {
    console.error('⚠ Chrome não encontrado — HTML mobile gerado, PDFs não.');
    console.error('  Instale o Google Chrome ou defina CHROME_BIN=/caminho/para/chrome');
    process.exit(2);
  }

  console.log('  ' + kb(printPdf(chrome, SRC_HTML,    PDF_DESKTOP)) + '  docs/apresentacao-iaschool.pdf');
  console.log('  ' + kb(printPdf(chrome, MOBILE_HTML, PDF_MOBILE))  + '  docs/apresentacao-iaschool-mobile.pdf');
  console.log('✓ deck atualizado');
} catch (err) {
  console.error('✗ build do deck falhou: ' + (err.message || err));
  process.exit(1);
}
