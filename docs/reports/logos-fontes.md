# Logos reais das fontes (LOGO-T1, R27)

Problema: em produção "Fontes em destaque" mostrava só monogramas (AB, AO, AL, CR...), porque `sources.logo_path` é nulo em todas as fontes. Decisão R27: o monograma é só reserva; sem logo, o CityNews procura a logo na internet (site oficial e perfis oficiais) antes de cair no monograma.

## O que mudou

| Peça | Onde |
|---|---|
| Descoberta no `<head>` (puro, testado) | `src/lib/sources/logo-discover.ts` |
| Download seguro, `robots.txt`, validação | `src/lib/sources/logo-fetch.ts` |
| Conversão ICO, JPEG, GIF e PNG fora do padrão para PNG quadrado (`sharp`) | `src/lib/sources/logo-image.ts` |
| Fila, prazos e laço (`syncSourceLogos`) | `src/lib/sources/logo-sync.ts` |
| Banco e Storage da rotina | `src/lib/db/source-logo-store.ts`, `src/lib/db/source-logo-run.ts` |
| Rota `POST /api/ingest/source-logos` (CRON_SECRET) | `src/app/api/ingest/source-logos/route.ts` |
| Migration (colunas, gatilho, RPC, tabela de checagens, pg_cron) | `supabase/migrations/0120_source_logos.sql` |
| Botões "Buscar logo" e "Remover logotipo" no Painel de Fontes | `SourceLogoForm`, `discoverLogoAction`, `removeLogoAction` |
| Render: círculo claro, `object-contain`, `alt` = nome, monograma de reserva | `src/components/editorial/AvatarCircle.tsx` (usado por `SourceAvatar`, `SourceCard`, `SourceRow` e pelo carrossel) |
| Dados: `logoUrl` em `SourceEntry`, `logo` em `SourceCardView` e no carrossel da home | `queries/sources.ts`, `queries/home.ts`, `screen.ts` |
| Script de coleta manual | `scripts/ops/sync-source-logos.ts` |

### Como a logo é escolhida

1. Lê o `robots.txt` da fonte; se a página inicial for proibida, nada é baixado.
2. Lê o `<head>` da página inicial e monta até 5 candidatos, nesta ordem: `apple-touch-icon` (maior tamanho declarado), `link rel=icon` PNG/WebP com `sizes` >= 96, `og:logo`, ícones do manifest >= 192, logo do JSON-LD (`logo` da organização) e `og:image` só se a página a declara quadrada (`og:image:width` = `og:image:height`). SVG, `data:` e esquemas que não sejam http(s) nunca entram. URLs relativas são resolvidas.
3. Se nada servir: caminhos conhecidos do domínio (`/apple-touch-icon.png`, `/favicon-192x192.png`, `/favicon.png`...), respeitando o `robots.txt`.
4. Último recurso: a imagem de perfil (`og:image`) dos perfis oficiais que a própria página aponta (JSON-LD `sameAs` e links do corpo para Facebook, Instagram, X e YouTube), respeitando o `robots.txt` de cada rede. Hoje essas redes bloqueiam robôs, então na prática este passo quase nunca entrega; ele existe para os casos em que o perfil é público.
5. Cada candidato é baixado só de host público (SSRF e IP privado bloqueados, redirecionamentos revalidados, no máximo 2 MB, timeout de 10 s, tipo pelos bytes, nunca SVG), convertido se for JPEG, GIF, ICO (PNG embutido) ou PNG grande demais, e validado por `validateLogo` (PNG/WebP, até 200 KB, quadrado, >= 96 px). Imagem quase quadrada (até 12% de diferença) ganha margem para ficar quadrada; logo larga (wordmark) é recusada de propósito, porque ficaria ilegível no círculo. O primeiro que passa é gravado no bucket `source-logos` (mesmo caminho do upload manual: `<id>/<hash>.png`).

### Regras de proteção e uso legal

