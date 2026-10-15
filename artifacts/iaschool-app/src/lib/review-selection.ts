/** Seleção humana limitada ao aluno/evento e às sugestões vistas. */
export interface ReviewSelection {
  context: string;
  visibleIds: string[];
  checked: Set<string>;
}

export function reconcileReviewSelection(
  previous: ReviewSelection | undefined,
  context: string,
  visibleIds: string[],
  confidentIds: string[],
): ReviewSelection {
  const visible = new Set(visibleIds);
  if (!previous || previous.context !== context) {
    return { context, visibleIds, checked: new Set(confidentIds.filter((id) => visible.has(id))) };
  }
  if (previous.visibleIds.length === visibleIds.length &&
      previous.visibleIds.every((id, index) => id === visibleIds[index])) return previous;
  // Fotos que chegaram depois não herdam "todas" nem a seleção inicial.
  return { context, visibleIds, checked: new Set([...previous.checked].filter((id) => visible.has(id))) };
}

export function changeReviewSelection(
  selection: ReviewSelection,
  command: "all" | "none" | { toggle: string },
  pending: boolean,
): ReviewSelection {
  if (pending) return selection;
  if (command === "all") return { ...selection, checked: new Set(selection.visibleIds) };
  if (command === "none") return { ...selection, checked: new Set() };
  if (!selection.visibleIds.includes(command.toggle)) return selection;
  const checked = new Set(selection.checked);
  if (checked.has(command.toggle)) checked.delete(command.toggle);
  else checked.add(command.toggle);
  return { ...selection, checked };
}

export function reviewSelectionBatch(selection: ReviewSelection) {
  return {
    selected: selection.visibleIds.filter((id) => selection.checked.has(id)),
    deferred: selection.visibleIds.filter((id) => !selection.checked.has(id)),
  };
}
