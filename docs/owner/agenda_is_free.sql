-- AGE-T1: troca a coluna gerada is_free (preço desconhecido nunca vale como gratuito).
-- Cole no SQL Editor do Supabase (a tabela event_listings está sem linhas; o conector do assistente
-- segura comandos DROP para confirmação).
begin;
alter table event_listings drop column is_free;
alter table event_listings
  add column is_free boolean generated always as (coalesce(price_cents, 0) = 0 and not price_unknown) stored;
commit;
