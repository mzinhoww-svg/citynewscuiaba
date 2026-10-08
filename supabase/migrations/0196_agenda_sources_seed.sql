-- AGM-T1: fontes de eventos (matriz do Radar v4, spec 2026-10-08-agenda-coletor-multifonte-design.md §3.2).
-- As 3 do Sympla (hoje em src/lib/agenda/sources.ts) entram ativas; as do Radar entram pausadas
-- aguardando ativação no Painel de Fontes (robots, termos, teste de conexão); as inacessíveis entram
-- bloqueadas com o motivo em last_error. `collector_notes` = `avisos` da matriz: dado, nunca instrução.
-- Fora: Sesc MT site institucional (TLS incompleto, agenda velha) e Sebrae loja (cursos).

insert into sources (
  slug, name, base_url, kind, locality, priority, status, status_reason, last_error,
  confirms, extract_kind, event_origin, collector_notes, list_urls, require_city
) values
 ('cine-teatro-cuiaba', 'Cine Teatro Cuiabá', 'https://cineteatrocuiaba.org.br/programacao/', 'events', 'cuiaba', 1,
  'paused', 'pending_activation', null, true, 'ai_page', 'organizer',
  array['Paginação fica no fim do HTML; percorrer /programacao/pagina/1..4/.',
        'Cards não trazem ano e mostram só a data de abertura.',
        'Cards não trazem preço; abrir a página individual do espetáculo.'],
  array['https://cineteatrocuiaba.org.br/programacao/pagina/1/',
        'https://cineteatrocuiaba.org.br/programacao/pagina/2/',
        'https://cineteatrocuiaba.org.br/programacao/pagina/3/',
        'https://cineteatrocuiaba.org.br/programacao/pagina/4/'], false),

 ('sesc-mt-painel', 'Sesc MT (painel de programação)', 'https://painel-programacao.sescmt.com.br/', 'events', 'mt', 1,
  'paused', 'pending_activation', null, true, 'ai_page', 'organizer',
  array['Modelo da URL do painel: https://painel-programacao.sescmt.com.br/?periodoinicial=DD/MM/AAAA; substituir DD/MM/AAAA pela data local do run.',
        'O painel respondeu HTTP 404 em 2026-10-08; reconferir a URL na ativação.'],
  '{}', false),

 ('agencia-sebrae-mt', 'Agência Sebrae MT', 'https://mt.agenciasebrae.com.br/ultimas-noticias/', 'events', 'mt', 1,
  'paused', 'pending_activation', null, true, 'ai_page', 'official',
  array['Também confirma eventos do Centro de Eventos do Pantanal.'], '{}', true),

 ('allure-music-hall', 'Allure Music Hall', 'https://www.alluremusichall.com.br/', 'events', 'cuiaba', 1,
  'paused', 'pending_activation', null, true, 'ai_page', 'organizer',
  array['Preço costuma estar só na bilheteria; abrir o link de ingresso.'], '{}', false),

 ('prime-eventos', 'Prime Eventos', 'https://www.primeeventos.com.br/', 'events', 'cuiaba', 2,
  'paused', 'pending_activation', null, true, 'ai_page', 'organizer', '{}', '{}', false),

 ('prefeitura-chapada', 'Prefeitura de Chapada dos Guimarães', 'https://www.chapadadosguimaraes.mt.gov.br/', 'events', 'mt', 2,
  'paused', 'pending_activation', null, true, 'ai_page', 'official', '{}', '{}', false),

 ('secel-mt', 'SECEL MT (Secretaria de Cultura, Esporte e Lazer)', 'https://www.secel.mt.gov.br/', 'events', 'mt', 2,
  'paused', 'pending_activation', null, true, 'ai_page', 'official',
  array['Coletar via busca; conferir se a matéria é do ano corrente.'], '{}', true),

 ('casa-de-festas', 'Casa de Festas', 'https://www.casadefestas.net/wp-json/tribe/events/v1/events', 'events', 'cuiaba', 2,
  'paused', 'pending_activation', null, false, 'tribe', 'organizer',
  array['Horário estruturado 08:00-17:00 é o horário do balcão do shopping, não do evento.',
        'Slugs são reaproveitados entre edições; conferir ano e data no corpo.',
        'Em conflito, o venue prevalece sobre o agregador.'], '{}', false),

 ('musiva', 'Musiva', 'https://www.musiva.com.br/', 'events', 'cuiaba', 3,
  'paused', 'pending_activation', null, false, 'ai_page', 'organizer', '{}', '{}', true),

 ('bilheteria-digital', 'Bilheteria Digital', 'https://www.bilheteriadigital.com/', 'events', 'cuiaba', 2,
  'paused', 'pending_activation', null, false, 'ai_page', 'organizer',
  array['Listagem não mostra ano; abrir página individual.'], '{}', true),

 ('descubra-mt', 'Descubra MT', 'https://www.descubramt.com.br/', 'events', 'mt', 2,
  'paused', 'pending_activation', null, false, 'ai_page', 'official', '{}', '{}', true),

 ('centro-eventos-pantanal', 'Centro de Eventos do Pantanal', 'https://www.centrodeeventosdopantanal.com.br/', 'events', 'cuiaba', 3,
  'paused', 'pending_activation', null, false, 'ai_page', 'organizer',
  array['Site só renderiza em navegador.', 'Confirmação via Agência Sebrae MT.'], '{}', false),

 ('sympla-cuiaba-1', 'Sympla · Cuiabá', 'https://www.sympla.com.br/eventos/cuiaba-mt', 'events', 'cuiaba', 2,
  'active', null, null, false, 'sympla', 'organizer',
  array['Página pública de busca; robots.txt com Allow: / (verificado em 2026-10-03). Confirmar termos de uso antes de ampliar a frequência.',
        'Página individual do evento é obrigatória; listagem não basta.',
        'Falso positivo de 2025: evento antigo listado como atual.'], '{}', true),

 ('sympla-cuiaba-2', 'Sympla · Cuiabá (página 2)', 'https://www.sympla.com.br/eventos/cuiaba-mt?page=2', 'events', 'cuiaba', 2,
  'active', null, null, false, 'sympla', 'organizer',
  array['Idem Sympla · Cuiabá.'], '{}', true),

 ('sympla-varzea-grande', 'Sympla · Várzea Grande', 'https://www.sympla.com.br/eventos/varzea-grande-mt', 'events', 'varzea-grande', 2,
  'active', null, null, false, 'sympla', 'organizer',
  array['Idem Sympla · Cuiabá.'], '{}', true),

 ('prefeitura-cuiaba-e-eventos', 'Prefeitura de Cuiabá (E-Eventos)', 'https://eventos.cuiaba.mt.gov.br/', 'events', 'cuiaba', 3,
  'blocked', 'other', 'API responde 401; não é agenda pública.', false, 'ai_page', 'official',
  array['API responde 401; não é agenda pública.'], '{}', false),

 ('mapas-mt', 'Mapas Culturais MT', 'https://mapas.mt.gov.br/', 'events', 'mt', 3,
  'blocked', 'other', 'Agenda exige login; bloqueada até existir acesso público.', false, 'ai_page', 'official',
  array['Agenda exige login.'], '{}', false),

 ('cuiaba-tem', 'Cuiabá Tem', 'https://cuiabatem.com.br/', 'events', 'cuiaba', 3,
  'blocked', 'other', 'HTTP 404 desde 2026-07-30; suspensa, reavaliar em auditoria.', false, 'ai_page', 'organizer',
  array['HTTP 404 desde 2026-07-30.'], '{}', false)
on conflict (slug) do nothing;

-- Nome público das 3 do Sympla: o portal diz "Com informações de Sympla" (não a página de busca).
update sources set display_name = 'Sympla'
  where slug in ('sympla-cuiaba-1', 'sympla-cuiaba-2', 'sympla-varzea-grande');

-- Linhas já coletadas guardam a fonte só no texto `source_id` (slug): liga `source_ref` à fonte
-- de eventos de mesmo slug, sem mexer em linha que já tem referência.
-- backfill:start
update event_listings e
  set source_ref = s.id
  from sources s
  where s.kind = 'events'
    and s.slug = e.source_id
    and e.source_ref is null;
-- backfill:end
