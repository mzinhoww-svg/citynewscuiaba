-- 0044 · Push: matéria despublicada depois do pedido cancela o envio (spec 2026-09-28 §10.2).
-- Trigger `security definer`: `critical_actor()` devolve null fora de anon/authenticated, então o
-- `guard_push_sends` trata a mudança como do serviço (uma pessoa comum só cancela o que pediu).
create or replace function public.articles_push_unpublish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status not in ('published', 'updated') or new.status in ('published', 'updated') then
    return new;
  end if;
  update push_sends
     set status = 'cancelled', status_reason = 'Matéria despublicada'
   where article_id = new.id
     and status in ('pending_approval', 'queued', 'scheduled', 'paused');
  return new;
end
$$;
revoke execute on function public.articles_push_unpublish() from public, anon, authenticated;
drop trigger if exists articles_push_unpublish on articles;
create trigger articles_push_unpublish after update of status on articles
  for each row execute function public.articles_push_unpublish();
