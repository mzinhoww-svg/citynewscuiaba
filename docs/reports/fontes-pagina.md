# Fontes sem feed: seletores `page_list` (2026-10-02)

Coleta com User-Agent `CityNewsBot/1.0`. Validação com o extrator real `extractPageList` (`src/lib/sources/page-list.ts`, vitest) sobre o HTML ao vivo. Nada foi gravado em banco, nenhuma fonte foi ativada. Seletores respeitam `isSafeSelector` (só tipo, classe e id; sem atributo, sem pseudo-classe).

## tjmt (Tribunal de Justiça de MT): APROVADA

- Listagem: https://www.tjmt.jus.br/noticias (Angular com SSR; o HTML já traz os cartões).
- robots.txt: `/robots.txt` responde 302 para `/` (não existe arquivo). Sem regras, logo nada proíbe `/noticias`. Crawl-delay: nenhum. Sugestão conservadora: manter `crawlDelaySec` nulo e frequência de 30 min ou mais.
- `consumption`:

```json
{"strategy":"page_list","pageSelectors":{"item":"div.card-body","link":"a","title":"strong","date":"p"}}
```

- Prova (10 itens, datas de 02/10/2026):
  1. Alto Araguaia torna público edital para credenciamento de defensor dativo — https://www.tjmt.jus.br/noticias/2026/10/alto-araguaia-torna-publico-edital-para-credenciamento-defensor-dativo (2026-10-02T16:50Z)
  2. Conta bancária cedida para movimentação de valores de golpe gera dever de ressarcimento — https://www.tjmt.jus.br/noticias/2026/10/conta-bancaria-cedida-para-movimentacao-valores-golpe-gera-dever-ressarcimento
  3. Da experiência de Mato Grosso à gestão nacional da Justiça Restaurativa — https://www.tjmt.jus.br/noticias/2026/10/experiencia-mato-grosso-a-gestao-nacional-justica-restaurativa

## almt (Assembleia Legislativa de MT): APROVADA (sem data)

- Listagem: https://www.al.mt.gov.br/midia/texto (aba "Notícia" da mídia; renderizada no servidor).
- robots.txt (`User-agent: *`): proíbe `/midia$` (a raiz exata), `/midia*?*` (qualquer query string) e outros caminhos; `/midia/texto` sem query é permitido. `urllib.robotparser`: `can_fetch=True`. Crawl-delay: nenhum. NÃO usar paginação por query string (`?page=`), proibida.
- `consumption`:

```json
{"strategy":"page_list","pageSelectors":{"item":"div.align-items-center","link":"a","title":"h3"}}
```

- Prova (12 itens, notícias de 02/10/2026):
  1. Equipe de TI dará suporte aos canais da ALMT durante a apuração dos votos — https://www.al.mt.gov.br/midia/texto/tecnologia-da-informacao-mobiliza-equipe-para-garantir-funcionamento-dos-canais-da-almt-durante-apuracao-dos-votos/visualizar
  2. TRE-MT informa ausência de denúncias de fake news e destaca ações conjuntas com a ALMT — https://www.al.mt.gov.br/midia/texto/tre-mt-informa-ausencia-de-denuncias-de-fake-news-e-destaca-acoes-conjuntas-com-a-almt/visualizar
  3. CPI apresenta relatório preliminar sobre despesas e contratos da rede estadual de saúde — https://www.al.mt.gov.br/midia/texto/comissao-apresenta-relatorio-preliminar-sobre-despesas-e-contratos-da-rede-estadual/visualizar
- Data: o site mostra "2 DE OUTUBRO DE 2026 ÀS 06:05:00" em `span.text-nowrap`, mas `parseFeedDate` não entende esse formato (com `date: "span.text-nowrap"` o `publishedAt` saiu `null`). Por isso o seletor `date` foi omitido; a data fica nula até o parser aprender "D DE MÊS DE AAAA ÀS HH:MM:SS".

## secom-mt (Governo de MT): DESCARTADA

- `https://www.mt.gov.br` redireciona (302) para `https://portal.mt.gov.br`, um catálogo de serviços em React sem renderização no servidor: `/noticias` devolve só o shell (~7 KB, `<div id="xvia-main">` vazio). Não há cartões no HTML, então `page_list` não extrai nada. O robots do portal permite tudo, mas não ajuda.
- As notícias oficiais estão em `https://www.secom.mt.gov.br/noticias` (Liferay, HTML no servidor), porém o robots.txt dele diz `User-agent: *` / `Disallow: /` com `Crawl-delay: 30`; só Googlebot e Bingbot têm permissão. O `CityNewsBot` NÃO é permitido, logo a fonte é descartada. Não houve tentativa de contorno. Caminho possível: pedir autorização por escrito à Secom/MT, ou usar o `sitemap.xml` apenas se a Secom liberar o bot.

## camara-cuiaba (Câmara Municipal de Cuiabá): DESCARTADA

- `https://www.camaracuiaba.mt.gov.br/` e `/robots.txt` respondem HTTP 200 com a página "Request Rejected" (WAF do tipo F5/BIG-IP) para o `CityNewsBot/1.0`: não há robots.txt legível nem listagem acessível. Sem poder confirmar permissão, a fonte é descartada. Sem tentativa de contornar o WAF (nem trocar de User-Agent). Caminho possível: pedir à Câmara que libere o `CityNewsBot` ou use canal institucional (e-mail de imprensa).

## Resumo

- tjmt: aprovada, 10 itens com data, `div.card-body` / `a` / `strong` / `p`, sem Crawl-delay.
- almt: aprovada, 12 itens sem data (parser não lê datas por extenso), `div.align-items-center` / `a` / `h3`, sem Crawl-delay; proibido usar query string.
- secom-mt: descartada; mt.gov.br é SPA sem HTML de notícias e secom.mt.gov.br proíbe todos os bots exceto Google e Bing.
- camara-cuiaba: descartada; WAF rejeita o bot (Request Rejected).
