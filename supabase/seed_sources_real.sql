-- Registro inicial de FONTES REAIS (staging e produção). Não aplicar no banco de testes.
-- Aplicar com: pnpm db:seed:sources (ver P0 Task 7). Todas entram 'paused' e só viram 'active'
-- depois de discoverFeed + testConnection + checagem de robots.txt (P3 Task 3).
-- Relevância inicial é hipótese editorial (ver docs/sources-registry.md); o ranking real vem dos dados de uso.
insert into sources (slug, name, base_url, kind, feed_url, categories, locality, reliability, image_policy, republish_policy, may_be_sole_source, status, last_error) values
('secom-mt','Governo de Mato Grosso (Secom)','https://www.mt.gov.br','page',null,'{cidade,servicos,economia,saude,agenda}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('prefeitura-cuiaba','Prefeitura de Cuiabá','https://www.cuiaba.mt.gov.br','page',null,'{cidade,servicos,agenda,saude}','cuiaba','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('prefeitura-vg','Prefeitura de Várzea Grande','https://www.varzeagrande.mt.gov.br','page',null,'{cidade,servicos,agenda}','varzea-grande','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('almt','Assembleia Legislativa de MT','https://www.al.mt.gov.br','page',null,'{politica}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('camara-cuiaba','Câmara Municipal de Cuiabá','https://www.camaracuiaba.mt.gov.br','page',null,'{politica,cidade}','cuiaba','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('tjmt','Tribunal de Justiça de MT','https://www.tjmt.jus.br','page',null,'{politica,cidade}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('mpmt','Ministério Público de MT','https://www.mpmt.mp.br','page',null,'{politica,cidade}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('tce-mt','Tribunal de Contas de MT','https://www.tce.mt.gov.br','page',null,'{politica,economia}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('tre-mt','TRE-MT','https://www.tre-mt.jus.br','page',null,'{politica}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('iomat','Diário Oficial de MT (IOMAT)','https://www.iomat.mt.gov.br','page',null,'{politica,cidade}','mt','primary','none','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('defesa-civil-mt','Defesa Civil de MT','https://www.defesacivil.mt.gov.br','page',null,'{servicos,clima}','mt','primary','reproduction','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('inmet','INMET','https://portal.inmet.gov.br','api',null,'{clima}','nacional','primary','none','summary_2_sentences',true,'paused','feed a descobrir e validar (P3 Task 3)'),
('agencia-brasil','Agência Brasil (EBC)','https://agenciabrasil.ebc.com.br','rss',null,'{politica,economia,cidade}','nacional','verified','reproduction','summary_2_sentences',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('gazeta-digital','Gazeta Digital','https://www.gazetadigital.com.br','rss',null,'{cidade,politica,economia,esportes,cultura}','cuiaba','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('olhar-direto','Olhar Direto','https://www.olhardireto.com.br','rss',null,'{cidade,politica,economia}','cuiaba','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('rdnews','RDNews','https://www.rdnews.com.br','rss',null,'{politica,cidade,cultura}','cuiaba','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('midianews','MidiaNews','https://www.midianews.com.br','rss',null,'{politica,cidade,economia}','cuiaba','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('g1-mt','g1 Mato Grosso','https://g1.globo.com/mt/mato-grosso/','rss',null,'{cidade,politica,economia,esportes}','mt','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('folhamax','FolhaMax','https://www.folhamax.com','rss',null,'{politica,cidade}','cuiaba','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('hipernoticias','HiperNotícias','https://www.hnt.com.br','rss',null,'{cidade,politica}','cuiaba','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('reporter-mt','Repórter MT','https://www.reportermt.com.br','rss',null,'{cidade,politica}','mt','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('diario-de-cuiaba','Diário de Cuiabá','https://www.diariodecuiaba.com.br','rss',null,'{cidade,politica}','cuiaba','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('circuito-mt','Circuito Mato Grosso','https://circuitomt.com.br','rss',null,'{politica,economia}','mt','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('o-documento','O Documento','https://www.odocumento.com.br','rss',null,'{politica}','mt','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('leiagora','Leia Agora','https://www.leiagora.com.br','rss',null,'{cidade,politica}','mt','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('so-noticias','Só Notícias','https://www.sonoticias.com.br','rss',null,'{cidade,economia}','mt','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('olhar-conceito','Olhar Conceito','https://www.olhardireto.com.br/conceito/','rss',null,'{cultura,entretenimento,gastronomia}','cuiaba','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('agro-olhar','Agro Olhar','https://www.olhardireto.com.br/agro/','rss',null,'{economia}','mt','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('olhar-esportivo','Olhar Esportivo','https://www.olhardireto.com.br/esportes/','rss',null,'{esportes}','mt','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('imea','Imea','https://www.imea.com.br','page',null,'{economia}','mt','primary','none','summary_2_sentences',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('canal-rural','Canal Rural','https://www.canalrural.com.br','rss',null,'{economia}','nacional','standard','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)'),
('cnn-brasil-mt','CNN Brasil · Mato Grosso','https://www.cnnbrasil.com.br/nacional/centro-oeste/mt/','page',null,'{cidade,politica}','nacional','verified','reproduction','link_only',false,'paused','feed a descobrir e validar (P3 Task 3)')
on conflict (slug) do nothing;
