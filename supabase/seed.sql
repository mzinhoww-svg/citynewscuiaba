-- CityNews Cuiabá · seed FICTÍCIO para desenvolvimento, testes e CI (P0 Task 7; spec §9).
-- Nunca contém fontes reais: elas ficam em seed_sources_real.sql (pnpm db:seed:sources, só staging e produção).
-- Toda manchete aqui é inventada e atribuída apenas a veículos fictícios (*.example).
-- Usuários de seed: e-mail <nome.sobrenome>@citynews.local, senha local `citynews-local-123` (só banco local).
-- Roda como postgres no Supabase real (supabase db reset) e na pilha local (scripts/db-reset.mjs).

-- ---------------------------------------------------------------------------
-- Editorias
-- ---------------------------------------------------------------------------
insert into sections (slug, name, parent_slug, autonomy_category) values
 ('cidade','Cidade',null,'cidade'), ('politica','Política',null,'politica'), ('economia','Economia',null,'economia'),
 ('cultura','Cultura',null,'cultura'), ('esportes','Esportes',null,'esportes'), ('entretenimento','Entretenimento',null,'cultura'),
 ('gastronomia','Gastronomia',null,'cultura'), ('servicos','Serviços',null,'servicos'), ('guia-cuiaba','Guia Cuiabá',null,'servicos'),
 ('seguranca','Segurança',null,'seguranca'), ('saude','Saúde',null,'saude'), ('agenda','Agenda',null,'agenda'), ('clima','Clima','servicos','clima');

-- ---------------------------------------------------------------------------
-- Fontes fictícias (spec §9): 6 com summary_2_sentences (2 oficiais), 3 com imagem with_agreement
-- ---------------------------------------------------------------------------
insert into sources (id, slug, name, base_url, kind, feed_url, categories, locality, reliability, image_policy, republish_policy, may_be_sole_source, agreement_until) values
 ('c5000000-0000-4000-8000-000000000001','folha-do-cerrado','Folha do Cerrado','https://folhadocerrado.example','rss','https://folhadocerrado.example/feed','{politica,cidade}','cuiaba','verified','with_agreement','summary_2_sentences',false,'2026-12-31'),
 ('c5000000-0000-4000-8000-000000000002','diario-da-baixada','Diário da Baixada','https://diariodabaixada.example','rss','https://diariodabaixada.example/rss','{cidade}','cuiaba','verified','none','summary_2_sentences',false,'2026-12-31'),
 ('c5000000-0000-4000-8000-000000000003','mt-agora','MT Agora','https://mtagora.example','sitemap','https://mtagora.example/sitemap-news.xml','{cidade,economia,politica}','mt','verified','with_agreement','summary_2_sentences',false,'2027-03-31'),
 ('c5000000-0000-4000-8000-000000000004','portal-varzea','Portal Várzea','https://portalvarzea.example','rss','https://portalvarzea.example/feed','{cidade}','varzea-grande','standard','none','link_only',false,null),
 ('c5000000-0000-4000-8000-000000000005','radio-pantanal','Rádio Pantanal','https://radiopantanal.example','page',null,'{cidade,esportes}','cuiaba','standard','none','link_only',false,null),
 ('c5000000-0000-4000-8000-000000000006','correio-mato-grossense','Correio Mato-grossense','https://correiomt.example','rss','https://correiomt.example/rss','{economia,cidade}','mt','standard','none','link_only',false,null),
 ('c5000000-0000-4000-8000-000000000007','agro-em-pauta-mt','Agro em Pauta MT','https://agroempauta.example','rss','https://agroempauta.example/feed','{economia}','mt','verified','with_agreement','summary_2_sentences',false,'2026-12-31'),
 ('c5000000-0000-4000-8000-000000000008','cena-cuiabana','Cena Cuiabana','https://cenacuiabana.example','rss','https://cenacuiabana.example/feed','{cultura}','cuiaba','standard','none','link_only',false,null),
 ('c5000000-0000-4000-8000-000000000009','placar-mt','Placar MT','https://placarmt.example','rss','https://placarmt.example/rss','{esportes}','mt','standard','none','link_only',false,null),
 ('c5000000-0000-4000-8000-000000000010','agencia-mt','Agência MT (governo)','https://agenciamt.example','api','https://agenciamt.example/api/noticias','{cidade,servicos,agenda,clima}','mt','primary','licensed_only','summary_2_sentences',true,null),
 ('c5000000-0000-4000-8000-000000000011','diario-oficial-de-cuiaba','Diário Oficial de Cuiabá','https://diariooficial.example','api','https://diariooficial.example/api/atos','{politica,cidade}','cuiaba','primary','none','summary_2_sentences',true,null),
 ('c5000000-0000-4000-8000-000000000012','brasil-hoje','Brasil Hoje','https://brasilhoje.example','rss','https://brasilhoje.example/feed','{economia,politica}','nacional','standard','none','link_only',false,null);

-- ---------------------------------------------------------------------------
-- Usuários de seed (spec §9) · senha local citynews-local-123
-- ---------------------------------------------------------------------------
with people (id, email, full_name) as (values
  ('c1000000-0000-4000-8000-000000000001'::uuid, 'helena.costa@citynews.local', 'Helena Costa'),
  ('c1000000-0000-4000-8000-000000000002'::uuid, 'marina.arruda@citynews.local', 'Marina Arruda'),
  ('c1000000-0000-4000-8000-000000000003'::uuid, 'otavio.reis@citynews.local', 'Otávio Reis'),
  ('c1000000-0000-4000-8000-000000000004'::uuid, 'juliana.campos@citynews.local', 'Juliana Campos'),
  ('c1000000-0000-4000-8000-000000000005'::uuid, 'rafael.siqueira@citynews.local', 'Rafael Siqueira'),
  ('c1000000-0000-4000-8000-000000000006'::uuid, 'beatriz.lemos@citynews.local', 'Beatriz Lemos'),
  ('c1000000-0000-4000-8000-000000000007'::uuid, 'diego.prado@citynews.local', 'Diego Prado'),
  ('c1000000-0000-4000-8000-000000000008'::uuid, 'thiago.moraes@citynews.local', 'Thiago Moraes'),
  ('c1000000-0000-4000-8000-000000000009'::uuid, 'carlos.nunes@citynews.local', 'Carlos Nunes'),
  ('c1000000-0000-4000-8000-000000000010'::uuid, 'paulo.rezende@citynews.local', 'Paulo Rezende')
), new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select '00000000-0000-0000-0000-000000000000'::uuid, p.id, 'authenticated', 'authenticated', p.email,
         crypt('citynews-local-123', gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p.full_name), now(), now(),
         '', '', '', '', '', '', '', ''
  from people p
  returning id, email
)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from new_users u;

insert into profiles (id, display_name, neighborhood) values
 ('c1000000-0000-4000-8000-000000000001','Helena Costa','Jardim Itália'),
 ('c1000000-0000-4000-8000-000000000002','Marina Arruda','Centro Norte'),
 ('c1000000-0000-4000-8000-000000000003','Otávio Reis','Porto'),
 ('c1000000-0000-4000-8000-000000000004','Juliana Campos','CPA'),
 ('c1000000-0000-4000-8000-000000000005','Rafael Siqueira','Coxipó'),
 ('c1000000-0000-4000-8000-000000000006','Beatriz Lemos','Boa Esperança'),
 ('c1000000-0000-4000-8000-000000000007','Diego Prado','Goiabeiras'),
 ('c1000000-0000-4000-8000-000000000008','Thiago Moraes','Jardim das Américas'),
 ('c1000000-0000-4000-8000-000000000009','Carlos Nunes','Bandeirantes'),
 ('c1000000-0000-4000-8000-000000000010','Paulo Rezende','Pedra 90');

