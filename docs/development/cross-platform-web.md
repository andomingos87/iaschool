# Desenvolvimento web local

**Revisado em 25/10/2026.** Requisitos declarados: Node.js 24, pnpm 11.17.0
(`package.json`), com Corepack disponível no PATH. Python 3.12 somente para o face-worker. Comandos a partir da
raiz; não há instalação adicional nesta revisão.

## Instalação e app

```bash
corepack pnpm install --frozen-lockfile
pnpm run verify:native
PORT=5174 BASE_PATH=/ pnpm --filter @workspace/iaschool-app run dev
```

Em PowerShell, configure as variáveis antes do comando:

```powershell
$env:PORT = '5174'
$env:BASE_PATH = '/'
corepack pnpm --filter @workspace/iaschool-app run dev
```

`vite.config.ts` exige `PORT` e `BASE_PATH` no ambiente do processo. Não basta
colocá-las no arquivo de ambiente do app. Sem conexão Supabase configurada, a
interface usa demonstração local.

Para conectar, configure somente `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` em `artifacts/iaschool-app/.env.local`, ou exporte-as
antes de iniciar Vite. **O `.env.local` da raiz não é o arquivo de ambiente do
Vite.** Ele é carregado pela configuração de testes do app, o que tem outro
efeito: testes de integração podem alcançar o projeto real.

## API e fronteira entre serviços

Com as variáveis de servidor já exportadas, em outro terminal:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
```

O script `dev` da API usa `export`, específico de shell POSIX. No PowerShell:

```powershell
$env:PORT = '5000'
$env:NODE_ENV = 'development'
corepack pnpm --filter @workspace/api-server run build
corepack pnpm --filter @workspace/api-server run start
```

A API não carrega automaticamente `.env.local`. Consulte os nomes em
[.env.example](../../.env.example), sem imprimir/copiar valores para docs ou
logs. `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` são apenas de servidor.
`DATABASE_URL` não é necessário para manter o schema; `lib/db` é inerte.

**O Vite não tem proxy de `/api`.** As chamadas relativas do app só encontram
a API no domínio publicado porque `artifacts/iaschool-app/vercel.json` faz o
rewrite para a Fly. Iniciar Vite e Express em portas diferentes não basta para
um E2E local. A ligação local no mesmo domínio ainda não tem configuração
versionada; uma mudança nisso é trabalho de produto separado desta revisão.
O álbum também depende da origem configurada e de cookie Secure no mesmo domínio.

Não ligue workers para conferir apenas o setup: eles consomem filas e alteram
o banco das credenciais, e o ingest pode chamar a API publicada para gerar
artes. Use ambiente isolado e autorizado. Comandos/configurações nos READMEs
[ingest](../../artifacts/ingest-worker/README.md) e
[face](../../artifacts/face-worker/README.md).

## Validação local

```bash
pnpm run test:compat
pnpm run typecheck
PORT=5000 BASE_PATH=/ pnpm run build
pnpm run smoke:web
```

No PowerShell, atribua `PORT` e `BASE_PATH` como no exemplo antes do build.
`smoke:web` define porta/base próprias, inicia Vite, checa HTTP e encerra o
processo; não valida login nem integração com API/Supabase. A CI cobre
compatibilidade web em macOS/Linux/Windows, tipos, build e smoke. Ainda não
executa as suítes de domínio. Veja [testes.md](testes.md) para comandos com
filtro que não incluam integrações reais.

## Corepack ausente

`spawn corepack ENOENT` significa que os scripts não encontraram Corepack no
PATH. `verify:native` e `smoke:web` o invocam diretamente, mesmo quando o
comando externo é `pnpm`. Ter pnpm funcionando não satisfaz esse pré-requisito.
Disponibilizar Corepack faz parte do setup da máquina; não alterar dependências
ou scripts do projeto para esconder a ausência.

## Falha de binário nativo

Erros como `Cannot find module '@rollup/rollup-linux-x64-gnu'` (ou a variante
macOS/Windows) podem indicar instalação sem o binário da plataforma. Preserve
`pnpm-workspace.yaml`, inclusive `minimumReleaseAge`, e refaça a instalação
congelada na plataforma correta. Não crie lockfile npm/yarn nem substitua a
política do workspace por um override específico de uma máquina.
