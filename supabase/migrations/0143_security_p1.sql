-- Segurança P1 · correções da auditoria (docs/security-audit/issues.md).
-- Spec: docs/superpowers/specs/2026-10-04-seguranca-p1-design.md
--
-- Aditiva e idempotente. Cada achado tem uma seção `-- C1-xx` própria.

-- C1-01 · Anônimos leem versões de matérias só pela view pública.
-- A política `article_versions_read_public` liberava a tabela inteira (snapshot, origin, author_id)
-- a anon e authenticated. O histórico público passa só por `public_article_versions` (roda com os
-- direitos do dono). A equipe segue lendo pela política `article_versions_read_staff`.
drop policy if exists article_versions_read_public on article_versions;

-- C1-03 · `push_audit` só para quem gere push e com detalhes limitados.
-- A função é `security definer` e estava liberada a qualquer pessoa logada: dava para gravar linhas
-- `push.*` falsas em audit_log. Agora exige `push_can(auth.uid(), 'push.settings')` (admin e
-- editor_chefe; service_role não tem auth.uid() e continua barrado aqui, o pipeline grava direto) e
-- recusa detalhes acima de 2 KB. Ordem: papel (42501), prefixo (22023), tamanho (22023).
-- Mesma assinatura, então `create or replace` mantém o único chamador, `push_resume_request`.
create or replace function public.push_audit(p_action text, p_object text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not push_can(auth.uid(), 'push.settings') then
    raise exception 'sem permissão para auditar o push (push.settings)' using errcode = '42501';
  end if;
  if p_action not like 'push.%' then
    raise exception 'ação % fora do push', p_action using errcode = '22023';
  end if;
  if octet_length(coalesce(p_details, '{}'::jsonb)::text) > 2048 then
    raise exception 'detalhes acima de 2 KB' using errcode = '22023';
  end if;
  insert into audit_log (actor, action, object_ref, details)
  values (coalesce(auth.uid()::text, 'sistema'), p_action, p_object, coalesce(p_details, '{}'::jsonb));
end
$$;
revoke execute on function public.push_audit(text, text, jsonb) from public, anon;
grant execute on function public.push_audit(text, text, jsonb) to authenticated, service_role;