- `logo_source` guarda `manual` ou `auto`. Qualquer mudança de `logo_path` que não venha da rotina automática (upload ou remoção no Painel) vira `manual` por gatilho no banco, então a rotina nunca sobrescreve logo de uma pessoa. As logos que já existiam na migration viram `manual`.
- `logo_origin_url` registra de onde veio a logo automática. A logo só identifica a fonte (nome ao lado e link ao original). Nenhuma menção a IA em tela pública.
- Remover a pedido da fonte: Painel de Fontes, aba de configuração, "Remover logotipo". Apaga `logo_path` e o arquivo, o monograma volta e a fonte fica `manual` (a busca automática não repõe). Foi usado isso no lugar de uma flag `logo_hidden`: dispensa mexer na view `public_sources` e tem o mesmo efeito.
- Idempotência: toda tentativa grava uma linha em `source_logo_checks`. Sem logo, a fonte volta depois de 7 dias (1 dia se o site estava fora do ar); logo automática é conferida de novo depois de 30 dias.
- Limites da rota: 3 fontes por chamada (`?limit=`, no máximo 8), orçamento de 40 s por chamada, intervalo mínimo de 20 min entre chamadas automáticas (`?force=1` ignora, para o lote manual).

## Roteiro para disparar a coleta em produção

Pré-requisitos: `CRON_SECRET` (o mesmo da Vercel), a URL do portal e Node 22.18 ou mais novo. O segredo fica só no ambiente do terminal.

1. **Deploy e migration.** Depois do deploy, confira no SQL Editor do Supabase: `select count(*) from source_logo_checks;` (deve responder 0, a tabela existe) e `select logo_source from sources limit 1;`.
2. **Ensaio (não grava nada):**

   ```bash
   APP_URL=https://citynewscuiaba.vercel.app CRON_SECRET=... \
     node --no-warnings scripts/ops/sync-source-logos.ts --dry
   ```

   Mostra, fonte por fonte, qual imagem seria usada (`OK`) e quais não têm logo possível (`--`). O ensaio percorre a fila inteira em chamadas de 3 fontes.

3. **Coleta real (grava):**

   ```bash
   APP_URL=https://citynewscuiaba.vercel.app CRON_SECRET=... \
     node --no-warnings scripts/ops/sync-source-logos.ts
   ```

   Roda em lotes de 3 fontes até a fila zerar ("faltam 0") e termina com a lista das fontes sem logo possível. Pode repetir sem medo: quem já foi tentado não volta antes do prazo. Uma fonte só: `--id <uuid>`.

4. **Conferir.** A home atualiza em até 1 minuto (cache da home); abra "Fontes em destaque" e `/fontes`. As fontes com logo mostram a marca no círculo claro; as sem logo continuam com o monograma.
5. **Fontes sem logo possível:** enviar o arquivo (PNG ou WebP quadrado, 96 px ou mais, até 200 KB) em Painel de Fontes, a fonte, Configuração, "Enviar logotipo". Logo enviada por você vira `manual` e nunca é trocada.
6. **Rotina semanal:** a migration agenda `source-logos` no pg_cron (segundas, de hora em hora, a rota trata poucas fontes por chamada). Ela só agenda se pg_cron, pg_net e os segredos `app_url` e `cron_secret` do Vault existirem (os mesmos da Agenda). Confira com `select jobname, schedule from cron.job where jobname = 'source-logos';`. Se vier vazio, rode `select public.schedule_source_logos_cron();` para ver o motivo; enquanto isso, o script do passo 3 faz o mesmo à mão.

## Ensaio de descoberta contra sites reais (ambiente de desenvolvimento, 2026-10-04)

Rodei a mesma descoberta (só leitura, `CityNewsBot`, `robots.txt` respeitado) contra as páginas iniciais das fontes do registro. O IP do ambiente de teste é diferente do da Vercel, então um 403 aqui pode não se repetir em produção. O ensaio de produção (passo 2) é a lista oficial.