-- Um papel por pessoa (9 papéis): editor com editorias; os demais sem recorte.
insert into user_roles (user_id, role, sections) values
 ('c1000000-0000-4000-8000-000000000001','admin','{}'),
 ('c1000000-0000-4000-8000-000000000002','editor_chefe','{}'),
 ('c1000000-0000-4000-8000-000000000003','editor','{cidade,servicos,clima,agenda}'),
 ('c1000000-0000-4000-8000-000000000004','jornalista','{}'),
 ('c1000000-0000-4000-8000-000000000005','jornalista','{}'),
 ('c1000000-0000-4000-8000-000000000006','revisor','{}'),
 ('c1000000-0000-4000-8000-000000000007','operador_ia','{}'),
 ('c1000000-0000-4000-8000-000000000008','analista','{}'),
 ('c1000000-0000-4000-8000-000000000009','moderador','{}'),
 ('c1000000-0000-4000-8000-000000000010','leitura','{}');

-- ---------------------------------------------------------------------------
-- Regras v1 (= DEFAULT_RULES de src/lib/rules/defaults.ts) e pesos rec-v1 (spec §7.1)
-- Propostas e aprovadas por pessoas diferentes.
-- ---------------------------------------------------------------------------
insert into rules (version, body, force_review, proposed_by, approved_by, active) values (1,
 '{"version":1,"forceReview":true,"sensitiveTopics":["crime","violencia","morte","tragedia","acidente","suicidio","abuso","saude-individual","eleicoes","homicidio","assassinato","estupro","feminicidio","sequestro","overdose"],"categories":{"servicos":{"mode":"auto","minSources":2,"requirePrimary":false,"requireApprovedImage":false,"minScore":0.6,"summaryWords":60},"agenda":{"mode":"auto","minSources":1,"requirePrimary":true,"requireApprovedImage":false,"minScore":0.8,"summaryWords":60},"clima":{"mode":"auto","minSources":1,"requirePrimary":true,"requireApprovedImage":false,"minScore":0.8,"summaryWords":40},"cidade":{"mode":"auto_notify","minSources":2,"requirePrimary":true,"requireApprovedImage":true,"minScore":0.85,"summaryWords":80},"economia":{"mode":"auto_notify","minSources":2,"requirePrimary":true,"requireApprovedImage":true,"minScore":0.85,"summaryWords":80},"esportes":{"mode":"auto_notify","minSources":2,"requirePrimary":false,"requireApprovedImage":true,"minScore":0.6,"summaryWords":60},"cultura":{"mode":"review","minSources":2,"requirePrimary":false,"requireApprovedImage":true,"minScore":null,"summaryWords":80},"politica":{"mode":"review","minSources":3,"requirePrimary":true,"requireApprovedImage":true,"minScore":null,"summaryWords":100},"saude":{"mode":"review","minSources":2,"requirePrimary":true,"requireApprovedImage":true,"minScore":null,"summaryWords":80},"seguranca":{"mode":"blocked","minSources":0,"requirePrimary":false,"requireApprovedImage":false,"minScore":null,"summaryWords":null}}}'::jsonb,
 true, 'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', true);

