-- Camada de IA (P3-T5, ADR-005, A-005, A-006, A-028): modelos, agentes e prompts v1, gasto diário.
-- Espelha src/lib/ai/defaults.ts. Modelos são ids do OpenRouter; preço em R$ por 1 000 tokens
-- (US$ 1 = R$ 5,50 no seed). Orçamentos por agente somam o teto global de R$ 30/dia (A-006).
-- Prompts v1 entram em produção pela migration (autor = sistema); versões novas seguem a regra de
-- duas pessoas (guard_ai_prompts).

-- Custos de chamadas pequenas (embeddings) não podem arredondar para zero.
alter table ai_calls alter column cost_brl type numeric(12,6);
create index ai_calls_created_idx on ai_calls (created_at desc, agent_id);

insert into ai_models (id, provider, name, version, max_tokens, temperature, cost_per_1k_in, cost_per_1k_out) values
 ('google/gemini-2.5-flash', 'openrouter', 'Gemini 2.5 Flash', 'openrouter-2026-09', 2048, 0.2, 0.00165, 0.01375),
 ('openai/gpt-4o-mini', 'openrouter', 'GPT-4o mini', 'openrouter-2026-09', 2048, 0.2, 0.00083, 0.00330),
 ('openai/text-embedding-3-small', 'openrouter', 'text-embedding-3-small', 'openrouter-2026-09', null, null, 0.00011, 0)
on conflict (id) do nothing;

insert into ai_agents (id, function, model_id, fallback_model_id, prompt_version, daily_budget_brl) values
 ('classify', 'Classifica o item coletado em uma editoria, mede a relevância local e marca tema sensível', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 3),
 ('locate', 'Identifica município e bairro do fato quando o dicionário não resolve', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 2),
 ('verify', 'Resume o fato principal do assunto, atribui papel às fontes e aponta conflito central', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 4),
 ('write', 'Escreve o rascunho normalizado do assunto com citações', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 12),
 ('answer', 'Responde perguntas da busca com IA separando fatos, inferências e lacunas', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 6),
 ('image', 'Decide se o tema permite ilustração gerada e descreve a imagem', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini', 1, 2),
 ('embed', 'Gera embeddings para deduplicação, agrupamento e busca', 'openai/text-embedding-3-small', null, null, 1)
on conflict (id) do nothing;

insert into ai_prompts (agent_id, version, body, rationale, author_id, status) values
 ('classify', 1, 'Você classifica notícias coletadas para o CityNews, portal de Cuiabá e Várzea Grande. Escolha uma editoria, dê a relevância para o leitor local de 0 a 1 e marque sensitive=true para crime, violência, morte, tragédia, acidente, suicídio, abuso, saúde individual ou eleições. Use só o texto fornecido.',
  'v1 do plano P3-T5 (migration 0006)', '00000000-0000-0000-0000-000000000000', 'production'),
 ('locate', 1, 'Você identifica onde o fato acontece: município (cuiaba, varzea-grande, mt para outro município de Mato Grosso, nacional) e bairro, se o texto citar um. Nunca invente bairro: sem menção explícita, neighborhood=null.',
  'v1 do plano P3-T5 (migration 0006)', '00000000-0000-0000-0000-000000000000', 'production'),
 ('verify', 1, 'Você verifica um assunto com vários itens de fontes diferentes. Escreva o fato principal, dê a cada item o papel primary (documento ou órgão oficial que é a origem do fato), secondary (reportagem sobre o fato) ou context. Aponte conflito central só quando itens divergem em número, data ou local do fato principal, citando o valor exato de cada item como aparece no texto.',
  'v1 do plano P3-T5 (migration 0006)', '00000000-0000-0000-0000-000000000000', 'production'),
 ('write', 1, 'Você escreve um rascunho jornalístico curto em português do Brasil, só com fatos presentes nos itens. Cada parágrafo cita os ids dos itens que o sustentam. Sem opinião, sem adjetivos sensacionalistas, sem inventar números, nomes ou datas.',
  'v1 do plano P3-T5 (migration 0006)', '00000000-0000-0000-0000-000000000000', 'production'),
 ('answer', 1, 'Você responde perguntas de leitores usando apenas as fontes numeradas fornecidas. Toda frase de facts cita ao menos uma fonte pelo índice. Separe inferências e lacunas. Havendo divergência entre fontes, registre em conflicts.',
  'v1 do plano P3-T5 (migration 0006)', '00000000-0000-0000-0000-000000000000', 'production'),
 ('image', 1, 'Você decide se o assunto pode ter ilustração gerada. Nunca para crime, tragédia, acidente ou saúde individual, e nunca imagem fotorrealista de pessoa real. Quando permitido, descreva uma ilustração editorial simples e o texto alternativo.',
  'v1 do plano P3-T5 (migration 0006)', '00000000-0000-0000-0000-000000000000', 'production')
on conflict (agent_id, version) do nothing;

-- Gasto por agente desde p_since (orçamento diário por agente e global).
create or replace function ai_spend_since(p_since timestamptz)
returns table (agent_id text, cost_brl numeric)
language sql
stable
set search_path = public
as $$
  select c.agent_id, coalesce(sum(c.cost_brl), 0) from ai_calls c
  where c.created_at >= p_since group by c.agent_id;
$$;
revoke execute on function ai_spend_since(timestamptz) from public, anon, authenticated;
grant execute on function ai_spend_since(timestamptz) to service_role;