| Fonte | Resultado | O que foi usado |
|---|---|---|
| CNN Brasil · Mato Grosso | achou | logo do JSON-LD (`organization.jpg`, 512 px, convertida para PNG) |
| Canal Rural | achou | `apple-touch-icon` 180 px |
| INMET | achou | `apple-touch-icon` 180 px |
| Gazeta Digital | achou | `apple-touch-icon` 180 px |
| FolhaMax | achou | `apple-touch-icon` 180 px |
| RDNews | achou | `link rel=icon` 96 px |
| Assembleia Legislativa de MT | achou | `favicon.png` 96 px |
| Prefeitura de Várzea Grande | achou | `favicon.png` 160 px |
| g1 Mato Grosso | inconclusivo | 403 (WAF) para o ambiente de teste; refazer em produção |
| Diário de Cuiabá | inconclusivo | 403 (Cloudflare) para o ambiente de teste |
| Olhar Direto (Olhar Conceito, Agro Olhar) | sem logo possível | manifest declara 192 px mas o arquivo tem 78 x 89 px; favicon 32 px |
| Prefeitura de Cuiabá | sem logo possível | só `favicon.ico` (BMP de 32 px) e `og:image` não declarada como quadrada |
| Tribunal de Justiça de MT | sem logo possível | `favicon.png` menor que 96 px; `og:image` larga |
| Agência Brasil (EBC) | sem logo possível | 403 nos caminhos de ícone; favicon menor que 96 px |
| Só Notícias | sem logo possível | logo do JSON-LD não é quadrada |
| MidiaNews | sem logo possível | favicon menor que 96 px |

Fontes sem logo possível (a confirmar no ensaio de produção) para o dono enviar manualmente: Olhar Direto (vale para Olhar Conceito e Agro Olhar, se o dono quiser logos diferentes por editoria), Prefeitura de Cuiabá, Tribunal de Justiça de MT, Agência Brasil, Só Notícias e MidiaNews; g1 Mato Grosso e Diário de Cuiabá se o ensaio de produção também falhar. Sites que só têm wordmark largo ficam no monograma até alguém enviar uma versão quadrada.

## Testes

- Unidade: `logo-discover` (apple-touch-icon vence, SVG ignorado, URL relativa resolvida, og:image só quadrada, manifest, JSON-LD, limite de 5, perfis oficiais), `logo-image` (JPEG e ICO convertidos, não quadrado recusado, pequeno recusado, redução até 200 KB), `logo-fetch` (rede falsa: SSRF, 2 MB, SVG, robots, reservas), `logo-sync` (prazos, limite, `manual` nunca sobrescrito, idempotência, orçamento de tempo), rota (401, limite, intervalo mínimo, skip), componentes (logo + `alt`, `object-contain`, monograma quando falta ou falha, `SourceCard` e carrossel), `SourceLogoForm` (botões).
- Integração (banco local): `tests/integration/source-logos.test.ts` (gatilho `manual`, RPC `source_logo_auto_set`, permissões, checagens).

## Logotipos enviados pelo dono (A-153, 04/10/2026)

12 fontes em destaque receberam o logotipo do pacote do dono, como `manual`: Agência Brasil, Canal Rural, Circuito Mato Grosso, FolhaMax, Gazeta Digital, HiperNotícias, Leia Agora, O Documento, Olhar Direto, Prefeitura de Várzea Grande, RDNews e Só Notícias.

| Peça | Onde |
|---|---|
| Originais e origem de cada arquivo | `assets/source-logos/originais/` (`ORIGEM.txt`) |
| PNG prontos (512 px) e caminho no bucket | `assets/source-logos/<slug>.png`, `manifest.json` |
| Geração | `node scripts/sources/build-source-logos.mjs` |
| Teste (`validateLogo` e hash do caminho) | `scripts/sources/build-source-logos.test.ts` |

Para trocar um deles: substituir o original, rodar o script e enviar o PNG pelo Painel de Fontes (ou pelo mesmo caminho do `manifest.json`). Uso de marca de terceiros: só identifica a fonte; a remoção a pedido do veículo é o botão "Remover logotipo" do Painel.