insert into rec_weights (version, weights, cap, discovery_every, proposed_by, approved_by, active) values ('rec-v1',
 '{"popularity":0.35,"individual":0.25,"recency":0.15,"engagement":0.10,"operational":0.10,"diversity":0.05}'::jsonb,
 0.25, 5, 'c1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Assuntos (3)
-- ---------------------------------------------------------------------------
insert into topics (id, slug, title, summary, state, confidence, confidence_score, section_slug, first_seen_at, updated_at) values
 ('c4000000-0000-4000-8000-000000000001','plano-de-onibus-cpa-centro','Novo plano de ônibus entre CPA e Centro',
  'A prefeitura reorganiza as linhas que ligam o CPA ao Centro a partir de outubro, com uma linha expressa e novos horários nos fins de semana.',
  'confirmado','alta',0.88,'cidade','2026-09-18 08:10-04','2026-09-26 17:40-04'),
 ('c4000000-0000-4000-8000-000000000002','obra-do-viaduto-na-miguel-sutil','Obra do viaduto na avenida Miguel Sutil',
  'A construção do viaduto na Miguel Sutil entra em nova fase, com interdição parcial de faixas e desvios pelo bairro. O prazo final ainda não foi confirmado.',
  'em_apuracao','média',0.72,'cidade','2026-09-20 09:30-04','2026-09-26 12:15-04'),
 ('c4000000-0000-4000-8000-000000000003','seca-e-fumaca-na-baixada-cuiabana','Seca e fumaça na Baixada Cuiabana',
  'A umidade do ar abaixo de 15% e a fumaça das queimadas pioram a qualidade do ar em Cuiabá e Várzea Grande; a Defesa Civil mantém alerta.',
  'confirmado','alta',0.91,'clima','2026-09-15 07:00-04','2026-09-27 08:05-04');

-- ---------------------------------------------------------------------------
-- Itens coletados (30), só de veículos fictícios. 2 duplicados (duplicate_of preenchido).
-- ---------------------------------------------------------------------------
insert into collected_items (id, source_id, canonical_url, original_title, excerpt, author, published_at, image_url, locality, section_slug, topic_id, duplicate_of) values
 ('c3000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000010','https://agenciamt.example/noticias/novo-plano-onibus-cpa-centro','Prefeitura e governo apresentam novo plano de linhas entre CPA e Centro','O novo plano cria uma linha expressa entre o CPA e o Centro e reforça os horários de pico. As mudanças começam em 6 de outubro.','Redação Agência MT','2026-09-24 09:00-04','https://agenciamt.example/img/onibus-cpa.jpg','cuiaba','cidade','c4000000-0000-4000-8000-000000000001',null),
 ('c3000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000011','https://diariooficial.example/atos/2026/portaria-linhas-cpa','Portaria define itinerários das linhas CPA–Centro','A portaria publicada no Diário Oficial lista os novos itinerários e pontos de parada. O texto entra em vigor em 6 de outubro.',null,'2026-09-24 07:30-04',null,'cuiaba','cidade','c4000000-0000-4000-8000-000000000001',null),
 ('c3000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000002','https://diariodabaixada.example/cidade/passageiros-do-cpa-avaliam-mudancas','Passageiros do CPA avaliam mudanças nas linhas de ônibus','Usuários ouvidos no terminal do CPA aprovam a linha expressa, mas pedem mais ônibus à noite.','Equipe Diário da Baixada','2026-09-25 18:20-04',null,'cuiaba','cidade','c4000000-0000-4000-8000-000000000001',null),
 ('c3000000-0000-4000-8000-000000000004','c5000000-0000-4000-8000-000000000003','https://mtagora.example/cidade/linha-expressa-cpa-centro-horarios','Linha expressa CPA–Centro terá saídas a cada 12 minutos no pico','A nova linha expressa terá intervalo de 12 minutos nos horários de pico. Nos fins de semana, o intervalo será de 25 minutos.','MT Agora','2026-09-25 10:45-04','https://mtagora.example/img/linha-expressa.jpg','cuiaba','cidade','c4000000-0000-4000-8000-000000000001',null),
 ('c3000000-0000-4000-8000-000000000005','c5000000-0000-4000-8000-000000000004','https://portalvarzea.example/cidade/plano-onibus-cpa-centro','Plano de ônibus do CPA muda integração com Várzea Grande',null,'Portal Várzea','2026-09-25 14:00-04',null,'varzea-grande','cidade','c4000000-0000-4000-8000-000000000001',null),
 ('c3000000-0000-4000-8000-000000000006','c5000000-0000-4000-8000-000000000003','https://mtagora.example/cidade/linha-expressa-cpa-centro-horarios-atualizado','Linha expressa CPA–Centro terá saídas a cada 12 minutos no pico (atualizado)','Versão atualizada da mesma reportagem sobre a linha expressa.','MT Agora','2026-09-25 16:10-04',null,'cuiaba','cidade','c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000004'),
 ('c3000000-0000-4000-8000-000000000007','c5000000-0000-4000-8000-000000000001','https://folhadocerrado.example/cidade/viaduto-miguel-sutil-nova-fase','Viaduto da Miguel Sutil entra em nova fase e interdita duas faixas','A obra do viaduto passa a ocupar duas faixas da avenida no sentido Centro. Os desvios valem por pelo menos 30 dias.','Folha do Cerrado','2026-09-22 08:15-04','https://folhadocerrado.example/img/viaduto.jpg','cuiaba','cidade','c4000000-0000-4000-8000-000000000002',null),
 ('c3000000-0000-4000-8000-000000000008','c5000000-0000-4000-8000-000000000010','https://agenciamt.example/noticias/viaduto-miguel-sutil-desvios','Governo divulga mapa de desvios da obra na Miguel Sutil','O mapa indica rotas alternativas pelas ruas do bairro Duque de Caxias. Agentes de trânsito orientam motoristas nos horários de pico.','Redação Agência MT','2026-09-22 11:00-04',null,'cuiaba','cidade','c4000000-0000-4000-8000-000000000002',null),
 ('c3000000-0000-4000-8000-000000000009','c5000000-0000-4000-8000-000000000005','https://radiopantanal.example/cidade/motoristas-relatam-lentidao-miguel-sutil','Motoristas relatam lentidão na Miguel Sutil após interdição',null,'Rádio Pantanal','2026-09-23 07:40-04',null,'cuiaba','cidade','c4000000-0000-4000-8000-000000000002',null),
 ('c3000000-0000-4000-8000-000000000010','c5000000-0000-4000-8000-000000000006','https://correiomt.example/cidade/prazo-viaduto-miguel-sutil','Prazo de entrega do viaduto da Miguel Sutil segue indefinido',null,'Correio Mato-grossense','2026-09-26 12:00-04',null,'cuiaba','cidade','c4000000-0000-4000-8000-000000000002',null),
 ('c3000000-0000-4000-8000-000000000011','c5000000-0000-4000-8000-000000000010','https://agenciamt.example/noticias/defesa-civil-alerta-umidade','Defesa Civil mantém alerta de baixa umidade na Baixada Cuiabana','A umidade relativa do ar deve ficar abaixo de 15% à tarde até o fim da semana. A orientação é evitar atividades ao ar livre entre 11h e 17h.','Redação Agência MT','2026-09-26 07:00-04','https://agenciamt.example/img/alerta-umidade.jpg','mt','clima','c4000000-0000-4000-8000-000000000003',null),
 ('c3000000-0000-4000-8000-000000000012','c5000000-0000-4000-8000-000000000002','https://diariodabaixada.example/cidade/fumaca-encobre-cuiaba','Fumaça encobre Cuiabá e reduz visibilidade no fim da tarde','A fumaça de queimadas na região cobriu a cidade no fim da tarde de sexta-feira. Moradores relatam cheiro forte de queimado no CPA e no Coxipó.','Equipe Diário da Baixada','2026-09-26 18:30-04',null,'cuiaba','clima','c4000000-0000-4000-8000-000000000003',null),
 ('c3000000-0000-4000-8000-000000000013','c5000000-0000-4000-8000-000000000003','https://mtagora.example/clima/qualidade-do-ar-cuiaba','Qualidade do ar em Cuiabá fica em nível ruim pelo terceiro dia','Medições apontam qualidade do ar ruim em Cuiabá pelo terceiro dia seguido. A previsão é de melhora só com a chegada das chuvas.','MT Agora','2026-09-27 06:50-04','https://mtagora.example/img/fumaca-cuiaba.jpg','cuiaba','clima','c4000000-0000-4000-8000-000000000003',null),
 ('c3000000-0000-4000-8000-000000000014','c5000000-0000-4000-8000-000000000004','https://portalvarzea.example/cidade/focos-de-queimada-varzea-grande','Focos de queimada em terrenos baldios preocupam moradores de Várzea Grande',null,'Portal Várzea','2026-09-25 16:30-04',null,'varzea-grande','clima','c4000000-0000-4000-8000-000000000003',null),
 ('c3000000-0000-4000-8000-000000000015','c5000000-0000-4000-8000-000000000012','https://brasilhoje.example/brasil/seca-centro-oeste','Seca atinge capitais do Centro-Oeste em setembro',null,'Brasil Hoje','2026-09-24 20:00-04',null,'nacional','clima','c4000000-0000-4000-8000-000000000003',null),
 ('c3000000-0000-4000-8000-000000000016','c5000000-0000-4000-8000-000000000002','https://diariodabaixada.example/cidade/fumaca-encobre-cuiaba-video','Fumaça encobre Cuiabá: veja imagens do fim da tarde','Galeria com imagens da mesma cobertura sobre a fumaça.','Equipe Diário da Baixada','2026-09-26 19:05-04',null,'cuiaba','clima','c4000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000012'),
 ('c3000000-0000-4000-8000-000000000017','c5000000-0000-4000-8000-000000000007','https://agroempauta.example/economia/feira-agro-cuiaba-negocios','Feira do agro em Cuiabá projeta R$ 180 milhões em negócios','Organizadores esperam 40 mil visitantes em quatro dias de feira. Pequenos produtores terão espaço próprio para venda direta.','Agro em Pauta MT','2026-09-21 10:00-04','https://agroempauta.example/img/feira.jpg','cuiaba','economia',null,null),
 ('c3000000-0000-4000-8000-000000000018','c5000000-0000-4000-8000-000000000006','https://correiomt.example/economia/comercio-centro-vendas-setembro','Comércio do Centro de Cuiabá registra alta nas vendas de setembro',null,'Correio Mato-grossense','2026-09-23 09:20-04',null,'cuiaba','economia',null,null),
 ('c3000000-0000-4000-8000-000000000019','c5000000-0000-4000-8000-000000000003','https://mtagora.example/economia/feira-agro-expositores','Feira do agro reúne 300 expositores no Centro de Eventos','A feira terá 300 expositores e programação de palestras sobre crédito rural. A entrada é gratuita.','MT Agora','2026-09-22 15:00-04',null,'cuiaba','economia',null,null),
 ('c3000000-0000-4000-8000-000000000020','c5000000-0000-4000-8000-000000000012','https://brasilhoje.example/economia/juros-credito-rural','Taxa de juros do crédito rural deve cair no próximo plano safra',null,'Brasil Hoje','2026-09-20 13:00-04',null,'nacional','economia',null,null),
 ('c3000000-0000-4000-8000-000000000021','c5000000-0000-4000-8000-000000000009','https://placarmt.example/esportes/final-copa-cuiabana-amador','Final da Copa Cuiabana de futebol amador será na Arena Pantanal',null,'Placar MT','2026-09-23 17:00-04',null,'cuiaba','esportes',null,null),
 ('c3000000-0000-4000-8000-000000000022','c5000000-0000-4000-8000-000000000005','https://radiopantanal.example/esportes/ingressos-copa-cuiabana','Ingressos para a final da Copa Cuiabana serão trocados por alimentos',null,'Rádio Pantanal','2026-09-24 12:30-04',null,'cuiaba','esportes',null,null),
 ('c3000000-0000-4000-8000-000000000023','c5000000-0000-4000-8000-000000000008','https://cenacuiabana.example/cultura/temporada-teatro-sesc-arsenal','Sesc Arsenal abre temporada de teatro com grupos locais',null,'Cena Cuiabana','2026-09-19 11:00-04',null,'cuiaba','cultura',null,null),
 ('c3000000-0000-4000-8000-000000000024','c5000000-0000-4000-8000-000000000008','https://cenacuiabana.example/cultura/festival-siriri-cururu','Festival de siriri e cururu volta à Orla do Porto em outubro',null,'Cena Cuiabana','2026-09-25 09:00-04',null,'cuiaba','cultura',null,null),
 ('c3000000-0000-4000-8000-000000000025','c5000000-0000-4000-8000-000000000011','https://diariooficial.example/atos/2026/lei-revisao-plano-diretor','Publicada lei que revisa o plano diretor de Cuiabá','A lei publicada no Diário Oficial revisa o zoneamento de bairros da região norte. As regras passam a valer em 90 dias.',null,'2026-09-18 07:00-04',null,'cuiaba','politica',null,null),
 ('c3000000-0000-4000-8000-000000000026','c5000000-0000-4000-8000-000000000001','https://folhadocerrado.example/politica/camara-aprova-revisao-plano-diretor','Câmara aprova revisão do plano diretor após duas audiências públicas','A revisão foi aprovada em segunda votação depois de duas audiências públicas. O texto muda regras de altura de prédios na região norte.','Folha do Cerrado','2026-09-16 21:00-04',null,'cuiaba','politica',null,null),
 ('c3000000-0000-4000-8000-000000000027','c5000000-0000-4000-8000-000000000003','https://mtagora.example/politica/plano-diretor-o-que-muda','Plano diretor: o que muda para quem mora na região norte','Guia explica as mudanças de zoneamento para CPA, Morada da Serra e Três Barras. Imóveis já construídos não são afetados.','MT Agora','2026-09-19 08:00-04',null,'cuiaba','politica',null,null),
 ('c3000000-0000-4000-8000-000000000028','c5000000-0000-4000-8000-000000000010','https://agenciamt.example/noticias/mutirao-emprego-centro','Mutirão de emprego oferece 800 vagas no Centro de Cuiabá','O mutirão acontece no sábado, das 8h às 14h, na Praça Alencastro. É preciso levar documento com foto e carteira de trabalho.','Redação Agência MT','2026-09-25 08:00-04',null,'cuiaba','servicos',null,null),
 ('c3000000-0000-4000-8000-000000000029','c5000000-0000-4000-8000-000000000002','https://diariodabaixada.example/servicos/mutirao-emprego-vagas','Mutirão de emprego no Centro terá vagas para primeiro emprego','Parte das vagas é para quem busca o primeiro emprego. Haverá atendimento prioritário para pessoas com deficiência.','Equipe Diário da Baixada','2026-09-25 13:00-04',null,'cuiaba','servicos',null,null),
 ('c3000000-0000-4000-8000-000000000030','c5000000-0000-4000-8000-000000000010','https://agenciamt.example/noticias/vacinacao-escolas-outubro','Campanha leva vacinação às escolas estaduais em outubro','Equipes de saúde vão visitar escolas estaduais de Cuiabá para atualizar a caderneta de vacinação. Os pais devem enviar a caderneta com os alunos.','Redação Agência MT','2026-09-26 10:00-04',null,'mt','saude',null,null);

-- ---------------------------------------------------------------------------
-- Matérias publicadas (12): 4 originais e 8 normalizadas. force_review=true → todas revisadas por humano.
-- Corpo no formato de documento do editor (doc → paragraph → text).
-- ---------------------------------------------------------------------------
with seed_articles (id, slug, kind, topic_id, section_slug, title, dek, paragraphs, ai_summary, confidence, confidence_score, author_id, agent_id, reviewer, published_at, updated_at) as (values
 ('c2000000-0000-4000-8000-000000000001'::uuid, 'o-que-muda-nas-linhas-de-onibus-entre-cpa-e-centro', 'original'::content_kind, 'c4000000-0000-4000-8000-000000000001'::uuid, 'cidade',
  'O que muda nas linhas de ônibus entre o CPA e o Centro a partir de outubro',
  'Linha expressa, novos pontos e horários de fim de semana: o guia para quem depende do transporte coletivo na região norte.',
  array[
   'A partir de 6 de outubro, quem mora no CPA e trabalha no Centro de Cuiabá vai encontrar um novo desenho das linhas de ônibus. A principal novidade é uma linha expressa, com poucas paradas, que liga o terminal do CPA à Praça Alencastro.',
   'Nos horários de pico, das 6h às 8h30 e das 17h às 19h30, a linha expressa terá saídas a cada 12 minutos. Nos fins de semana, o intervalo passa a ser de 25 minutos, com o último ônibus saindo do Centro às 23h.',
   'As linhas convencionais continuam atendendo os bairros, mas quatro pontos de parada na avenida do CPA foram remanejados. A lista completa está na portaria publicada no Diário Oficial do município.',
   'Passageiros ouvidos pelo CityNews no terminal aprovaram a linha expressa, mas pediram reforço no período noturno. A prefeitura informou que vai avaliar a demanda nas primeiras quatro semanas.'
  ], null::text[], 'alta'::confidence_level, 0.90, 'c1000000-0000-4000-8000-000000000004'::uuid, null, 'c1000000-0000-4000-8000-000000000003'::uuid, '2026-09-26 08:00-04'::timestamptz, '2026-09-26 17:40-04'::timestamptz),
 ('c2000000-0000-4000-8000-000000000002', 'moradores-do-porto-pedem-mais-sombra-na-orla', 'original', null, 'cidade',
  'Moradores do Porto pedem mais sombra e bebedouros na Orla',
  'Com a temperatura acima de 40 °C, frequentadores da Orla do Porto relatam dificuldade para caminhar no fim da tarde.',
  array[
   'No fim da tarde, quando o sol baixa, a Orla do Porto enche de gente para caminhar à beira do rio Cuiabá. Com os termômetros acima de 40 °C nesta semana, porém, frequentadores dizem que falta sombra no trajeto.',
   'Uma associação de moradores do bairro entregou à prefeitura um pedido com três itens: plantio de árvores nativas, instalação de bebedouros e toldos nas áreas de descanso.',
   'A prefeitura informou que o plantio está previsto para o início do período de chuvas e que os bebedouros dependem de uma licitação em andamento.'
  ], null, 'alta', 0.86, 'c1000000-0000-4000-8000-000000000005', null, 'c1000000-0000-4000-8000-000000000003', '2026-09-25 09:30-04', '2026-09-25 09:30-04'),
 ('c2000000-0000-4000-8000-000000000003', 'sesc-arsenal-abre-temporada-de-teatro-com-grupos-locais', 'original', null, 'cultura',
  'Sesc Arsenal abre temporada de teatro com grupos locais',
  'Seis grupos de Cuiabá e Várzea Grande se revezam no palco até dezembro, com ingressos a preços populares.',
  array[
   'A temporada de teatro do Sesc Arsenal começa em outubro com seis grupos de Cuiabá e Várzea Grande. As apresentações acontecem às sextas e aos sábados, sempre às 20h.',
   'A programação inclui comédia, teatro de rua adaptado para o palco e um espetáculo infantil aos domingos pela manhã. Os ingressos custam de R$ 10 a R$ 30, com meia-entrada para estudantes.',
   'Segundo a coordenação do espaço, a proposta é abrir o palco para companhias que costumam se apresentar em praças e escolas da Baixada Cuiabana.'
  ], null, 'alta', 0.88, 'c1000000-0000-4000-8000-000000000004', null, 'c1000000-0000-4000-8000-000000000002', '2026-09-20 10:00-04', '2026-09-20 10:00-04'),
 ('c2000000-0000-4000-8000-000000000004', 'com-fumaca-escolas-ajustam-horario-de-educacao-fisica', 'original', 'c4000000-0000-4000-8000-000000000003', 'cidade',
  'Com fumaça e ar seco, escolas ajustam horário da educação física',
  'Aulas ao ar livre passam para o começo da manhã; famílias devem reforçar a hidratação das crianças.',
  array[
   'Escolas de Cuiabá passaram a concentrar as aulas de educação física no começo da manhã, antes das 9h, por causa da fumaça e da umidade do ar abaixo de 15% à tarde.',
   'A orientação vale enquanto durar o alerta da Defesa Civil. Nas escolas de período integral, as atividades da tarde foram transferidas para quadras cobertas ou salas.',
   'Pais e responsáveis devem mandar garrafas de água com as crianças e observar sinais como tosse persistente e irritação nos olhos.'
  ], null, 'alta', 0.87, 'c1000000-0000-4000-8000-000000000005', null, 'c1000000-0000-4000-8000-000000000002', '2026-09-26 11:00-04', '2026-09-26 11:00-04'),
 ('c2000000-0000-4000-8000-000000000005', 'prefeitura-detalha-novo-plano-de-onibus-cpa-centro', 'normalized', 'c4000000-0000-4000-8000-000000000001', 'cidade',
  'Prefeitura detalha novo plano de ônibus entre CPA e Centro',
  'Portaria define itinerários e linha expressa com saídas a cada 12 minutos no pico a partir de 6 de outubro.',
  array[
   'O novo plano de linhas entre o CPA e o Centro de Cuiabá começa a valer em 6 de outubro, segundo portaria publicada no Diário Oficial de Cuiabá e comunicado da Agência MT.',
   'A linha expressa terá saídas a cada 12 minutos nos horários de pico e a cada 25 minutos nos fins de semana, de acordo com o MT Agora.',
   'Passageiros ouvidos pelo Diário da Baixada aprovam a mudança, mas pedem mais ônibus à noite.'
  ], array['Novo plano de ônibus entre CPA e Centro começa em 6 de outubro.','Linha expressa terá saídas a cada 12 minutos no pico.'], 'alta', 0.89, null, 'redator', 'c1000000-0000-4000-8000-000000000003', '2026-09-25 12:00-04', '2026-09-25 19:00-04'),
 ('c2000000-0000-4000-8000-000000000006', 'viaduto-da-miguel-sutil-interdita-duas-faixas', 'normalized', 'c4000000-0000-4000-8000-000000000002', 'cidade',
  'Viaduto da Miguel Sutil entra em nova fase e interdita duas faixas',
  'Desvios pelo Duque de Caxias valem por pelo menos 30 dias; prazo de entrega da obra segue sem confirmação.',
  array[
   'A obra do viaduto na avenida Miguel Sutil passou a ocupar duas faixas no sentido Centro, segundo a Folha do Cerrado. Os desvios devem durar pelo menos 30 dias.',
   'O governo divulgou um mapa de rotas alternativas pelas ruas do bairro Duque de Caxias, de acordo com a Agência MT.',
   'O prazo final da obra ainda não foi confirmado pelos responsáveis; o CityNews segue apurando.'
  ], array['Obra do viaduto na Miguel Sutil interdita duas faixas no sentido Centro.','Prazo final da obra ainda não foi confirmado.'], 'média', 0.72, null, 'redator', 'c1000000-0000-4000-8000-000000000003', '2026-09-22 13:00-04', '2026-09-26 12:15-04'),
 ('c2000000-0000-4000-8000-000000000007', 'qualidade-do-ar-em-cuiaba-fica-ruim-pelo-terceiro-dia', 'normalized', 'c4000000-0000-4000-8000-000000000003', 'clima',
  'Qualidade do ar em Cuiabá fica ruim pelo terceiro dia seguido',
  'Fumaça de queimadas e umidade baixa mantêm o ar em nível ruim; melhora depende da chegada das chuvas.',
  array[
   'Pelo terceiro dia seguido, a qualidade do ar em Cuiabá ficou em nível ruim, segundo medições divulgadas pelo MT Agora.',
   'A Defesa Civil mantém alerta de baixa umidade para a Baixada Cuiabana até o fim da semana, de acordo com a Agência MT.'
  ], array['Qualidade do ar em Cuiabá está ruim pelo terceiro dia.','Alerta de baixa umidade segue até o fim da semana.'], 'alta', 0.90, null, 'redator', 'c1000000-0000-4000-8000-000000000002', '2026-09-27 08:05-04', '2026-09-27 08:05-04'),
 ('c2000000-0000-4000-8000-000000000008', 'defesa-civil-mantem-alerta-de-baixa-umidade', 'normalized', 'c4000000-0000-4000-8000-000000000003', 'clima',
  'Defesa Civil mantém alerta de baixa umidade na Baixada Cuiabana',
  'Umidade deve ficar abaixo de 15% à tarde; orientação é evitar atividade ao ar livre entre 11h e 17h.',
  array[
   'A umidade relativa do ar deve ficar abaixo de 15% nas tardes desta semana em Cuiabá e Várzea Grande, segundo alerta da Defesa Civil divulgado pela Agência MT.',
   'A recomendação é beber água com frequência e evitar exercícios ao ar livre entre 11h e 17h.'
  ], array['Umidade abaixo de 15% nas tardes desta semana.','Evite atividades ao ar livre entre 11h e 17h.'], 'alta', 0.92, null, 'redator', 'c1000000-0000-4000-8000-000000000003', '2026-09-26 08:30-04', '2026-09-26 08:30-04'),
 ('c2000000-0000-4000-8000-000000000009', 'feira-do-agro-em-cuiaba-projeta-r-180-milhoes', 'normalized', null, 'economia',
  'Feira do agro em Cuiabá projeta R$ 180 milhões em negócios',
  'Evento reúne 300 expositores no Centro de Eventos, com entrada gratuita e espaço para pequenos produtores.',
  array[
   'A feira do agronegócio que acontece em Cuiabá deve movimentar R$ 180 milhões em negócios em quatro dias, segundo os organizadores ouvidos pelo Agro em Pauta MT.',
   'O evento reúne 300 expositores e tem entrada gratuita, de acordo com o MT Agora. Pequenos produtores terão espaço próprio para venda direta.'
  ], array['Feira do agro projeta R$ 180 milhões em negócios.','Entrada é gratuita e há espaço para pequenos produtores.'], 'média', 0.78, null, 'redator', 'c1000000-0000-4000-8000-000000000002', '2026-09-22 17:00-04', '2026-09-22 17:00-04'),
 ('c2000000-0000-4000-8000-000000000010', 'final-da-copa-cuiabana-de-futebol-amador-sera-na-arena-pantanal', 'normalized', null, 'esportes',
  'Final da Copa Cuiabana de futebol amador será na Arena Pantanal',
  'Ingressos serão trocados por alimentos não perecíveis; a renda vai para entidades assistenciais.',
  array[
   'A final da Copa Cuiabana de futebol amador será disputada na Arena Pantanal, informou o Placar MT.',
   'Segundo a Rádio Pantanal, os ingressos serão trocados por um quilo de alimento não perecível, doado a entidades assistenciais da cidade.'
  ], array['Final da Copa Cuiabana será na Arena Pantanal.','Ingresso é trocado por alimento não perecível.'], 'média', 0.74, null, 'redator', 'c1000000-0000-4000-8000-000000000002', '2026-09-24 15:00-04', '2026-09-24 15:00-04'),
 ('c2000000-0000-4000-8000-000000000011', 'camara-aprova-revisao-do-plano-diretor-de-cuiaba', 'normalized', null, 'politica',
  'Câmara aprova revisão do plano diretor de Cuiabá',
  'Lei muda regras de zoneamento na região norte e passa a valer em 90 dias; imóveis já construídos não são afetados.',
  array[
   'A revisão do plano diretor de Cuiabá foi aprovada em segunda votação depois de duas audiências públicas, segundo a Folha do Cerrado.',
   'A lei foi publicada no Diário Oficial de Cuiabá e passa a valer em 90 dias. O texto muda o zoneamento de bairros como CPA, Morada da Serra e Três Barras, de acordo com o MT Agora.',
   'Imóveis já construídos não são afetados pelas novas regras.'
  ], array['Revisão do plano diretor foi aprovada e publicada.','Regras de zoneamento da região norte valem em 90 dias.'], 'alta', 0.91, null, 'redator', 'c1000000-0000-4000-8000-000000000002', '2026-09-19 12:00-04', '2026-09-19 12:00-04'),
 ('c2000000-0000-4000-8000-000000000012', 'mutirao-de-emprego-oferece-800-vagas-no-centro', 'normalized', null, 'servicos',
  'Mutirão de emprego oferece 800 vagas no Centro de Cuiabá',
  'Atendimento no sábado, das 8h às 14h, na Praça Alencastro; leve documento com foto e carteira de trabalho.',
  array[
   'Um mutirão de emprego oferece 800 vagas neste sábado, das 8h às 14h, na Praça Alencastro, no Centro de Cuiabá, segundo a Agência MT.',
   'Parte das vagas é para primeiro emprego e haverá atendimento prioritário para pessoas com deficiência, informou o Diário da Baixada.'
  ], array['Mutirão oferece 800 vagas no sábado na Praça Alencastro.','Leve documento com foto e carteira de trabalho.'], 'alta', 0.88, null, 'redator', 'c1000000-0000-4000-8000-000000000003', '2026-09-25 15:00-04', '2026-09-25 15:00-04')
)
insert into articles (id, slug, kind, topic_id, section_slug, title, dek, body, ai_summary, ai_summary_reviewed_by, status, publish_mode,
                      confidence, confidence_score, author_id, agent_id, published_at, updated_at, rules_version)
select a.id, a.slug, a.kind, a.topic_id, a.section_slug, a.title, a.dek,
       jsonb_build_object('type', 'doc', 'content', (
         select jsonb_agg(jsonb_build_object('type', 'paragraph', 'content',
                  jsonb_build_array(jsonb_build_object('type', 'text', 'text', p.txt))) order by p.n)
         from unnest(a.paragraphs) with ordinality as p(txt, n))),
       a.ai_summary, case when a.ai_summary is not null then a.reviewer end,
       'published', 'human', a.confidence, a.confidence_score, a.author_id, a.agent_id, a.published_at, a.updated_at, 1
from seed_articles a;

-- Uma versão por matéria (histórico obrigatório).
insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, created_at)
select a.id, 1, jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body),
       case when a.kind = 'original' then 'human' else 'ai' end, a.author_id, 'edit', a.published_at
