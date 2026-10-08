# Política de mídia

Data: 04/10/2026. Estado atual, lacunas e política para imagens e outros ativos. Legenda [O]/[I]/[R] em `AUDIT-REPORT.md`.

> **Decisão do dono D-02 (A-134), implementada:** imagens encontradas na web podem ser usadas com crédito e o aviso **"Foto: reprodução web"**, e todo ativo fica no **Media Registry** (migration 0152): `media_assets` com `rights_status` (imagem da web sem autorização registrada = `unknown`), `usage_scope`, `disclaimer`, `updated_at`, `archived_at`; `article_media.credit_shown`; visão `media_registry` com direitos efetivos e as matérias que usaram cada ativo. Ativo bloqueado ou vencido nunca volta a ser escolhido. O aviso não equivale a autorização; a legalidade de cada uso depende da revisão jurídica (B-002). As propostas das seções 3 e 4 que a D-02 não adotou (`og:image` só com escopo `social`, sem recorte) ficam como evolução futura, sob nova decisão. O Media Registry é a primeira etapa: a separação entre metadados e arquivo e o hash permitem trocar o storage, servir por CDN e incluir vídeo, áudio e infográfico depois.

## 1. Princípio

**Acessar uma imagem não é ter o direito de republicá-la.** Uma foto visível num portal de notícias tem autor e titular; o fato de o robô conseguir baixá-la não muda isso. Toda imagem publicada precisa de uma base de uso registrada no ativo: acordo, licença, produção própria, domínio público ou licença livre com suas condições, geração própria, ou reprodução sob uma política assumida pelo dono com prazo de remoção.

## 2. Como funciona hoje

| Aspecto | Estado [O] | Evidência |
|---|---|---|
| Origem do candidato | `imageUrl` do feed ou `og:image`/`twitter:image` da página | `steps/enrich.ts:110,150`, `extract.ts:312` |
| Quando baixa | Só com acordo vigente ou política `reproduction` + flag `image_reproduction_enabled`; mesmo domínio da fonte, robots, limite da fonte | `steps/media.ts:62-74,130-150` |
| Análise | `sharp` mede formato, dimensões, dHash, sha256, nitidez; não transforma | `media/analyze.ts` |
| Checagens | lado maior ≥ 600 px; duplicata por dHash ≤ 8; marca d'água só pela URL; rejeita com título sensacionalista | `media/checks.ts` |
| Cascata | acordo → reprodução → licenciada (sempre vazia) → acervo (vazio na prática) → IA (sem gerador) → cartão tipográfico | `media/choose.ts:105-176`, `steps/media.ts:362` |
| Registro | `media_assets` com tipo, origem, página, fonte, licença, crédito, autor, uso permitido, validade, risco, pHash, sha256, proveniência, status | `0001_init.sql:157-171`, `0004:620-630` |
| Vínculo | `article_media` com papel (capa, interna), alt, legenda, justificativa, quem escolheu | `0052_article_media_role.sql` |
| Licença vencida | bloqueada no banco; radar de 30 dias | `0023:710,946`, `media/licenses.ts` |
| Serviço | bucket privado; `/api/media/[id]` só para `approved`, redireciona para URL assinada de 300 s | `media/serve.ts:62-131` |
| Remoção | `takedownReproduction` bloqueia, apaga a cópia, revalida, audita, mantém a URL bloqueada | `media/takedown.ts` |
| Rótulo público | "Reprodução web · Fonte" + fotógrafo + "Ver original"; imagem gerada aparece como "Imagem ilustrativa" | `labels/index.ts:141-145`, `content/pt-BR/labels.ts:39` |
| Vídeo e áudio | inexistentes | `0001_init.sql:17` |

## 3. Lacunas e riscos

