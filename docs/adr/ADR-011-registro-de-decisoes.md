# ADR-011 · Registro de decisões com status e supersessão

Status: Aceito · Data: 04/10/2026 · Origem: auditoria 360 (C2, C3, C9 de `docs/audit/RULES-INVENTORY.md`)

## Contexto

`.planning/DECISIONS.md` tem 127 entradas em dois formatos, sem status e sem "superado por". A-067 e A-110 (duas pessoas para religar, 60/800) seguem lá sem marca, embora A-125 e A-126 os derrubem. Ramos paralelos usaram o mesmo número (A-123), um número citado não existe (A-117) e `STATE.md` virou um log que envelheceu e passou a contradizer o resto.

## Decisão

1. **Status em toda decisão nova:** `vigente`, `superada por A-###`, `pendente do dono`. Decisões antigas superadas são listadas na seção "Supersessões" de `DECISIONS.md`, sem reescrever as linhas originais.
2. **Reserva de número.** Antes de abrir PR, o número `A-###` é o maior existente em `main` + 1; havendo colisão no merge, quem chegou depois renumera e cita o número antigo.
3. **Emendas do dono.** Specs filhas e rodadas de respostas do dono ganham uma linha em `DECISIONS.md` apontando para elas, para que a supersessão fique num lugar só.
4. **`STATE.md` curto:** estado atual, pendências do dono, próximas ações, degradados. Histórico vai para `DECISIONS.md`, relatórios e `git log`. Reescrito a cada entrega, nunca acumulado.
5. **`progress.json`** fica como histórico do plano P0–P6. Iniciativas novas são acompanhadas no roadmap (`docs/audit/EVOLUTION-ROADMAP.md`) e nos PRs.

## Alternativas consideradas

- Migrar decisões para issues do GitHub: perde o contexto offline que os agentes usam na retomada.
- Reescrever `DECISIONS.md` inteiro num formato só: alto custo, risco de perder nuance, sem ganho imediato.

## Consequências

- Uma leitura de `DECISIONS.md` mostra o que vale sem reconstruir a história.
- O hook de início de sessão continua imprimindo `STATE.md`, agora fiel.
