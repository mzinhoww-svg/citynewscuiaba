# Runbook: pausar a publicação automática

Use quando o motor publicou (ou está para publicar) algo errado, uma fonte foi comprometida, uma regra nova se comporta mal ou há um fato em andamento que exige mão humana em tudo.

## O que acontece

- `feature_flags.auto_publish` passa a `false`.
- O ciclo em andamento não é interrompido. Os itens que ainda não foram decididos vão para a fila de revisão com a regra `auto_publish_off`. Os que já estavam decididos para publicar são reconferidos na etapa `publish` e também voltam para revisão.
- Nada publica sozinho até você retomar. Matérias já publicadas continuam no ar (para tirar uma delas, use "Despublicar" na fila do Estúdio).
- Segurança e notícia urgente nunca publicavam sozinhas; isso não muda.

## Quem pode

Só a pessoa com papel **admin** (a RLS de `feature_flags` também exige admin). Editor-chefe pode despublicar matérias individuais, mas não aciona este botão.

## Passo a passo

1. Entre no Estúdio e abra **Administração > Contingência** (`/estudio/admin/contingencia`).
2. No cartão "Publicação automática", clique em **Pausar publicação automática**.
3. Escreva o motivo em uma frase (fica na auditoria).
4. Digite exatamente `pausar publicação automática` e confirme. O botão só habilita com o texto idêntico.
5. A tabela "Estado atual" passa a mostrar "Desligada", com seu nome e a hora.

## Como verificar

- Tela: a linha "Publicação automática" mostra "Desligada" e quem mudou.
- Control Center > **Execuções**: o próximo ciclo mostra decisões `auto_publish_off` na etapa de regras.
- Auditoria (**Administração > Auditoria**, ação `flag.set`, objeto `flag:auto_publish`): valor `false`, valor anterior e motivo.
- SQL de conferência (somente leitura): `select key, enabled, updated_by, updated_at from feature_flags where key = 'auto_publish';`

## O que fazer depois

1. Trate a causa (fonte, regra, prompt). Para regras, veja [rollback-regras](rollback-regras.md).
2. Esvazie a fila de revisão que se formou (Estúdio > Fila de matérias).

## Como reverter

Em **Contingência**, o cartão passa a oferecer **Retomar publicação automática**. Digite `retomar publicação automática`, informe o motivo e confirme. As regras ativas voltam a decidir.

Se a tela estiver indisponível, um admin com acesso ao banco pode rodar:
`update feature_flags set enabled = true, updated_at = now() where key = 'auto_publish';`
e registrar o motivo na pendência do plantão (a linha de auditoria não é criada pelo SQL direto).
