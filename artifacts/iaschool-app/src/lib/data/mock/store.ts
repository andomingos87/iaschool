// Armazenamento genérico em localStorage para o modo mock.
// Simula latência de rede para que os estados de carregando sejam visíveis.

const PREFIX = "iaschool:";

export function readCollection<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T[];
  } catch {
    return fallback;
  }
}

export function writeCollection<T>(key: string, items: T[]): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(items));
}

export function readValue<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeValue<T>(key: string, value: T | null): void {
  if (value === null) localStorage.removeItem(PREFIX + key);
  else localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Latência simulada (ms) para o mock parecer uma API real. */
export function delay(ms = 350): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