| ID | Lacuna | Gravidade |
|---|---|---|
| M-01 | Reprodução sem permissão registrada contradiz a regra 4; revisão jurídica (B-002) não feita antes do lançamento | P0 (P0-04) |
| M-02 | Capa reproduzida vira `og:image` e circula em redes sem crédito nem link | P0 |
| M-03 | `object-cover` recorta a foto reproduzida, contra o "sem recorte de crédito" | P1 |
| M-04 | Prazo de 24 h de remoção é promessa no texto; não há relógio, fila nem alerta | P1 |
| M-05 | Sem envio de foto própria, licenciada ou de acervo: as bases de uso mais seguras estão vazias e a reprodução virou o caminho padrão | P1 |
| M-06 | Política `licensed_only` nunca consumida | P2 |
| M-07 | Sem variantes, `srcset`, WebP/AVIF; serve o arquivo original | P2 |
| M-08 | Imagem gerada (quando houver gerador) seria rotulada só "Imagem ilustrativa" | P2 (D-06) |
| M-09 | Marca d'água detectada só pela URL | P3 |
| M-10 | Arquivos do bucket fora do backup | P1 (P1-07) |

## 4. Política proposta [R]

### 4.1 Bases de uso, em ordem de preferência

| Base | Registro obrigatório no ativo | Uso permitido | Rótulo público |
|---|---|---|---|
| Produção própria | autor, data | todos, inclusive `og:image` | "Foto: {autor}/CityNews" |
| Acordo com a fonte | `agreement_until`, termo | conforme acordo | "Foto: {autor}/{fonte}" |
| Licenciada (banco de imagens) | provedor, ID, licença, validade | conforme licença | "Foto: {autor}/{provedor}" |
| Licença livre / domínio público | URL da licença, autor, versão (ex.: CC BY 4.0) | conforme licença; CC BY exige crédito e link | "Foto: {autor} · {licença}" |
| Oficial institucional | órgão, página; confirmar que o órgão autoriza reprodução | matérias sobre o órgão | "Foto: {órgão}" |
| Gerada | modelo, prompt, data; guardas de `choose.ts` | ilustração de tema não sensível | "Ilustração gerada" (D-06) |
| Reprodução (se o dono mantiver) | fonte, URL de origem, página, autor quando houver, data de coleta, prazo de remoção | só capa e interna da matéria que cita a fonte; **nunca** `og:image`, destaque social, push com imagem | "Reprodução: {fonte}" + link |
| Nenhuma | — | — | cartão tipográfico |

### 4.2 Regras

1. Sem base registrada, não publica imagem: cartão tipográfico. Já é o comportamento da cascata [O].
2. Reprodução nunca vira `og:image` nem imagem de push; a página usa a imagem padrão da marca ou o cartão tipográfico renderizado como imagem.
3. Reprodução nunca é recortada: `object-contain` com fundo neutro ou recorte só quando o crédito não está na imagem e o editor aprovou.
4. Pedido de remoção abre item com prazo de 24 h, medido; vencido, alerta o admin; remoção em lote por fonte (já existe `sourceId` em `takedown.ts`).
5. Ativo com validade (`license_until`, `agreement_until`) sai de circulação no vencimento (já imposto no banco para licença; estender ao acordo).
6. Imagem gerada nunca é fotorrealista de pessoa real nem ilustra crime, tragédia ou saúde individual (regra 9, mantida); sempre rotulada.
7. Imagem coerente com o fato: a legenda diz o que a foto mostra, de quando é e de onde veio; foto de arquivo é marcada "Foto de arquivo".

### 4.3 Sistema de ativos (evolução de `media_assets`)

Campos que faltam: `basis` (base de uso, enum da tabela acima), `license_url`, `usage_scope` (capa, interna, social), `removal_due_at`, `transformations jsonb` (recortes e variantes geradas), `captured_at` (data da foto, quando conhecida), `entities` (quando houver extração). Fluxos que faltam: envio de foto pelo Estúdio com base de uso obrigatória; conector de banco de imagens (P3, com custo); variantes responsivas geradas no envio.

## 5. Outros formatos

Vídeo, áudio, infográfico e documento seguem a mesma tabela de bases de uso. Primeira etapa sugerida: incorporação (embed) oficial do YouTube ou da fonte com link e crédito, sem cópia do arquivo, e `VideoObject` no JSON-LD. Hospedar vídeo próprio fica para quando houver produção própria (P3).
