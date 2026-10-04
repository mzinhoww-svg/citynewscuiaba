-- A-125 · Religar a publicação automática sem segunda pessoa (decisão do dono, 04/10/2026).
-- O sistema opera com uma pessoa só; o gatilho de 0035 travava o religar pelo Estúdio. Religar
-- passa a ser ação direta de admin (RLS de feature_flags), auditada (`flag.set`) e com o
-- disjuntor zerado pelo comando de contingência. Alterar regras continua com aprovação.
drop trigger if exists feature_flags_two_person on public.feature_flags;
drop function if exists public.guard_feature_flags();
