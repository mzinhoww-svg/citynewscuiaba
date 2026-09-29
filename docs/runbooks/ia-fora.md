# Runbook: IA fora do ar

Use quando o provedor de IA (OpenRouter) está instável, o custo saiu do controle, houve resposta sem fonte ou suspeita de injeção de prompt em escala.

## O que acontece

- `feature_flags.ai_enabled` passa a `false`.
- `callAgent` recusa toda chamada (`disabled`) sem chamar o modelo e sem gastar.
- **Busca com IA** (`/pergunte` e `/api/ask`): responde "indisponível" (sem erro 5xx, sem pedir login) e oferece a busca tradicional. A pergunta não consome o limite por hora.
- **Pipeline**: segue coletando, agrupando e normalizando. A etapa de redação usa o rascunho sem IA (título e trechos das fontes, sem resumo), a matéria vai para **revisão** com o motivo "IA indisponível" e nada publica sozinho. Resumo de agregados e análise de link seguem sem sugestões.
- Índice de busca: itens sem embedding continuam encontráveis por texto (FTS).

## Quem pode

Só **admin**. Operação de IA pode desligar um **agente** específico em Control Center > Agentes (isso não é esta contingência).

## Passo a passo

1. **Administração > Contingência**, cartão "IA (global)", **IA fora do ar**.
2. Motivo; digite `desligar ia`; confirme.

## Como verificar

- Contingência: "IA (global): Desligada".
- Abra `/pergunte?q=Cuiabá` em janela anônima: aparece "A busca com IA está indisponível no momento" e "Resultados da busca tradicional".
- `curl -s "$APP_URL/api/ask?q=farmacias"`: última linha NDJSON com `"aiOff":true`.
- Control Center > Custos: chamadas de IA param de crescer.
- Fila de revisão: novas matérias entram com o motivo "IA indisponível".

## Depois

1. Corrija a causa (chave do provedor, saldo, modelo, orçamento em Control Center > Modelos e Custos).
2. Reprocesse os itens que caíram em rascunho sem IA: Control Center > Filas e falhas > Reprocessar (mantém decisões humanas por padrão).

## Como reverter

**Contingência > Religar a IA**, digite `religar ia`, motivo e confirme. Se o problema é só de um agente, prefira desligar o agente em Control Center > Agentes.

Sem acesso à tela: `update feature_flags set enabled = true, updated_at = now() where key = 'ai_enabled';` (o registro de agentes guarda a flag em cache por poucos segundos).