from articles a;

-- Fontes das matérias normalizadas (ao menos 1; primária quando há fonte oficial).
insert into article_sources (article_id, item_id, role, confirmed) values
 ('c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002','primary',true),
 ('c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000003','context',true),
 ('c2000000-0000-4000-8000-000000000004','c3000000-0000-4000-8000-000000000011','primary',true),
 ('c2000000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000002','primary',true),
 ('c2000000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000001','primary',true),
 ('c2000000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000004','secondary',true),
 ('c2000000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000003','context',true),
 ('c2000000-0000-4000-8000-000000000006','c3000000-0000-4000-8000-000000000007','secondary',true),
 ('c2000000-0000-4000-8000-000000000006','c3000000-0000-4000-8000-000000000008','primary',true),
 ('c2000000-0000-4000-8000-000000000006','c3000000-0000-4000-8000-000000000010','context',false),
 ('c2000000-0000-4000-8000-000000000007','c3000000-0000-4000-8000-000000000013','secondary',true),
 ('c2000000-0000-4000-8000-000000000007','c3000000-0000-4000-8000-000000000011','primary',true),
 ('c2000000-0000-4000-8000-000000000008','c3000000-0000-4000-8000-000000000011','primary',true),
 ('c2000000-0000-4000-8000-000000000009','c3000000-0000-4000-8000-000000000017','secondary',true),
 ('c2000000-0000-4000-8000-000000000009','c3000000-0000-4000-8000-000000000019','secondary',true),
 ('c2000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000021','secondary',true),
 ('c2000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000022','secondary',true),
 ('c2000000-0000-4000-8000-000000000011','c3000000-0000-4000-8000-000000000025','primary',true),
 ('c2000000-0000-4000-8000-000000000011','c3000000-0000-4000-8000-000000000026','secondary',true),
 ('c2000000-0000-4000-8000-000000000011','c3000000-0000-4000-8000-000000000027','secondary',true),
 ('c2000000-0000-4000-8000-000000000012','c3000000-0000-4000-8000-000000000028','primary',true),
 ('c2000000-0000-4000-8000-000000000012','c3000000-0000-4000-8000-000000000029','secondary',true);

