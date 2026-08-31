# Aplicação ao IAschool (este repositório)

Recorte do produto deste workspace: plataforma em que escolas e professores
geram, por IA, cards de desempenho com **foto de alunos** e compartilham o
resultado por **WhatsApp**. Alunos também se cadastram sozinhos e acessam a
própria área.

> Este arquivo lista **pontos de contato e lacunas prováveis** verificados no
> código em 23/08/2026. Confirme cada um antes de citar em parecer — o código
> muda.

## 1. Enquadramento

| Pergunta | Resposta |
| --- | --- |
| Produto/serviço de TI? | Sim — aplicação de internet (Lei, art. 2º, I) |
| Direcionado a menores ou de acesso provável? | **Sim.** Público-alvo são alunos de escolas: probabilidade e atratividade de uso e facilidade de acesso (Lei, art. 1º, p. único, I e II) |
| É rede social? | Não — não há compartilhamento entre usuários na plataforma (Lei, art. 2º, III). A ANPD pode reenquadrar (Dec., art. 19, § 2º) |
| Tem conteúdo proibido (art. 15, § 1º do Decreto)? | Não |
| Tem loot box, apostas, publicidade direcionada? | Não |
| Modulação do art. 39 | Porte pequeno **reduz intensidade**, mas o fornecedor tem **interferência total** sobre o conteúdo (ele o gera), o que puxa as obrigações para cima |

Conclusão: não incide o regime de verificação de idade a cada acesso (Lei,
art. 9º). Incide o **núcleo**: arts. 3º, 5º a 8º, 10, 13, 14, 16 a 18, 22, 23,
25, 28 a 30 e 40 da Lei; arts. 9º a 11, 24, 41, 43 e 47 do Decreto.

## 2. Mapa código → obrigação

| Ponto no código | O que existe hoje | Obrigação tocada |
| --- | --- | --- |
| `artifacts/iaschool-app/src/pages/signup.tsx` | Autocadastro de aluno: nome, e-mail, senha, escola. **Sem data de nascimento e sem responsável legal** | Lei, arts. 10, 14, 24; LGPD, art. 14 |
| `artifacts/iaschool-app/src/lib/data/types.ts` (`Student`) | `whatsapp`, `birthDate?`, `heightCm`, `weightKg`, `position`, `notes`, `photos[]` | Lei, art. 7º, § 2º (minimização); LGPD, art. 14, § 3º |
| `artifacts/iaschool-app/src/pages/generate.tsx` | Fluxo de geração com foto do aluno, prompt auxiliar em texto livre, métricas | Dec., art. 11; Lei, arts. 6º, 23; Dec., arts. 16, § 4º e 35 |
| `artifacts/iaschool-app/src/pages/generate.tsx:410` | Compartilhamento via `wa.me` com nome do aluno e imagem | Lei, arts. 6º, V e 7º, § 2º; Dec., art. 35 |
| `artifacts/iaschool-app/src/lib/data/openai-generation.ts` | Envio das fotos ao backend → OpenAI (`gpt-image-2`) | Lei, art. 7º, § 2º; Dec., art. 11, III |
| `artifacts/iaschool-app/src/pages/admin-prompt.tsx`, `lib/prompt-template.ts` | Prompt de sistema configurável por admin | Dec., art. 11, II e IV |
| `artifacts/iaschool-app/src/pages/approvals.tsx`, `pending-approval.tsx` | Aprovação de cadastro **pela escola** | Não substitui responsável legal (Lei, art. 24) |
| `artifacts/iaschool-app/src/pages/student-area.tsx`, `gallery.tsx` | Aluno vê e baixa os próprios cards | Lei, arts. 16 a 18 (acesso do responsável) |
| `artifacts/iaschool-app/src/lib/data/supabase/` | Camada real de dados | Confirmar RLS por escola e por aluno |
| Repositório inteiro | **Nenhum texto de termos de uso, política de privacidade, consentimento, faixa etária ou canal de denúncia** | Lei, arts. 8º, V, 16, 28, 29; Dec., arts. 12, § 4º e 41 |

## 3. Achados prioritários (rascunho a validar)

**BLOQUEIA — geração de imagem de menor com prompt livre sem salvaguarda**
Base: Lei 15.211/2025, arts. 6º e 23; Decreto 12.880/2026, arts. 11, IV, 16, § 4º e 35.
Evidência: `artifacts/iaschool-app/src/pages/generate.tsx` (prompt auxiliar livre) +
`lib/data/openai-generation.ts`.
Risco: gerar imagem sexualizada, vexatória ou degradante a partir da foto real de
um aluno menor de idade.
Correção mínima: moderação do prompt auxiliar e da imagem de saída, lista de
termos vedados, bloqueio de geração quando o aluno é menor e o prompt toca
corpo/roupa/contexto adulto, e registro auditável de cada geração.

