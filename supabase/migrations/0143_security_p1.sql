-- Segurança P1 · correções da auditoria (docs/security-audit/issues.md).
-- Spec: docs/superpowers/specs/2026-10-04-seguranca-p1-design.md
--
-- Aditiva e idempotente. Cada achado tem uma seção `-- C1-xx` própria.

-- C1-01 · Anônimos leem versões de matérias só pela view pública.
-- A política `article_versions_read_public` liberava a tabela inteira (snapshot, origin, author_id)
-- a anon e authenticated. O histórico público passa só por `public_article_versions` (roda com os
-- direitos do dono). A equipe segue lendo pela política `article_versions_read_staff`.
drop policy if exists article_versions_read_public on article_versions;
