-- ARD-T3 (spec 2026-10-08-agenda-rica-e-distribuicao-design.md §5, Guia): um só conjunto de
-- candidatos para o vínculo evento → lugar do Guia. A coleta (service role) e o Estúdio (editor da
-- Agenda, que pela RLS de `venues` só enxerga lugares públicos) leem os mesmos lugares ativos,
-- públicos ou não: um homônimo não público torna o nome ambíguo nos dois caminhos.
-- Só id, nome e estado; só o sistema ou quem edita a seção `agenda` (mesmo predicado de
-- `event_listings_write`).
create or replace function public.agenda_venue_candidates()
returns table (id uuid, name text, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.caller_is_system()
    or (auth.uid() is not null and public.can_edit_section(auth.uid(), 'agenda'))
  ) then
    raise exception 'agenda_venue_candidates: sem permissão' using errcode = '42501';
  end if;
  return query
    select v.id, v.name, v.status
      from public.venues v
     where v.status = 'active';
end
$$;

revoke execute on function public.agenda_venue_candidates() from public, anon;
grant execute on function public.agenda_venue_candidates() to authenticated, service_role;
