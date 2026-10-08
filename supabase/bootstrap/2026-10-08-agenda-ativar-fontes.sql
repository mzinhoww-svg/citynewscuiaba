-- Agenda multifonte (A-220): ativação das fontes do Radar em produção.
-- Rodar no SQL Editor do Supabase (projeto citynews-prod). O conector segura este `update` à espera
-- de confirmação humana (B-029); o mesmo efeito sai do Painel de Fontes, botão "Ativar", uma a uma.
-- Checagem feita em 08/10/2026: robots.txt e resposta HTTP de cada site.
-- Fontes de leitura por página ficam em `ia_adiada` (sem falha, sem pausa) enquanto o OpenRouter
-- estiver sem crédito (B-034); o Casa de Festas (API estruturada) já coleta.

update sources set status = 'active', status_reason = null, last_error = null
 where kind = 'events' and status = 'paused' and status_reason = 'pending_activation'
   and slug in ('cine-teatro-cuiaba', 'agencia-sebrae-mt', 'allure-music-hall', 'prime-eventos',
                'prefeitura-chapada', 'casa-de-festas', 'musiva', 'bilheteria-digital',
                'descubra-mt', 'centro-eventos-pantanal');

-- Ficam pausadas, com o motivo:
update sources set status_reason = 'robots',
       last_error = 'robots.txt: User-agent * Disallow: / (conferido em 08/10/2026)'
 where slug = 'secel-mt';
update sources set status_reason = 'other',
       last_error = 'Painel respondeu HTTP 404 em 08/10/2026; reconferir a URL.'
 where slug = 'sesc-mt-painel';

select slug, status, status_reason from sources where kind = 'events' order by status, slug;
