-- AGM-T8 (spec 2026-10-08-agenda-coletor-multifonte-design.md §7): a tela pública do evento diz
-- de qual fonte veio e quem confirmou. `sources` só é legível pela equipe e `public_sources`
-- esconde as fontes de eventos, então esta visão expõe só id, nome público e se a fonte confirma.
-- Sem filtro de status nem de arquivamento: fonte bloqueada ou arquivada depois continua com o nome
-- visível nos eventos já publicados (origem sempre visível).
create or replace view public_event_sources as
  select s.id, coalesce(s.display_name, s.name) as name, s.confirms
  from sources s
  where s.kind = 'events';

revoke all on public_event_sources from anon, authenticated;
grant select on public_event_sources to anon, authenticated, service_role;