-- ---------------------------------------------------------------------------
-- Agenda: 10 eventos fictícios em outubro de 2026, em locais reais de Cuiabá (horário -04)
-- ---------------------------------------------------------------------------
insert into event_listings (id, slug, title, starts_at, ends_at, venue, neighborhood, price_cents, age_rating, category, accessibility, origin, confirmed_at, description) values
 ('c6000000-0000-4000-8000-000000000001','festival-de-siriri-e-cururu-na-orla','Festival de Siriri e Cururu na Orla','2026-10-03 18:00-04','2026-10-03 23:00-04','Orla do Porto','Porto',null,'livre','cultura','Área plana, banheiro acessível e intérprete de Libras','organizer','2026-09-25 09:00-04','Grupos de siriri e cururu de Cuiabá e Várzea Grande se apresentam na beira do rio.'),
 ('c6000000-0000-4000-8000-000000000002','teatro-a-feira-do-mercado-do-porto','Teatro: A Feira do Mercado do Porto','2026-10-09 20:00-04','2026-10-09 21:30-04','Sesc Arsenal','Centro Sul',3000,'12','teatro','Rampa de acesso e assentos reservados','organizer','2026-09-20 10:00-04','Comédia de um grupo cuiabano sobre um dia de feira no Porto. Meia-entrada para estudantes.'),
 ('c6000000-0000-4000-8000-000000000003','caminhada-ecologica-no-mae-bonifacia','Caminhada ecológica no Parque Mãe Bonifácia','2026-10-04 06:30-04','2026-10-04 08:30-04','Parque Mãe Bonifácia','Quilombo',null,'livre','esporte','Trilha principal pavimentada','official','2026-09-24 08:00-04','Caminhada guiada com monitores ambientais. Leve água e chegue cedo por causa do calor.'),
 ('c6000000-0000-4000-8000-000000000004','final-da-copa-cuiabana-de-futebol-amador','Final da Copa Cuiabana de futebol amador','2026-10-11 16:00-04','2026-10-11 18:00-04','Arena Pantanal','Verdão',null,'livre','esporte','Setor acessível e estacionamento reservado','official','2026-09-24 15:00-04','Entrada com 1 kg de alimento não perecível.'),
 ('c6000000-0000-4000-8000-000000000005','feira-de-artesanato-da-praca-alencastro','Feira de artesanato da Praça Alencastro','2026-10-17 08:00-04','2026-10-17 14:00-04','Praça Alencastro','Centro Norte',null,'livre','feira','Área plana','official','2026-09-26 10:00-04','Artesãos da Baixada Cuiabana vendem peças em cerâmica, madeira e palha.'),
 ('c6000000-0000-4000-8000-000000000006','cinema-no-parque-das-aguas','Cinema no Parque das Águas','2026-10-10 19:00-04','2026-10-10 21:00-04','Parque das Águas','Centro Político Administrativo',null,'livre','cinema','Legendas em português e audiodescrição','organizer','2026-09-23 12:00-04','Sessão ao ar livre com filmes de curta-metragem de realizadores mato-grossenses.'),
 ('c6000000-0000-4000-8000-000000000007','noite-de-rasqueado-no-sesc-arsenal','Noite de rasqueado no Sesc Arsenal','2026-10-16 20:00-04','2026-10-16 23:30-04','Sesc Arsenal','Centro Sul',2000,'16','musica','Rampa de acesso','organizer','2026-09-22 16:00-04','Bandas locais de rasqueado e lambadão se revezam no pátio do Arsenal.'),
 ('c6000000-0000-4000-8000-000000000008','feira-gastronomica-da-orla-do-porto','Feira gastronômica da Orla do Porto','2026-10-24 17:00-04','2026-10-24 23:00-04','Orla do Porto','Porto',null,'livre','gastronomia','Área plana e banheiro acessível','organizer','2026-09-26 18:00-04','Peixe na brasa, maria-isabel e doces de caju com cozinheiros da Baixada Cuiabana.'),
 ('c6000000-0000-4000-8000-000000000009','contacao-de-historias-no-parque-massairo-okamura','Contação de histórias no Parque Massairo Okamura','2026-10-12 09:00-04','2026-10-12 11:00-04','Parque Massairo Okamura','Centro Político Administrativo',null,'livre','infantil','Área coberta e intérprete de Libras','official','2026-09-25 11:00-04','Programação do Dia das Crianças com lendas pantaneiras.'),
 ('c6000000-0000-4000-8000-000000000010','corrida-noturna-do-cpa','Corrida noturna do CPA','2026-10-31 19:30-04','2026-10-31 21:30-04','Avenida do CPA','CPA',4500,'livre','esporte','Percurso de 3 km para cadeirantes','organizer','2026-09-27 08:00-04','Provas de 5 e 10 km com largada na avenida do CPA. Inscrição inclui camiseta e medalha.');

