# Estimativa de custos operacionais — base para precificar **por aluno**

**Data:** 21/09/2026. **Câmbio adotado:** US$ 1 = R$ 5,50.
**Escopo:** custo recorrente de infraestrutura e serviços de terceiros para
operar o IAschool como está desenhado (Fases 1–3 prontas em código, Fase 5
prevista). Não inclui custo de pessoas (suporte, operação, jurídico) nem o
desenvolvimento já feito; ver §7.

> Nenhum preço abaixo foi confirmado num painel de cobrança real: o produto
> ainda não tem worker implantado nem tráfego. São **preços de lista** dos
> provedores em setembro/2026 e volumes derivados da spec. Onde há incerteza
> relevante, ela está marcada. Recalcule com o script em §8 quando um número
> mudar.

## 1. Resumo

| Cenário | Escolas | Alunos | Plataforma (fixo + excedentes) | **Custo por aluno/mês** | Com arte gerada por IA (1 por evento) |
| --- | --- | --- | --- | --- | --- |
| A — Piloto | 1 | 200 | R$ 354/mês | **R$ 1,80** | R$ 1,94 (qualidade média) · R$ 2,27 (alta) |
| B — Tração | 10 | 3.000 | R$ 516/mês | **R$ 0,21** | R$ 0,35 · R$ 0,68 |
| C — Escala | 50 | 15.000 | R$ 1.116/mês | **R$ 0,11** | R$ 0,25 · R$ 0,58 |

Três conclusões para a precificação:

1. **Abaixo de ~1.000 alunos o custo é quase todo fixo** (Supabase, Vercel,
   duas máquinas de worker). Por isso o preço deve ter um **mínimo por escola**
   além do valor por aluno; só "por aluno" faz o piloto dar prejuízo.
2. **O custo marginal de um aluno é centavos.** Storage, egress, banco e
   WhatsApp somam menos de R$ 0,05/aluno/mês em qualquer cenário. Reconhecimento
   facial self-hosted (D1 da spec) foi a decisão que tornou isso possível: uma
   API externa cobraria ~US$ 1 por 1.000 imagens, mais coleção biométrica.
3. **A única variável cara é a arte gerada por IA** (`gpt-image`, módulo
   herdado da Fase 0, previsto em lote na Fase 5). Ela sozinha pode ser 3 a 5
   vezes o resto do custo por aluno. Se entrar no produto, precifique como
   módulo à parte ou limite a quantidade por aluno.

## 2. O que gera custo (mapa do sistema)

| Componente | Onde roda | Cobra por | Fonte no repo |
| --- | --- | --- | --- |
| App web (Vite/React) | Vercel | assento/mês | `artifacts/iaschool-app/vercel.json` |
| Banco, Auth, Storage, Realtime, pgvector, pg_cron | Supabase (us-east-1) | plano + compute + GB excedente | `artifacts/iaschool-app/SUPABASE.md` |
| `ingest-worker` (miniaturas, expurgo) | Fly.io gru, shared-cpu-1x 1 GB | máquina ligada 24h | `artifacts/ingest-worker/fly.toml` |
| `face-worker` (SCRFD + ArcFace, CPU) | Fly.io gru, shared-cpu-2x 2 GB | máquina ligada 24h; escala por **máquina** | `artifacts/face-worker/fly.toml` |
| `api-server` (geração de arte) | Fly.io gru, 512 MB, auto-stop | máquina sob demanda | `fly.toml` (raiz) |
| Geração de arte | OpenAI `gpt-image-2`, 1024×1024 | por imagem | `artifacts/api-server/src/routes/generation.ts` |
| E-mail transacional (confirmação, reset) | Resend via SMTP do Supabase | mensagens/mês | `docs/pendencias-producao.md` |
| OTP do responsável e entrega | Meta WhatsApp Cloud API | por mensagem, por categoria | `docs/pendencias-producao.md` |
| Domínio | registro .com.br | ano | — |

