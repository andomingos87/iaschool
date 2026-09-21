// Geometria da galeria virtualizada: célula quadrada, colunas por largura do
// container (mesmos breakpoints da grade do M2: 3 / 4 / 6 / 8). Funções puras
// para o componente e para os testes.

export const GALLERY_GAP_PX = 8;

/** Colunas pela largura do CONTAINER (não da viewport: a sidebar muda a largura). */
export function columnsForWidth(width: number): number {
  if (width < 640) return 3;
  if (width < 768) return 4;
  if (width < 1024) return 6;
  return 8;
}

export function rowCount(total: number, cols: number): number {
  if (total <= 0 || cols <= 0) return 0;
  return Math.ceil(total / cols);
}

/** Altura de uma linha: célula quadrada mais o espaçamento abaixo dela. */
export function rowHeight(width: number, cols: number, gapPx = GALLERY_GAP_PX): number {
  if (cols <= 0 || width <= 0) return 0;
  const cell = (width - gapPx * (cols - 1)) / cols;
  return Math.max(1, Math.round(cell + gapPx));
}

/**
 * Faixa [início, fim) de índices de fotos para as linhas `rowStart..rowEnd`
 * (inclusivas), limitada ao total. Última linha incompleta é tratada aqui.
 */
export function indicesForRows(
  rowStart: number,
  rowEnd: number,
  cols: number,
  total: number,
): [number, number] {
  if (cols <= 0 || total <= 0 || rowEnd < rowStart) return [0, 0];
  const start = Math.max(0, rowStart) * cols;
  const end = Math.min(total, (rowEnd + 1) * cols);
  return start >= end ? [0, 0] : [start, end];
}
