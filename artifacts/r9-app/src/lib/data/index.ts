// Ponto de troca da camada de dados.
// Hoje: mock (localStorage). Futuro: Supabase real.
//
// Para conectar o Supabase depois:
// 1. Crie o projeto no Supabase e defina as variáveis (ver ../../..//SUPABASE.md):
//    VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
// 2. Implemente createSupabaseDataLayer() cumprindo as interfaces de ./contract.ts
// 3. Troque a factory abaixo quando as variáveis estiverem presentes.

import type { DataLayer } from "./contract";
import { createMockDataLayer } from "./mock";
import { createSupabaseDataLayer } from "./supabase";

let instance: DataLayer | null = null;

export function getDataLayer(): DataLayer {
  if (!instance) {
    const hasSupabase = Boolean(
      import.meta.env.VITE_SUPABASE_URL &&
        import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
    instance = hasSupabase ? createSupabaseDataLayer() : createMockDataLayer();
  }
  return instance;
}

export * from "./types";
export type * from "./contract";
