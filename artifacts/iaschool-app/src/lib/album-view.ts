export interface AlbumEventItem {
  eventId?: string;
  eventName?: string;
}
export interface AlbumEventGroup<T> {
  key: string;
  eventName: string;
  items: T[];
}
const EVENT_KEY = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}
export function albumEventName(item: AlbumEventItem, fallback = "Evento"): string {
  const name = item.eventName?.trim() ?? "";
  if (name.length >= 1 && name.length <= 120) return name;
  const safe = fallback.trim();
  return safe.length >= 1 && safe.length <= 120 ? safe : "Evento";
}
export function albumEventKey(item: AlbumEventItem, fallback = "Evento"): string {
  return item.eventId && EVENT_KEY.test(item.eventId) ? item.eventId : `name:${albumEventName(item, fallback)}`;
}
/** Busca e filtro em cima do conjunto já autorizado. Não altera o array recebido. */
export function visibleAlbumItems<T extends AlbumEventItem>(items: readonly T[], query: string, eventKey: string, fallback = "Evento"): T[] {
  const needle = fold(query);
  return items.filter(item => {
    if (eventKey && eventKey !== "all" && albumEventKey(item, fallback) !== eventKey) return false;
    if (!needle) return true;
    return fold(albumEventName(item, fallback)).includes(needle);
  });
}
export function groupAlbumByEvent<T extends AlbumEventItem>(items: readonly T[], fallback = "Evento"): AlbumEventGroup<T>[] {
  const groups = new Map<string, AlbumEventGroup<T>>();
  for (const item of items) {
    const key = albumEventKey(item, fallback);
    const current = groups.get(key);
    if (current) current.items.push(item);
    else groups.set(key, { key, eventName: albumEventName(item, fallback), items: [item] });
  }
  return [...groups.values()];
}
