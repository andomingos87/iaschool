/** Comparação sem acento, sem º/ª e sem diferença de maiúsculas. */
export function foldComboboxText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .toLowerCase();
}

export function comboboxShowsSearch(optionCount: number): boolean {
  return optionCount > 7;
}

export function comboboxMatches(
  label: string,
  query: string,
  pinned: boolean,
): boolean {
  const q = foldComboboxText(query.trim());
  if (!q || pinned) return true;
  return foldComboboxText(label).includes(q);
}