Fora da conta, de propósito: modelos `buffalo_l` (gratuitos, embutidos na
imagem), Fly egress (os workers só sobem miniaturas e recortes, poucos KB) e
observabilidade (log da própria Fly/Supabase, sem ferramenta paga).

## 3. Preços unitários adotados

| Item | Preço (US$) | Observação |
| --- | --- | --- |
| Supabase Pro | 25/mês | inclui 8 GB banco, 100 GB Storage, 250 GB egress, compute Micro |
| Compute Small / Medium | 15 / 60 por mês | necessário a partir de ~3.000 / ~15.000 alunos (pgvector + Realtime) |
| Storage excedente | 0,021/GB-mês | |
| Egress excedente | 0,09/GB | |
| Banco excedente | 0,125/GB-mês | |
| Fly shared-cpu-1x 1 GB | ~5,70/mês | `ingest-worker` |
| Fly shared-cpu-2x 2 GB | ~11/mês | `face-worker`; **vazão nessa máquina não medida** (spike §5.3) |
| Fly `api-server` 512 MB auto-stop | 2–5/mês | quase sempre parado |
| Vercel Pro | 20/mês por assento | Hobby não permite uso comercial |
| Resend | 0 até 3.000 e-mails/mês; 20 acima | só e-mail de equipe da escola |
| WhatsApp autenticação (BR) | 0,0315/msg | OTP, 1 vez por responsável |
| WhatsApp utilidade (BR) | 0,008/msg | entrega da pasta do aluno por evento |
| WhatsApp marketing (BR) | 0,0625/msg | **risco**: se a Meta classificar a entrega como marketing |
| `gpt-image` 1024² qualidade média / alta | ~0,05 / ~0,17 por arte | referência `gpt-image-1`; o código usa `gpt-image-2` sem `quality`, confirmar na tabela da OpenAI |
| Domínio .com.br | ~0,6/mês | R$ 40/ano |

## 4. Volume por aluno (derivado da spec)

| Premissa | Valor | Origem |
| --- | --- | --- |
| Eventos por ano letivo | 6 | estimativa (spike §5.4: "alguns eventos por mês" na escola piloto) |
| Fotos por evento | ~2.000 para 200 alunos → **10 fotos/aluno/evento** | spec §1, D3 |
| Tamanho por foto no Storage | 0,70 MB (2560px q85) + 0,02 MB (thumb WebP) + ~0,045 MB (3 recortes) ≈ **0,77 MB** | D3, D4, §7.3 |
| Retenção da foto de evento | **2 anos** → estoque em regime = 120 fotos/aluno | §9.4, `events.retention_until` |
| Egress dos workers | 1,4 MB/foto (ingest e face baixam a foto; Supabase us-east → Fly gru) | §7.2, §7.3 |
| Egress da família | ~22 MB/aluno/evento (ver 2× a pasta + 1 ZIP) | §7.6, M6 |
| Banco por aluno | ~0,4 MB/ano (`photo_faces`, vetores 512-d só de consentidos, `biometric_events`) | §5.3, D5 |

Resultado por aluno:

| | Valor |
| --- | --- |
| Storage em regime | 92 MB |
| Egress por ano | 216 MB |
| Banco em regime | 0,8 MB |
| WhatsApp por mês (OTP amortizado + 6 entregas utilidade) | US$ 0,0066 |
| Arte por mês (1 por evento) | US$ 0,025 (média) · US$ 0,085 (alta) |

Só o storage e o egress ultrapassam a cota do Pro, e só no cenário C.

## 5. Detalhe por cenário

### A — Piloto (1 escola, 200 alunos)

| Linha | US$/mês |
| --- | --- |
| Supabase Pro (Micro) | 25,0 |
| Vercel Pro (1 assento) | 20,0 |
| Fly: 1 `ingest` + 1 `face` + `api-server` | 18,7 |
| Domínio | 0,6 |
| Excedentes (18 GB storage, 4 GB egress) | 0 |
| **Plataforma** | **64,3 (R$ 354)** |
| Por aluno (plataforma / 200 + WhatsApp) | **0,328 (R$ 1,80)** |

