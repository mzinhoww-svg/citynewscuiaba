-- Revisão do gate P2 (I2): histórico, interesses e ocultações do leitor eram lidos por toda a
-- equipe (profiles_read_staff libera a linha inteira de profiles). Passam para uma tabela só do
-- leitor, junto com o vínculo migrated_from_anon (que liga eventos pseudônimos à conta).
--
-- reader_preferences: sem política para a equipe, nem para admin. Nada no produto precisa que a
-- redação leia essas preferências; o acesso fora do próprio leitor é só service role (exportação
-- e exclusão da conta, em rotas de servidor). profiles fica com o que é de exibição.

create table if not exists reader_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  migrated_from_anon uuid,
  updated_at timestamptz not null default now(),
  constraint reader_preferences_shape
    check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) <= 262144)
);

alter table reader_preferences enable row level security;

drop policy if exists reader_preferences_self_select on reader_preferences;
drop policy if exists reader_preferences_self_insert on reader_preferences;
drop policy if exists reader_preferences_self_update on reader_preferences;
drop policy if exists reader_preferences_self_delete on reader_preferences;
create policy reader_preferences_self_select on reader_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy reader_preferences_self_insert on reader_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy reader_preferences_self_update on reader_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reader_preferences_self_delete on reader_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on reader_preferences from anon;
grant select, insert, update, delete on reader_preferences to authenticated;
grant all on reader_preferences to service_role;

-- Leva o que já existe e tira as colunas de profiles (a equipe continua lendo nome e bairro).
do $$ begin
  if exists (select from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferences') then
    insert into reader_preferences (user_id, preferences, migrated_from_anon)
    select id, preferences, migrated_from_anon from profiles
     where preferences <> '{}'::jsonb or migrated_from_anon is not null
    on conflict (user_id) do nothing;
    alter table profiles drop constraint if exists profiles_preferences_shape;
    alter table profiles drop column preferences;
  end if;
  if exists (select from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'migrated_from_anon') then
    alter table profiles drop column migrated_from_anon;
  end if;
end $$;