-- ---------------------------------------------------------------------------
-- Coleções editoriais (4)
-- ---------------------------------------------------------------------------
insert into collections (id, slug, title, description, curator_id, is_editorial) values
 ('c7000000-0000-4000-8000-000000000001','plano-de-onibus-cpa-centro','Plano de ônibus CPA–Centro','Tudo o que muda no transporte coletivo entre a região norte e o Centro.','c1000000-0000-4000-8000-000000000002',true),
 ('c7000000-0000-4000-8000-000000000002','seca-e-fumaca','Seca e fumaça','Alertas, cuidados com a saúde e o que se sabe sobre as queimadas na Baixada Cuiabana.','c1000000-0000-4000-8000-000000000002',true),
 ('c7000000-0000-4000-8000-000000000003','outubro-em-cuiaba','Outubro em Cuiabá','Programação cultural, esportiva e gastronômica do mês.','c1000000-0000-4000-8000-000000000003',true),
 ('c7000000-0000-4000-8000-000000000004','guia-do-plano-diretor','Guia do plano diretor','O que a revisão do plano diretor muda para cada região da cidade.','c1000000-0000-4000-8000-000000000002',true);

insert into collection_items (collection_id, content_ref, position) values
 ('c7000000-0000-4000-8000-000000000001','article:c2000000-0000-4000-8000-000000000001',1),
 ('c7000000-0000-4000-8000-000000000001','article:c2000000-0000-4000-8000-000000000005',2),
 ('c7000000-0000-4000-8000-000000000001','topic:c4000000-0000-4000-8000-000000000001',3),
 ('c7000000-0000-4000-8000-000000000002','article:c2000000-0000-4000-8000-000000000008',1),
 ('c7000000-0000-4000-8000-000000000002','article:c2000000-0000-4000-8000-000000000007',2),
 ('c7000000-0000-4000-8000-000000000002','article:c2000000-0000-4000-8000-000000000004',3),
 ('c7000000-0000-4000-8000-000000000003','event:c6000000-0000-4000-8000-000000000001',1),
 ('c7000000-0000-4000-8000-000000000003','event:c6000000-0000-4000-8000-000000000002',2),
 ('c7000000-0000-4000-8000-000000000003','event:c6000000-0000-4000-8000-000000000008',3),
 ('c7000000-0000-4000-8000-000000000003','article:c2000000-0000-4000-8000-000000000003',4),
 ('c7000000-0000-4000-8000-000000000004','article:c2000000-0000-4000-8000-000000000011',1);

