-- A-214 · Rodadas do texto das listas. A rota do cron tem 60 s; cada chamada tenta o modelo uma
-- vez. Reprovado, guarda a contagem e os problemas (pedidos como correção na próxima rodada); na
-- 3ª rodada vale o texto montado com os dados, então nenhuma lista espera para sempre. Aditiva.
alter table public.guide_lists add column if not exists article_attempts smallint not null default 0;
alter table public.guide_lists add column if not exists article_problems text[] not null default '{}';
