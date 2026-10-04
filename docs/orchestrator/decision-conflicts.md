# Conflitos de decisão

| # | Conflito | Decisão mais recente válida | Estado do sistema | Reconciliação |
|---|---|---|---|---|
| 1 | Duas pessoas para mudar regras (CLAUDE.md antigo, spec mestre §8, A-027, A-067, A-068) × uma pessoa (A-128) | **A-128** (04/10, dono) | Código e banco (0149) seguem A-128; spec mestre, `architecture.md`, `screens.md`, `PRODUCT.md` e specs de painel/PWA seguem a regra antiga | Atualizar documentos com "substituído por A-128" (L-011) |
| 2 | Religar `auto_publish` com segunda pessoa (A-067) × ação direta do admin (A-125) | **A-125** | 0145 aplicada; `approval_apply` ainda aceita alvo `flag:` (legado, sem chamador ativo) | Marcar A-067 como substituída; caminho `flag:` OBSOLETE |
| 3 | Banco recusa ativar fonte sem termos (0033) × A-127 | **A-127** | 0148 e 0149 aplicadas | Fechado no banco; o Painel de Fontes segue pedindo a caixa de termos na tela (decisão do dono) |
| 4 | Disjuntor 60/800 (A-110) × 300/3.000 (A-126) | **A-126** | Padrão da tabela 300/3.000 (0146); linha ativa ainda 60/800 | Rodar `recuperar-materias-v2.sql` (L-009) |
| 5 | A-128 diz "a linha de `approvals` guarda quem pediu e quem aprovou" × caminho direto `update rules`/`rec_weights` sem linha em `approvals` | **A-128** (registro de quem fez) | Banco aceita o caminho direto sem auditoria (`rls-two-person.test.ts` documenta) | Proposta técnica: trigger de auditoria em `rules` e `rec_weights` (grava `audit_log` em toda aprovação/ativação) e exigir `admin` no banco quando a versão afrouxa Segurança. Não altera quem pode, só garante o registro que A-128 promete |
| 6 | Numeração: "A-128" antigo na branch não mesclada `claude/optimistic-ramanujan-ckpt98` (fixtures e2e) × A-128 do main | A-128 do **main** | PR #2 (rascunho, 42 commits atrás) | PR #2 é OBSOLETE como veículo; não reaproveitar a numeração |
| 7 | Numeração duplicada: A-123 usada para Estúdio no celular e, em mensagens de commit, para a reescrita (depois renomeada A-126); A-119 duplicada no STATE | DECISIONS.md é a referência | — | Só histórico; sem efeito em código |