-- ---------------------------------------------------------------------------
-- P1 · portal: 1 matéria arquivada (resposta 410 com motivo, P25). Não conta entre as 12 publicadas.
-- ---------------------------------------------------------------------------
insert into articles (id, slug, kind, topic_id, section_slug, title, dek, body, status, publish_mode,
                      confidence, confidence_score, author_id, published_at, updated_at, rules_version, gone_reason)
values ('c2000000-0000-4000-8000-000000000099', 'materia-arquivada-seed', 'original', null, 'cidade',
        'Feira de bairro no Coxipó muda de endereço',
        'Texto de teste retirado do ar para exercitar a resposta 410.',
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Matéria fictícia arquivada."}]}]}',
        'archived', 'human', 'média', 0.60, 'c1000000-0000-4000-8000-000000000004',
        '2026-09-10 09:00-04', '2026-09-12 10:00-04', 1,
        'A informação sobre o novo endereço não se confirmou e a matéria foi retirada do ar.');

insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, created_at)
select a.id, 1, jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body), 'human', a.author_id, 'edit', a.published_at
from articles a where a.slug = 'materia-arquivada-seed';

-- ---------------------------------------------------------------------------
-- P1-T5 · editoria: subeditoria Mobilidade (Cidade) e bairros citados (filtro ?bairro=)
-- ---------------------------------------------------------------------------
insert into sections (slug, name, parent_slug, autonomy_category) values ('mobilidade','Mobilidade','cidade','cidade');
update articles set section_slug = 'mobilidade'
 where id in ('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000005','c2000000-0000-4000-8000-000000000006');
