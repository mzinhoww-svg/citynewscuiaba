-- Seed inicial (fictício). P0 Task 7 completa com matérias, tópicos, eventos, coleções e usuários.
insert into sections (slug, name, parent_slug, autonomy_category) values
 ('cidade','Cidade',null,'cidade'), ('politica','Política',null,'politica'), ('economia','Economia',null,'economia'),
 ('cultura','Cultura',null,'cultura'), ('esportes','Esportes',null,'esportes'), ('entretenimento','Entretenimento',null,'cultura'),
 ('gastronomia','Gastronomia',null,'cultura'), ('servicos','Serviços',null,'servicos'), ('guia-cuiaba','Guia Cuiabá',null,'servicos'),
 ('seguranca','Segurança',null,'seguranca'), ('saude','Saúde',null,'saude'), ('agenda','Agenda',null,'agenda'), ('clima','Clima','servicos','clima');

insert into sources (slug, name, base_url, kind, feed_url, categories, locality, reliability, image_policy, republish_policy, may_be_sole_source, agreement_until) values
 ('folha-do-cerrado','Folha do Cerrado','https://folhadocerrado.example','rss','https://folhadocerrado.example/feed','{politica,cidade}','cuiaba','verified','with_agreement','summary_2_sentences',false,'2026-12-31'),
 ('diario-da-baixada','Diário da Baixada','https://diariodabaixada.example','rss','https://diariodabaixada.example/rss','{cidade}','cuiaba','verified','none','summary_2_sentences',false,'2026-12-31'),
 ('mt-agora','MT Agora','https://mtagora.example','sitemap','https://mtagora.example/sitemap-news.xml','{cidade,economia,politica}','mt','verified','with_agreement','summary_2_sentences',false,'2027-03-31'),
 ('portal-varzea','Portal Várzea','https://portalvarzea.example','rss','https://portalvarzea.example/feed','{cidade}','varzea-grande','standard','none','link_only',false,null),
 ('radio-pantanal','Rádio Pantanal','https://radiopantanal.example','page',null,'{cidade,esportes}','cuiaba','standard','none','link_only',false,null),
 ('correio-mato-grossense','Correio Mato-grossense','https://correiomt.example','rss','https://correiomt.example/rss','{economia,cidade}','mt','standard','none','link_only',false,null),
 ('agro-em-pauta-mt','Agro em Pauta MT','https://agroempauta.example','rss','https://agroempauta.example/feed','{economia}','mt','verified','with_agreement','summary_2_sentences',false,'2026-12-31'),
 ('cena-cuiabana','Cena Cuiabana','https://cenacuiabana.example','rss','https://cenacuiabana.example/feed','{cultura}','cuiaba','standard','none','link_only',false,null),
 ('placar-mt','Placar MT','https://placarmt.example','rss','https://placarmt.example/rss','{esportes}','mt','standard','none','link_only',false,null),
 ('agencia-mt','Agência MT (governo)','https://agenciamt.example','api','https://agenciamt.example/api/noticias','{cidade,servicos,agenda,clima}','mt','primary','licensed_only','summary_2_sentences',true,null),
 ('diario-oficial-de-cuiaba','Diário Oficial de Cuiabá','https://diariooficial.example','api','https://diariooficial.example/api/atos','{politica,cidade}','cuiaba','primary','none','summary_2_sentences',true,null),
 ('brasil-hoje','Brasil Hoje','https://brasilhoje.example','rss','https://brasilhoje.example/feed','{economia,politica}','nacional','standard','none','link_only',false,null);
