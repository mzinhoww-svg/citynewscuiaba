# Runbook · Modo leitura

**Botão:** Governança → Contingência → "Ativar modo leitura" (só admin; confirma digitando `MODO LEITURA` e informa o motivo).

## O que acontece

1. `feature_flags.read_only = true`; auditoria `flag.set` com o motivo.
2. Toda Server Action do Estúdio que passa por `studioAction` (fila, editor, publicação, correções, mídia, moderação, Control Center, aprovações) devolve `conflict` com a mensagem "O Estúdio está em modo leitura…". Nada é gravado.
3. O pipeline não publica (a etapa 17 confere `read_only`) e a etapa 15 manda para revisão.
4. O portal público continua servindo o que já está publicado (cache de dados do Next e ISR); leitura anônima, busca e agenda seguem normais.
5. Só as ações de contingência continuam valendo (`allowReadOnly`), para dar para sair do modo.

## Quando usar

- Incidente de banco (migração em curso, restauração, latência anormal).
- Suspeita de conta comprometida na equipe: liga o modo leitura, revoga a sessão e investiga na auditoria.

## Como voltar ao normal

"Sair do modo leitura" na mesma tela (`SAIR DO MODO LEITURA`). Sem aprovação dupla: restaurar a escrita não reduz nenhuma proteção.

## Limite conhecido

As Server Actions do Painel de Fontes (`/estudio/control/fontes`) têm contexto próprio e não passam por `studioAction`; a RLS e os triggers do banco continuam valendo, mas o bloqueio por flag não se aplica a elas nesta versão.
