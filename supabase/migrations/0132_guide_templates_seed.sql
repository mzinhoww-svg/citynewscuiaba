-- GUIA-T4 · Catálogo inicial de 30 modelos (categoria x bairro x cozinha), spec G8.
-- Aditiva e idempotente (`on conflict do nothing`): rodar de novo não duplica nem desfaz ajustes
-- feitos pelo Estúdio. Bairros seguem a taxonomia do portal (src/content/pt-BR/neighborhoods.ts).

insert into public.guide_templates (slug, title, noun, category, subcategory, neighborhood, take, min_venues) values
  -- Cuiabá inteira
  ('padarias-cuiaba', 'As 5 melhores padarias de Cuiabá', 'padarias', 'padaria', null, null, 5, 5),
  ('cafeterias-cuiaba', 'As 5 melhores cafeterias de Cuiabá', 'cafeterias', 'cafeteria', null, null, 5, 5),
  ('restaurantes-cuiaba', 'Os 10 melhores restaurantes de Cuiabá', 'restaurantes', 'restaurante', null, null, 10, 8),
  ('pizzarias-cuiaba', 'As 5 melhores pizzarias de Cuiabá', 'pizzarias', 'pizzaria', null, null, 5, 5),
  ('hamburguerias-cuiaba', 'As 5 melhores hamburguerias de Cuiabá', 'hamburguerias', 'hamburgueria', null, null, 5, 5),
  ('churrascarias-cuiaba', 'As 5 melhores churrascarias de Cuiabá', 'churrascarias', 'churrascaria', null, null, 5, 5),
  ('sorveterias-cuiaba', 'As 5 melhores sorveterias de Cuiabá', 'sorveterias', 'sorveteria', null, null, 5, 5),
  ('bares-cuiaba', 'Os 10 melhores bares de Cuiabá', 'bares', 'bar', null, null, 10, 8),
  ('lanchonetes-cuiaba', 'As 5 melhores lanchonetes de Cuiabá', 'lanchonetes', 'lanchonete', null, null, 5, 5),
  ('hoteis-cuiaba', 'Os 5 melhores hotéis de Cuiabá', 'hotéis', 'hotel', null, null, 5, 5),
  ('museus-cuiaba', 'Os 5 melhores museus de Cuiabá', 'museus', 'museu', null, null, 5, 5),
  ('parques-cuiaba', 'Os 5 melhores parques de Cuiabá', 'parques', 'parque', null, null, 5, 5),
  -- Por cozinha
  ('restaurantes-italianos-cuiaba', 'Os 5 melhores restaurantes italianos de Cuiabá', 'restaurantes italianos', 'restaurante', 'italiana', null, 5, 5),
  ('restaurantes-japoneses-cuiaba', 'Os 5 melhores restaurantes japoneses de Cuiabá', 'restaurantes japoneses', 'restaurante', 'japonesa', null, 5, 5),
  ('restaurantes-arabes-cuiaba', 'Os 5 melhores restaurantes árabes de Cuiabá', 'restaurantes árabes', 'restaurante', 'arabe', null, 5, 5),
  ('restaurantes-regionais-cuiaba', 'Os 5 melhores restaurantes de comida regional de Cuiabá', 'restaurantes de comida regional', 'restaurante', 'regional', null, 5, 5),
  ('restaurantes-de-peixe-cuiaba', 'Os 5 melhores restaurantes de peixe de Cuiabá', 'restaurantes de peixe', 'restaurante', 'peixe', null, 5, 5),
  ('restaurantes-vegetarianos-cuiaba', 'Os 5 melhores restaurantes vegetarianos de Cuiabá', 'restaurantes vegetarianos', 'restaurante', 'vegetariana', null, 5, 5),
  -- Por bairro
  ('padarias-coxipo', 'As 5 melhores padarias do Coxipó', 'padarias', 'padaria', null, 'Coxipó', 5, 5),
  ('restaurantes-coxipo', 'Os 5 melhores restaurantes do Coxipó', 'restaurantes', 'restaurante', null, 'Coxipó', 5, 5),
  ('sorveterias-coxipo', 'As 5 melhores sorveterias do Coxipó', 'sorveterias', 'sorveteria', null, 'Coxipó', 5, 5),
  ('restaurantes-centro-sul', 'Os 5 melhores restaurantes do Centro Sul', 'restaurantes', 'restaurante', null, 'Centro Sul', 5, 5),
  ('padarias-centro-sul', 'As 5 melhores padarias do Centro Sul', 'padarias', 'padaria', null, 'Centro Sul', 5, 5),
  ('cafeterias-centro-sul', 'As 5 melhores cafeterias do Centro Sul', 'cafeterias', 'cafeteria', null, 'Centro Sul', 5, 5),
  ('bares-centro-norte', 'Os 5 melhores bares do Centro Norte', 'bares', 'bar', null, 'Centro Norte', 5, 5),
  ('restaurantes-jardim-italia', 'Os 5 melhores restaurantes do Jardim Itália', 'restaurantes', 'restaurante', null, 'Jardim Itália', 5, 5),
  ('pizzarias-jardim-italia', 'As 5 melhores pizzarias do Jardim Itália', 'pizzarias', 'pizzaria', null, 'Jardim Itália', 5, 5),
  ('restaurantes-morada-da-serra', 'Os 5 melhores restaurantes da Morada da Serra', 'restaurantes', 'restaurante', null, 'Morada da Serra', 5, 5),
  ('lanchonetes-cpa', 'As 5 melhores lanchonetes do CPA', 'lanchonetes', 'lanchonete', null, 'CPA', 5, 5),
  ('restaurantes-porto', 'Os 5 melhores restaurantes do Porto', 'restaurantes', 'restaurante', null, 'Porto', 5, 5)
on conflict (slug) do nothing;
