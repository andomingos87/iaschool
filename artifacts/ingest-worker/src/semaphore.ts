/**
 * Roda `fn` sobre `items` com no máximo `limit` em voo. Resolve quando todos
 * terminaram; rejeições de `fn` são engolidas aqui (o handler já trata e
 * loga), para um item ruim não derrubar o lote.
 */
export async function runLimited<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const item = items[next++]!;
      try {
        await fn(item);
      } catch {
        // tratado pelo handler
      }
    }
  }
  await Promise.all(Array.from({ length: size }, () => lane()));
}
