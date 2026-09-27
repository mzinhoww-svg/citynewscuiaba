# Perguntas do kickoff (máximo 15, uma única rodada)

**Status: respondido pelo dono em 27/09/2026. Não perguntar de novo.**

Regra: o Claude Code faz estas perguntas **uma vez, juntas**, antes de P0. Pergunta sem resposta usa o padrão. Depois do kickoff, nenhuma pergunta nova (ver `docs/AUTONOMY.md` §2).

| # | Pergunta | Padrão se não houver resposta | Resposta |
|---|---|---|---|
| 1 | Repositório GitHub: usar `mzinhoww-svg/citynewscuiaba` (existe e está vazio)? Público ou privado? | Usar esse repositório, privado | Sim: `mzinhoww-svg/citynewscuiaba`, privado |
| 2 | Domínio de produção? | Subdomínio `*.vercel.app` até haver domínio | Vercel (`*.vercel.app`) por enquanto |
| 3 | Supabase: já existem projetos staging e prod? Região? | Criar apenas localmente; remoto fica pendente em BLOCKERS; região `sa-east-1` | Não existem. Criar (free) e deixar plugado: Vercel ↔ Supabase ↔ GitHub |
| 4 | Plano da Vercel (Hobby ou Pro)? Define `maxDuration` e previews | Hobby; `drain` em lotes pequenos | Hobby |
| 5 | Provedor e modelos de IA (texto e embedding) e se as chaves já estão no ambiente | `AI_PROVIDER=fake` até a chave existir; embedding com dimensão 1536 | OpenRouter (texto e embedding). Chave em `OPENROUTER_API_KEY` |
| 6 | Orçamento diário de IA em reais | R$ 30/dia, pausa em 100% | OK, R$ 30/dia |
| 7 | Credenciais OAuth do Google para login social | Sem Google no início; e-mail + senha + link mágico; botão Google atrás de flag | Google via OAuth do Supabase Auth |
| 8 | Provedor de e-mail transacional (confirmação, newsletter, alertas) | Transport de console e fila `notify`; Resend quando houver chave | E-mail do Supabase Auth no início |
| 9 | Ingestão inicial: só fontes fictícias ou alguma fonte real autorizada (RSS público com permissão)? | Somente fictícias com fixtures locais | Somente fontes reais. Primeira lista em `docs/sources-registry.md` (32 fontes). Testes seguem com fixtures |
| 10 | Banco de imagens licenciadas contratado? | Nenhum; cascata pula licenciadas | Nenhum banco. Usar a imagem da notícia original como **reprodução**, rotulada e creditada (A-010) |
| 11 | E-mail do plantão para alertas operacionais | E-mail do dono do repositório no GitHub | Sim, e-mail do dono do repositório |
| 12 | Grafia da marca na interface: "CityNews" (brand kit) confirmada? | "CityNews"; rótulos de origem em caixa alta ("ORIGINAL CITYNEWS") | Confirmado: CityNews |
| 13 | Existe SVG vetorial oficial do logotipo? | Não; `Logo` em SVG montado a partir do path do símbolo e do wordmark em Schibsted 800 | Não existe. Gerado: `design-system/assets/logo/svg/*` |
| 14 | Dados institucionais para rodapé e privacidade (razão social, CNPJ, encarregado LGPD) | Placeholders marcados `[PREENCHER]` e listados em BLOCKERS | Em aberto: placeholders `[PREENCHER]` |
| 15 | Posso criar recursos gratuitos em seu nome (projeto Vercel, projeto Supabase free, secrets no GitHub)? | Sim para recursos gratuitos; nunca para pagos | Pode: criar tudo o que for gratuito |
