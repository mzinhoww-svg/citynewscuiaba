-- Editorias do portal: dado de referência (não fictício), igual em todos os ambientes (B-014).
-- Antes vivia só no seed; produção ficava sem editorias.
insert into sections (slug, name, parent_slug, autonomy_category) values
  ('cidade', 'Cidade', null, 'cidade'),
  ('politica', 'Política', null, 'politica'),
  ('economia', 'Economia', null, 'economia'),
  ('cultura', 'Cultura', null, 'cultura'),
  ('esportes', 'Esportes', null, 'esportes'),
  ('entretenimento', 'Entretenimento', null, 'cultura'),
  ('gastronomia', 'Gastronomia', null, 'cultura'),
  ('servicos', 'Serviços', null, 'servicos'),
  ('guia-cuiaba', 'Guia Cuiabá', null, 'servicos'),
  ('seguranca', 'Segurança', null, 'seguranca'),
  ('saude', 'Saúde', null, 'saude'),
  ('agenda', 'Agenda', null, 'agenda')
on conflict (slug) do nothing;

insert into sections (slug, name, parent_slug, autonomy_category) values
  ('clima', 'Clima', 'servicos', 'clima'),
  ('mobilidade', 'Mobilidade', 'cidade', 'cidade')
on conflict (slug) do nothing;
