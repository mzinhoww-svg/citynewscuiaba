# UI pública: relatório de medição

Plano `2026-10-02-ui-publica`. Este arquivo guarda a baseline (tabela "Antes") e recebe a
tabela "Depois" na última tarefa. Medidas feitas com `pnpm design:shoot` contra o app local
(build de produção, seed local), em 2026-10-02.

## Como medir

```bash
pnpm design:shoot                 # 390x844 e 1280x900, claro e escuro, em tmp/shots/
pnpm design:shoot -- --no-consent # idem, com o banner de consentimento fechado
pnpm design:detect                # detector de anti-padrões (impeccable)
```

As capturas ficam em `tmp/shots/<largura>-<esquema>/<rota>.png` (fora do git) e as medidas em
`tmp/shots/medidas.json`. Variáveis: `--base=<url>` (padrão `http://localhost:3000`) e `--out=<pasta>`.
Nas capturas de página inteira o banner (posição fixa) aparece no meio da imagem; é efeito da
captura, não do layout.

## Antes

| Medida                                                                 | Valor                     | Como foi medido                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Altura da home no celular (390 px)                                     | 9.247 px (9.040 sem banner) | `scrollHeight` do documento em `/`, visitante novo                                                                                  |
| Banner de consentimento na 1ª dobra do celular                         | 24,6% (207 de 844 px)     | altura da região de consentimento sobre a altura da janela, 390x844                                                                 |
| Itens antes do `h1` da matéria (celular)                               | 10                        | elementos com texto próprio dentro de `main` antes do `h1`: trilha (3), plaquetas e rótulos de origem e revisão (7), sem ícones      |

Observações:

- A spec §2 estimou o banner em ~35% da dobra; a medição real é 24,6% (o banner ocupa mais na
  altura quando o texto quebra em telas de 360 px; aqui o viewport é 390 px).
- Os 10 itens antes do `h1` da matéria `prefeitura-detalha-novo-plano-de-onibus-cpa-centro`: Início,
  Mobilidade, título da trilha, Mobilidade, Confirmado, NORMALIZADO PELO CITYNEWS, "4 fontes",
  RESUMO POR IA, REVISADO POR HUMANO, "Otávio Reis".

## Detector de design (baseline)

`pnpm design:detect` acha 2 avisos, ambos `border-accent-on-rounded` (`border-t-2` em elemento
arredondado):

- `src/components/editorial/ConsentBanner.tsx`, linha 115;
- `src/components/editorial/FirstVisitInvite.tsx`, linha 89.

(O plano previa os 2 no `ConsentBanner`; um deles está em `FirstVisitInvite`.) O passo de CI é
não bloqueante até UI-T14.