update articles set neighborhoods = '{cpa,centro-norte}'
 where id in ('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000005');
update articles set neighborhoods = '{duque-de-caxias}' where id = 'c2000000-0000-4000-8000-000000000006';
update articles set neighborhoods = '{porto}' where id = 'c2000000-0000-4000-8000-000000000002';
update articles set neighborhoods = '{cpa,morada-da-serra,tres-barras}' where id = 'c2000000-0000-4000-8000-000000000011';
update articles set neighborhoods = '{centro-norte}' where id = 'c2000000-0000-4000-8000-000000000012';

-- ---------------------------------------------------------------------------
-- P1-T6 · matéria: uma atualização (plano de ônibus) e uma correção pública (escolas),
-- com versões publicadas para o histórico (P04) e a nota em /correcoes (P24).
-- ---------------------------------------------------------------------------
update article_versions
   set snapshot = jsonb_set(snapshot, '{body,content}', (snapshot->'body'->'content') || jsonb_build_array(
     jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text',
       'Cada aula ao ar livre passa a durar no máximo 18 minutos, com pausa para água no meio da atividade.')))))
 where article_id = 'c2000000-0000-4000-8000-000000000004' and number = 1;
update articles
   set body = jsonb_set(body, '{content}', (body->'content') || jsonb_build_array(
     jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text',
       'Cada aula ao ar livre passa a durar no máximo 20 minutos, com pausa para água no meio da atividade.'))))),
       status = 'updated', updated_at = '2026-09-26 16:40-04'
 where id = 'c2000000-0000-4000-8000-000000000004';
insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, public_note, created_at)
select a.id, 2, jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body), 'human', 'c1000000-0000-4000-8000-000000000005',
       'correction', 'Cada aula ao ar livre dura no máximo 20 minutos, não 18, como informado na primeira versão.', a.updated_at
from articles a where a.id = 'c2000000-0000-4000-8000-000000000004';
insert into corrections (article_id, kind, public_note, requested_by, status, published_at) values
 ('c2000000-0000-4000-8000-000000000004', 'correction',
  'Cada aula ao ar livre dura no máximo 20 minutos, não 18, como informado na primeira versão.',
  'leitor', 'published', '2026-09-26 16:40-04');

update articles
   set body = jsonb_set(body, '{content}', (body->'content') || jsonb_build_array(
     jsonb_build_object('type','paragraph','content', jsonb_build_array(jsonb_build_object('type','text','text',
       'Depois da publicação, a prefeitura informou que duas linhas noturnas serão reforçadas a partir de novembro.'))))),
       status = 'updated', updated_at = '2026-09-26 10:30-04'
 where id = 'c2000000-0000-4000-8000-000000000005';
insert into article_versions (article_id, number, snapshot, origin, author_id, change_kind, public_note, created_at)
select a.id, 2, jsonb_build_object('title', a.title, 'dek', a.dek, 'body', a.body), 'human', 'c1000000-0000-4000-8000-000000000003',
       'update', 'A prefeitura anunciou reforço de duas linhas noturnas a partir de novembro.', a.updated_at
from articles a where a.id = 'c2000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- P1-T7 · assunto: convergências, divergências, não confirmados e perguntas frequentes
-- ---------------------------------------------------------------------------
update topics set
  agreements = array['O novo plano começa a valer em 6 de outubro.','Haverá uma linha expressa entre o CPA e o Centro.'],
  disagreements = array['O intervalo nos fins de semana: 25 minutos segundo o MT Agora; a portaria não informa.'],
  unconfirmed = array['Se haverá reforço de ônibus no período noturno.'],
  faq = '[{"q":"Quando o novo plano começa?","a":"Em 6 de outubro, segundo a portaria publicada no Diário Oficial de Cuiabá."},{"q":"A tarifa muda?","a":"Nenhuma das fontes consultadas informa mudança na tarifa."}]',
  summary_reviewed_by = 'c1000000-0000-4000-8000-000000000003'
 where slug = 'plano-de-onibus-cpa-centro';
update topics set
  agreements = array['A obra ocupa duas faixas da avenida Miguel Sutil no sentido Centro.','Há desvios pelas ruas do bairro Duque de Caxias.'],
  disagreements = array['A duração dos desvios: pelo menos 30 dias segundo a Folha do Cerrado; a Agência MT não informa prazo.'],
  unconfirmed = array['O prazo final de entrega do viaduto.','Se haverá interdição total em algum fim de semana.'],
  faq = '[{"q":"Qual é o desvio recomendado?","a":"Pelas ruas do bairro Duque de Caxias, conforme o mapa divulgado pelo governo."},{"q":"Quando a obra termina?","a":"O prazo ainda não foi confirmado pelos responsáveis. O CityNews segue apurando."}]',
  summary_reviewed_by = 'c1000000-0000-4000-8000-000000000003'
 where slug = 'obra-do-viaduto-na-miguel-sutil';
update topics set
  agreements = array['A umidade do ar fica abaixo de 15% nas tardes desta semana.','A Defesa Civil mantém alerta para a Baixada Cuiabana.'],
  unconfirmed = array['Quando as chuvas devem voltar a Cuiabá.'],
  faq = '[{"q":"Qual horário evitar atividade ao ar livre?","a":"Entre 11h e 17h, segundo a Defesa Civil."}]',
  summary_reviewed_by = 'c1000000-0000-4000-8000-000000000002'
 where slug = 'seca-e-fumaca-na-baixada-cuiabana';

-- ---------------------------------------------------------------------------
-- P1-T8 · agenda: a noite de rasqueado vai até 1h30 (evento que atravessa a meia-noite no .ics)
-- ---------------------------------------------------------------------------
update event_listings set ends_at = '2026-10-17 01:30-04' where slug = 'noite-de-rasqueado-no-sesc-arsenal';
