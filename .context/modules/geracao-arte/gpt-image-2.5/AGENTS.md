# Edição de imagem no código atual

Submódulo de `geracao-arte`, sem pasta de produto. **Revisado em 25/10/2026.**
Este arquivo descreve o payload do repositório, não a disponibilidade,
capacidades máximas ou preços atuais do provedor.

## Wizard em lote

Fonte: `artifacts/api-server/src/lib/generation-batch-process.ts`.
`client.images.edit` recebe `model: "gpt-image-2.5-flare"`, `size: "1024x1024"`,
`image: [modeloDeEstilo, fotoDoAluno]` e prompt composto pelo servidor.
As duas imagens são PNG normalizado; resposta usa `data[0].b64_json`.
Não envia `quality`, `background`, `n`, `output_format` ou `input_fidelity`.
`OPENAI_API_KEY` só no servidor; SDK sem retry automático, timeout de 150 s.

Modelo pertence à escola, foto vem de ID validado (perfil, evento individual
revisado ou referência facial). Identidade é orientação ao modelo, sem
promessa de pixels idênticos. Texto livre até 3000 caracteres; prompt composto
até 3500; lote de 1–50 alunos. Contrato em `docs/api.md` e no módulo `api`.

## Caminhos legados

`artifacts/api-server/src/routes/generation.ts` mantém:

- `photo_prompt`: uma foto inteira + prompt, enviada à IA.
- `original-pixels-v1`: dois anexos; só o modelo de estilo vai à IA para gerar fundo. A pessoa é composta no servidor, com verificação dos pixels protegidos.

Esses caminhos têm parser multipart próprio (até seis imagens, 8 MiB por
arquivo, 24 MiB total, prompt até 4000); cada modo exige sua quantidade exata.
Não são o fluxo atual do wizard. O template administrativo legado não entra
na geração em lote.

## Estado e manutenção

Registro de publicação API v7/app em 16/10/2026, sem geração paga do novo
fluxo com modelo. O ensaio real de 12/10 corresponde à versão anterior.
Uma troca de modelo ou avaliação de preço exige consultar a documentação
atual do provedor e atualizar os consumidores, com autorização de custo para
ensaio real. Esta revisão não mudou código nem fez chamada paga.
