# Integração futura com Supabase

O app roda hoje 100% com dados mock (localStorage), atrás de interfaces
compatíveis com Supabase em `src/lib/data/contract.ts`. A UI indica o modo
demonstração via `DataLayer.isMock`.

## Variáveis de ambiente necessárias

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima pública do projeto |

## Mapeamento

| Interface (`contract.ts`) | Supabase |
| --- | --- |
| `AuthService` | `supabase.auth` (signInWithPassword, signOut, getSession, onAuthStateChange) |
| `StorageService` | `supabase.storage` — buckets sugeridos: `students`, `clubs`, `references` |
| `StudentRepository` etc. | Tabelas `students`, `clubs`, `reference_posts`, `metrics`, `generated_posts` |
| `ImageGenerationService` | Endpoint de backend chamando OpenAI GPT Image (hoje: mock via canvas em `src/lib/data/mock/generation.ts`) |

Papéis: `super_admin` e `school_user` (coluna `role` em `profiles`).

## Passos da troca

1. Criar projeto Supabase, tabelas e buckets acima.
2. `pnpm add @supabase/supabase-js` no pacote `@workspace/r9-app`.
3. Implementar `createSupabaseDataLayer()` cumprindo `DataLayer`.
4. Ativar a troca por variável de ambiente em `src/lib/data/index.ts`.

Nenhuma tela importa a implementação mock diretamente — todas usam
`getDataLayer()`.
