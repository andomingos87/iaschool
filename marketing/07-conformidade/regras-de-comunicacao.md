# Regras de comunicação

**Status:** Definido. Vale para landing, post, e-mail, apresentação e demo.

Este arquivo é assessoria técnica de produto, não parecer jurídico. Textos
sobre lei, autorização e dados de criança passam por revisão jurídica antes de
publicar.

## Regras

1. **Sem foto real de criança ou adolescente** em nenhuma peça. Regra do projeto
   até as [pendências de produção](../../docs/pendencias-producao.md) fecharem.
2. **Sem declarar conformidade** com o ECA Digital, a LGPD ou qualquer lei. Descreva
   o que o produto faz (autorização por finalidade, revogação, registro).
3. **Sem número que não foi medido:** volume, velocidade, taxa de acerto, horas economizadas.
4. **Sem depoimento, logo ou caso inventado.** Prova social só com cliente real e autorização escrita.
5. **Sem anunciar entrega por WhatsApp.** O envio comercial está desligado.
6. **Sem prometer recurso que não está publicado.** Exemplo: álbum agrupado por evento, cadastro em massa.
7. **Arte com IA** sempre descrita como imagem gerada por inteligência artificial.
8. **Convite à ação** é demonstração ou piloto com material de teste, não "use com seus alunos agora".

## Achados na landing atual

Revisão de 31/10/2026 em [`landing.tsx`](../../artifacts/iaschool-app/src/pages/landing.tsx),
pela skill `eca-digital`. Proposta de texto em
[copy da landing v2](../03-canais/landing/copy-landing-v2.md).

```
[BLOQUEIA] "Nunca as de outro aluno" contradiz a entrega com fotos nítidas
Base: Lei 15.211/2025, art. 16 (informar riscos a pais e responsáveis) e art. 3º; LGPD, art. 14 (melhor interesse)
Evidência: artifacts/iaschool-app/src/pages/landing.tsx:278 e :303-305; entrega atual usa fotos nítidas, sem desfoque (docs/pendencias-producao.md, item 1)
Risco: a família lê que nenhuma outra criança aparece, mas colegas aparecem em foto de grupo; a família do colega não sabe que a imagem do filho vai para outra casa
Correção mínima: trocar o texto pelo da copy v2 e homologar o novo termo de entrega antes de publicar
```

```
[CORRIGIR] Afirmação de que a plataforma segue as regras do ECA Digital
Base: regra da skill eca-digital (não declarar conformidade); homologação jurídica pendente (docs/pendencias-producao.md, item 5)
Evidência: artifacts/iaschool-app/src/pages/landing.tsx:490
Risco: promessa de conformidade que ninguém homologou, lida pela escola como garantia
Correção mínima: remover a frase até a revisão jurídica; descrever os controles no lugar
```

```
[CORRIGIR] "Toda imagem gerada por IA sai identificada como tal"
Base: Decreto 12.880/2026, art. 11, I (transparência do caráter sintético), aplicabilidade a confirmar
Evidência: aviso só na mensagem de compartilhamento, artifacts/iaschool-app/src/config/iaschool.ts:47-48; promessa em landing.tsx:260 e :279
Risco: a imagem baixada circula sem aviso, e a página promete mais do que o produto faz
Correção mínima: dizer que a mensagem de compartilhamento avisa; marcar a própria imagem é decisão de produto à parte
```

## Outras promessas sem base no produto

| Trecho | Arquivo | Problema |
| --- | --- | --- |
| "separar milhares de fotos" | `landing.tsx:248` | Volume não medido |
| "filtra por evento", "agrupadas por evento" | `landing.tsx:241` e `:255` | Álbum agrupado por evento só existe no código local |
| "baixam quando quiserem" | `landing.tsx:286` | Acesso tem prazo e a escola define a retenção |
| "Leve o próximo evento da sua escola" | `landing.tsx:549` | Foto real de aluno ainda não é permitida |
| "As fotos do evento ficam prontas em minutos" | PDF de cores e tipografia da marca | Texto de exemplo do PDF; tempo não medido, não reutilizar |
