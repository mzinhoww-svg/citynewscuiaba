-- Endurecimento pós-0041 (advisors de segurança): a função de trigger de auditoria do push não
-- deve ser chamável pela API (0041 esqueceu o revoke) e as duas funções puras de push fixam o
-- search_path.
revoke execute on function public.audit_push_changes() from public, anon, authenticated;
alter function public.push_ttl_hours(text) set search_path = public;
alter function public.push_transition_ok(text, text) set search_path = public;