### B — Tração (10 escolas, 3.000 alunos)

| Linha | US$/mês |
| --- | --- |
| Supabase Pro + compute Small | 40,0 |
| Vercel Pro | 20,0 |
| Fly: 1 `ingest` + 2 `face` + `api-server` | 29,7 |
| Domínio | 0,6 |
| Storage excedente (269 GB) | 3,5 |
| **Plataforma** | **93,8 (R$ 516)** |
| Por aluno | **0,038 (R$ 0,21)** |

### C — Escala (50 escolas, 15.000 alunos)

| Linha | US$/mês |
| --- | --- |
| Supabase Pro + compute Medium | 85,0 |
| Vercel Pro | 20,0 |
| Fly: 2 `ingest` + 3 `face` + `api-server` | 49,4 |
| Resend Pro | 20,0 |
| Domínio | 0,6 |
| Storage excedente (1.345 GB) | 26,1 |
| Egress excedente (264 GB/mês) | 1,2 |
| Banco excedente (11,7 GB) | 0,5 |
| **Plataforma** | **202,8 (R$ 1.116)** |
| Por aluno | **0,020 (R$ 0,11)** |

## 6. Sensibilidade: o que mexe no número

| Se… | Efeito | Tamanho |
| --- | --- | --- |
| A escola liga `keep_originals` (5 MB/foto) | storage ×7 → ~660 MB/aluno | +US$ 0,014/aluno/mês; cobre com adicional por evento |
| A Meta classifica a entrega como **marketing** | WhatsApp de 0,0066 → 0,034/aluno/mês | +R$ 0,15/aluno/mês; mitigar com template de utilidade bem escrito |
| Arte IA em **alta qualidade**, 1 por evento | +US$ 0,085/aluno/mês | multiplica o custo por aluno de B e C por 3 a 5 |
| Arte IA ilimitada (cota atual: 50/dia por usuário) | não previsível | precifique como módulo ou por crédito |
| Retenção de 2 → 5 anos | storage ×2,5 | +US$ 0,003/aluno/mês; irrelevante |
| `face-worker` mais lento que o esperado na Fly | mais máquinas de US$ 11 | fixo, não por aluno; medir antes de fechar |
| Supabase em sa-east-1 em vez de us-east-1 | menor latência, egress igual | mudança de projeto, custo zero de lista |

## 7. O que não está na conta

- **Pessoas**: suporte à escola, operação dos workers, revisão de conformidade,
  DPO/encarregado LGPD. Em produto para menores isso não é opcional e tende a
  ser maior que a infraestrutura inteira. Estime por escola (onboarding,
  treinamento da secretaria) e coloque no mínimo mensal.
- **Jurídico**: redação e revisão do termo de consentimento com os quatro
  escopos (`BACKLOG.md`, seção Transversal). Custo único.
- **Onboarding na Meta**: verificação da empresa, número dedicado. Sem custo
  de lista, mas semanas de prazo.
- **Desenvolvimento**: o que falta (deploy dos workers, desfoque na entrega,
  Fase 4 e 5) e manutenção. Fora do custo unitário; entra na margem.
- **Impostos** sobre a receita e taxa do meio de pagamento.

## 8. Como recalcular

O modelo é paramétrico. Para mudar câmbio, preço, eventos por ano ou tamanho
de cenário, edite as constantes e rode:

```bash
python3 scripts/custos-por-aluno.py
```

Os números deste documento saíram dele em 21/09/2026.

## 9. Pendências para fechar o número

1. Medir a vazão do `face-worker` na `shared-cpu-2x` da Fly
   (`scripts/spike-face/src/bench_throughput.py` na máquina alvo) e o custo real
   do primeiro mês com evento de teste.
2. Confirmar preço e qualidade padrão de `gpt-image-2` na tabela da OpenAI.
3. Confirmar categoria do template de entrega na Meta (utilidade × marketing).
4. Decidir se a arte gerada por IA continua no produto ou vira módulo à parte.