**BLOQUEIA — ausência de consentimento e de vínculo com responsável legal**
Base: Lei, arts. 24 e 12, § 2º; LGPD, art. 14, § 1º.
Evidência: `pages/signup.tsx`, `pages/approvals.tsx`.
Risco: tratamento de foto e dados de criança sem autorização de quem pode dar.
Correção mínima: campo de data de nascimento no cadastro; para menores de 16,
vínculo obrigatório a um responsável legal com registro do consentimento e da
autorização de uso de imagem; aprovação da escola não substitui o responsável.
Nota interpretativa: o art. 24 está no capítulo "Das redes sociais", mas seu
*caput* alcança "produtos ou serviços direcionados a crianças e adolescentes ou
de acesso provável por eles". Leitura conservadora: aplicar. Registre a escolha.

**BLOQUEIA — compartilhamento de imagem de menor por canal não verificado**
Base: Lei, arts. 6º, V e 7º, § 2º; Decreto, art. 35.
Evidência: `pages/generate.tsx:410` (`wa.me`).
Risco: envio da imagem e do nome do aluno a número não verificado, sem prova de
autorização e sem trilha de auditoria.
Correção mínima: só permitir envio a número do responsável registrado e
confirmado; log de quem enviou, para quem e quando; revogação com exclusão do
material.

**CORRIGIR — dados excessivos sobre o aluno**
Base: Lei, art. 7º, § 2º; LGPD, art. 6º, III e art. 14, § 3º.
Evidência: `lib/data/types.ts` (`heightCm`, `weightKg`, `notes`).
Risco: peso e altura de criança são dados de saúde adjacentes, sem finalidade
declarada no produto.
Correção mínima: remover, ou declarar finalidade, restringir visibilidade ao
professor responsável e excluir por padrão ao fim do ciclo escolar.

**CORRIGIR — falta transparência do caráter sintético**
Base: Decreto, art. 11, I.
Evidência: `pages/generate.tsx`, `components/generation-details.tsx`.
Risco: card com foto real do aluno em cena gerada, sem indicação de que é
imagem sintética.
Correção mínima: marca visível de "imagem gerada por IA" na imagem exportada e
na mensagem de compartilhamento.

**CORRIGIR — sem canal de denúncia nem fluxo de remoção**
Base: Lei, arts. 28 a 30; Decreto, arts. 41 e 43.
Evidência: ausente no repositório.
Correção mínima: canal público, gratuito e divulgado; fila com tratamento
prioritário para vítima, representante, MP, polícia e entidade habilitada;
remoção imediata com notificação motivada ao autor e recurso.

**CORRIGIR — sem termos, política, faixa etária e informação de risco**
Base: Lei, arts. 8º, V e 16; Decreto, art. 12, § 4º.
Evidência: ausente no repositório.
Correção mínima: termos de uso e política de privacidade em português com faixa
etária declarada, riscos, dados tratados e canal de contato do responsável.

**OBSERVAR — cards de desempenho e exposição comparativa**
Base: Lei, art. 6º, II; Decreto, art. 35.
Risco: ranking ou métrica de desempenho exposta pode se tornar constrangimento
entre pares.
Ação: decidir se métricas comparativas são visíveis fora do par
professor–responsável.

**OBSERVAR — avaliação de impacto e gestão de risco**
Base: Lei, arts. 8º, I e 16, p. único; Decreto, art. 47.
Ação: produzir avaliação de impacto à segurança e saúde de crianças, com versão
resumida pública. Exigível porque o tratamento (foto + IA) excede o
estritamente necessário à operação.

## 4. O que não se aplica hoje

| Obrigação | Motivo |
| --- | --- |
| Verificação de idade a cada acesso (Lei, art. 9º) | Não há conteúdo proibido para menores de 18 |
| Loot box (Lei, art. 20) | Não há jogo nem caixa de recompensa |
| Relatório semestral de transparência (Lei, art. 31) | Depende de mais de 1 milhão de usuários menores de 18 |
| Sinal de idade via API (Lei, art. 12) | Obrigação de lojas de apps e sistemas operacionais; aqui só o dever de **receber** (art. 14) |
| Adesivo em embalagem (Lei, art. 38) | Não há hardware |
| Representante legal (Lei, art. 40) | Operação brasileira — apenas documentar |

Reavalie esta seção se o produto ganhar interação entre alunos, chat, feed,
monetização, publicidade ou distribuição em loja de aplicativos.
