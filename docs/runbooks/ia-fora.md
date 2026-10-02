# Runbook · Busca com IA fora

**Botão:** Governança → Contingência → "Desligar busca com IA" (só admin; confirma digitando `DESLIGAR BUSCA COM IA` e informa o motivo).

## O que acontece

1. `feature_flags.ai_enabled = false`; auditoria `flag.set` com o motivo.
2. `/pergunte` responde "A busca com IA está desligada no momento" com o texto "A redação pausou a busca com IA. A busca tradicional continua funcionando." e os resultados da busca tradicional logo abaixo. Nenhuma chamada ao provedor é feita.
3. A busca tradicional (`/buscar`) e o portal continuam. O pipeline de matérias não é afetado por esta flag (para pausar publicação, use o runbook `pausar-automatico.md`).

## Quando usar

- Provedor (OpenRouter) fora ou com latência acima do p95 aceito.
- Resposta errada publicada pela busca com IA (denúncia procedente).
- Orçamento diário de IA estourado antes da hora (Control Center → Custos).

## Como voltar ao normal

"Ligar busca com IA" na mesma tela (`LIGAR BUSCA COM IA`). Antes, rode a avaliação de regressão (Control Center → Avaliações) com a versão de prompt ativa.
