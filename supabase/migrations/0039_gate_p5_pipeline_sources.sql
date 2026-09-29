-- Gate da P5 (frente B), B4-R2: `sources.base_url` e `feed_url` só aceitam http e https. O robô nunca
-- pede outro esquema (a rede recusa), mas um `javascript:` ou `data:` gravado viraria link no painel.
-- Dados existentes: feed fora do padrão vira `null` (a descoberta refaz); base sem esquema válido
-- ganha `https://` na frente do que sobrar depois de tirar o esquema.

update sources set feed_url = null
  where feed_url is not null and feed_url !~* '^https?://';

update sources
  set base_url = 'https://' || regexp_replace(base_url, '^[a-zA-Z][a-zA-Z0-9+.-]*:(//)?', '')
  where base_url !~* '^https?://';

alter table sources
  add constraint sources_urls_http
  check (base_url ~* '^https?://' and (feed_url is null or feed_url ~* '^https?://'));
