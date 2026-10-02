-- Conta opcional do leitor (P2-T11, spec §5.4, docs/screens.md C06).
--
-- Seguidas, salvos, alertas e coleções pessoais já têm tabela própria (0001, dono em owner_ref =
-- auth.uid()::text, RLS em 0002). O que não tem tabela e vem do perfil deste navegador quando o
-- leitor marca na migração fica em profiles.preferences:
--   { "interests": [{ "key", "evidence", "weak" }], "hidden": [{ "sourceSlug", "reason" }],
--     "history": [{ "ref", "at", "seconds", "scrollPct", "section"?, "sourceSlug"? }] }
-- Só o próprio leitor lê e grava (profiles_read_self / profiles_update_self). Nada sensível é
-- inferido: interesses são editorias lidas, com a evidência que o leitor viu antes de levar.

alter table profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select from pg_constraint where conname = 'profiles_preferences_shape') then
    alter table profiles add constraint profiles_preferences_shape
      check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) <= 262144);
  end if;
end $$;
