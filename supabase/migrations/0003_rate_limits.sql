-- Limites de uso compartilhados (architecture §7): /api/ask (P3) e formulários públicos (P1).
-- Janela fixa por bucket; a chave é sempre um hash (IP com sal diário, anonId ou user id), nunca o dado bruto.
create table if not exists rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, key_hash, window_start)
);
alter table rate_limits enable row level security;
revoke all on rate_limits from anon, authenticated;

-- Registra um uso e diz se ainda está dentro do limite. Só o servidor (service_role) chama.
create or replace function hit_rate_limit(p_bucket text, p_key_hash text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into rate_limits (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key_hash, w, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = rate_limits.hits + 1
  returning hits into n;
  return n <= p_limit;
end $$;
revoke execute on function hit_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, text, int, int) to service_role;

create index if not exists rate_limits_window_idx on rate_limits (window_start);
