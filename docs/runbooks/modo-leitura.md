# Runbook: modo leitura do Estúdio

Use quando o banco está instável, há suspeita de corrupção ou de credencial vazada, durante uma migração arriscada ou um restore. O objetivo é impedir gravações sem tirar o portal do ar.

## O que acontece

- `feature_flags.read_only` passa a `true`.
- O Estúdio e o Control Center **leem** normalmente, mas as Server Actions de escrita respondem "O Estúdio está em modo leitura: nenhuma alteração foi gravada." Isso vale para salvar, publicar, atribuir, aprovar item, configurar fontes, usuários, equipes, taxonomia, home, publicidade, SEO e configurações.
- O portal público continua lendo (cache e leitura direta). Leitores continuam navegando, pesquisando e usando a busca; login nunca é exigido.
- O pipeline não publica sozinho enquanto o modo estiver ativo (as decisões vão para revisão).
- A tela de **Contingência** não é bloqueada, para você poder desligar o modo.
- Aprovações (Control Center > Aprovações) continuam liberadas: são o caminho do rollback de regras.

## Quem pode

Só **admin**.

## Passo a passo

1. **Administração > Contingência**.
2. No cartão "Modo leitura do Estúdio", **Ativar modo leitura**.
3. Motivo em uma frase; digite `ativar modo leitura`; confirme.
4. Avise a redação (canal da equipe) que nada será gravado até novo aviso.

## Como verificar

- Tela de Contingência: "Modo leitura do Estúdio: Ligada".
- Tente uma escrita simples (por exemplo, criar uma equipe em **Administração > Equipes**): deve voltar com o aviso de modo leitura e nada gravado.
- Abra o portal (`/`) em janela anônima: a home carrega.
- Auditoria: ação `flag.set`, objeto `flag:read_only`.

## Como reverter

Em **Contingência**, **Desativar modo leitura**, digite `desativar modo leitura`, motivo e confirme. Repita a escrita de teste para conferir.

Se ninguém consegue abrir a tela (sessão de admin perdida), com acesso ao banco: `update feature_flags set enabled = false, updated_at = now() where key = 'read_only';` (o Estúdio lê a flag a cada escrita, sem cache).

## Limites conhecidos

- A leitura da flag falha fechada: se o banco não responder, o Estúdio se comporta como em modo leitura (e a gravação também falharia).
- Execuções do playground e de avaliações de IA (Control Center) não gravam matéria e não são bloqueadas.
- A rota do tick (`/api/ingest/tick`) confere `read_only` antes de `publishDueScheduled`: em modo leitura as agendadas vencidas ficam pendentes e saem quando o modo é desligado. O job `citynews-publish-scheduled` do pg_cron chama `publish_due_scheduled()` direto no banco; nas tabelas de escrita da equipe vale o `guard_read_only` (migration 0038, frente A).
