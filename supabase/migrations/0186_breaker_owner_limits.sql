-- A-126 · Limites do disjuntor decididos pelo dono: 300 publicações automáticas por hora e 3.000
-- por dia. Produção já usa esses valores (ajustados por script); aqui o padrão da tabela e a linha
-- de um banco novo (local, CI, restauração) passam a nascer com eles. Linha já ajustada por uma
-- pessoa (valores diferentes do padrão antigo 60/800) não muda. Aditiva e idempotente.
alter table public.publish_breaker alter column hourly_limit set default 300;
alter table public.publish_breaker alter column daily_limit set default 3000;

update public.publish_breaker
   set hourly_limit = 300, daily_limit = 3000, updated_at = now()
 where id and hourly_limit = 60 and daily_limit = 800;
