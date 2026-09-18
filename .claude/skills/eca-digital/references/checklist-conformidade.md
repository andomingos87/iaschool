# Checklist de conformidade — ECA Digital

Use item a item. Cada linha exige **evidência no repositório** (arquivo, rota,
schema, política, texto de UI). Sem evidência: `LACUNA`.

Legenda de severidade: **B** bloqueia entrega · **C** corrigir antes de expor a
menores · **O** observar/planejar.

## A. Enquadramento e governança

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| A1 | Enquadramento documentado: direcionado a menores ou de acesso provável | Lei 1º | B |
| A2 | Faixa etária declarada e classificação indicativa informada nos termos de uso e no acesso | Lei 8º, V; Dec. 12, § 4º | C |
| A3 | Representante legal no Brasil (se operação estrangeira) | Lei 40 | B |
| A4 | Regras documentadas de tratamento de dados de crianças e adolescentes | Lei 25 | C |
| A5 | Gestão de riscos formalizada sobre funcionalidades e sistemas | Lei 8º, I | C |
| A6 | Avaliação de impacto à segurança e saúde de menores + versão resumida pública | Lei 16, p. ú.; Dec. 47 | C |
| A7 | Relatório semestral de transparência se > 1 milhão de usuários menores de 18 | Lei 31 | O |

## B. Idade e conta

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| B1 | Nenhum fluxo trata autodeclaração como verificação onde a lei exige verificação | Lei 9º, § 1º | B |
| B2 | Mecanismo próprio de bloqueio etário, independente de SO/loja | Lei 14, p. ú. | C |
| B3 | Capacidade de receber e aplicar sinal de idade; divergência resolvida pela via mais protetiva | Dec. 25, § 4º; 26 | O |
| B4 | Dados de aferição usados só para aferir idade; sem retenção de documento ou selfie | Lei 13; Dec. 24, § 3º | B |
| B5 | Caminho de contestação da idade aferida | Dec. 27 | C |
| B6 | Conta de usuário com até 16 anos vinculada à conta de responsável legal | Lei 24 | B |
| B7 | Sem conta do responsável, é impossível reduzir o nível de proteção padrão | Lei 24, § 5º | C |
| B8 | Fluxo de suspensão + apelação célere diante de indício de conta de menor irregular | Lei 24, § 4º | C |
| B9 | Consentimento do responsável obtido de forma ativa; silêncio não vale como autorização | Lei 12, § 2º | C |

## C. Dados pessoais

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| C1 | Configuração-padrão no grau mais elevado de privacidade | Lei 3º, 7º | B |
| C2 | Coleta minimizada: cada campo de dado de menor tem finalidade declarada e necessária | Lei 7º, § 2º; LGPD 6º | C |
| C3 | Sem perfil comportamental de menor para publicidade | Lei 22, 26; Dec. 33 | B |
| C4 | Geolocalização restrita por padrão, com aviso prévio e claro | Lei 17, § 4º, VI | C |
| C5 | Foto, vídeo e biometria de menor: base legal, escopo, retenção e exclusão definidos | LGPD 14; Lei 7º | B |
| C6 | Compartilhamento com terceiros (IA, storage, mensageria) mapeado e minimizado | Lei 7º, § 2º | C |

## D. Design e uso compulsivo

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| D1 | Sem autoplay ou carregamento de conteúdo novo sem solicitação | Dec. 9º, p. ú., II | C |
| D2 | Sem recompensa por tempo de uso ou streak | Dec. 9º, p. ú., III | C |
| D3 | Pontos naturais de parada visíveis | Dec. 9º, p. ú., I | C |
| D4 | Notificações limitadas e configuráveis | Dec. 9º, p. ú., IV | C |
| D5 | Cancelar conta, sair e mudar preferências em caminho curto e simétrico ao de adesão | Dec. 10, p. ú., I | C |
| D6 | Sem urgência fabricada, pressão emocional ou escolha enviesada | Dec. 10, p. ú., II | C |
| D7 | Controles de privacidade e supervisão parental visíveis, não escondidos em submenus | Dec. 10, p. ú., III; Lei 18, § 2º | C |
| D8 | Recomendação personalizada desativável | Lei 17, § 4º, V | C |

## E. Supervisão parental

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| E1 | Ferramentas parentais existem, são gratuitas e acessíveis sem aquisição do produto | Lei 16, 17, I | B |
| E2 | Aviso claro e visível quando a supervisão está ativa e quais controles se aplicam | Lei 17, III | C |
| E3 | Limitar e monitorar tempo de uso; métricas consolidadas | Lei 17, IV; 18, IV | C |
| E4 | Responsável pode ver e configurar conta e privacidade do menor | Lei 18, I | C |
| E5 | Responsável pode restringir compras e transações | Lei 18, II | C |
| E6 | Responsável pode identificar adultos com quem o menor se comunica | Lei 18, III | C |
| E7 | Restrição, por padrão, de comunicação por usuários não autorizados | Lei 17, § 4º, I | B |
| E8 | Tudo em língua portuguesa | Lei 18, VI | C |

## F. Conteúdo, IA e publicidade

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| F1 | Medidas desde a concepção contra os seis grupos de conteúdo do art. 6º | Lei 6º | B |
| F2 | Conteúdo proibido bloqueado por verificação eficaz; conta de menor vedada quando aplicável | Dec. 15 | B |
| F3 | Saída de IA generativa identificada como sintética e automatizada | Dec. 11, I | C |
| F4 | IA: prevenção de manipulação comportamental + avaliação de risco algorítmico documentada | Dec. 11, II e III | C |
| F5 | IA: salvaguardas de conteúdo (sexual, violência, automutilação) com revisão periódica por especialistas | Dec. 11, IV; Lei 17, § 4º, VIII | B |
| F6 | Nenhum fluxo permite gerar ou trocar conteúdo sexualizado envolvendo menor — inclusive por IA | Lei 23; Dec. 16, § 4º; Dec. 35 | B |
| F7 | Publicidade sem perfilamento, análise emocional, AR/VR/XR direcionada a menores | Lei 22; Dec. 33 | B |
| F8 | Conteúdo monetizado que explore imagem ou rotina de menor exige autorização judicial | Dec. 34 | C |
| F9 | Sem loot box em produto de acesso provável por menores | Lei 20; Dec. 23 | B |

## G. Denúncia, remoção e crimes

| # | Item | Base | Sev. |
| --- | --- | --- | --- |
| G1 | Canal de denúncia acessível, gratuito, divulgado e público | Lei 28; Dec. 41 | B |
| G2 | Fluxo de remoção sem ordem judicial ao ser notificado por legitimado (vítima, MP, polícia, entidade habilitada) | Lei 29; Dec. 43 | B |
| G3 | Notificação exige identificação técnica do conteúdo e do notificante; sem anonimato | Lei 29, § 2º | C |
| G4 | Devido processo ao autor: notificação, motivação, indicação de decisão humana ou automatizada, recurso e prazos | Lei 30 | C |
| G5 | Detecção, remoção e comunicação de exploração, abuso sexual, sequestro e aliciamento ao Centro Nacional (PF) | Lei 27; Dec. 36, 42 | B |
| G6 | Retenção de conteúdo e dados associados ao relatório, no prazo do Marco Civil | Lei 27, § 2º | C |
| G7 | Mecanismo antiabuso do canal de denúncia, com critérios, recurso e registro | Lei 32, 33 | O |

## H. Saída do parecer

Para cada item marcado como LACUNA ou CORRIGIR, produza o bloco do Passo 4 do
`SKILL.md`. Não agregue itens de severidades diferentes no mesmo achado.
