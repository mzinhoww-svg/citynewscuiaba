# Revisão com leitor de tela (WCAG 2.2 AA) · roteiro

Quem faz: uma pessoa, com VoiceOver (Safari, macOS ou iPhone) e NVDA (Firefox ou Chrome, Windows). Tempo: cerca de 1 hora por leitor. Resultado: preencher a tabela no fim e enviar ao time (ou colar em `docs/reports/a11y.md`, seção "Leitor de tela").

O que já foi verificado por máquina: axe em todas as rotas (0 violações sérias), teclado completo, contraste, alvos de toque. O que só uma pessoa confirma: ordem de leitura, nomes dos controles, anúncios de estado e se o texto faz sentido ouvido.

## Antes de começar
- Use `https://citynewscuiaba.vercel.app`. Teste no celular (iPhone/VoiceOver, Android/TalkBack se houver) e no computador.
- Navegue só com o leitor de tela, de olhos fechados ou com a tela apagada, pelo menos nas duas primeiras rotas.

## Rotas e o que ouvir

| # | Rota | O que deve acontecer |
|---|---|---|
| 1 | `/` | Título da página lido; link "Pular para o conteúdo" funciona; a manchete é um título de nível 1; cada card diz a editoria, o título, a origem (rótulo) e a data, nessa ordem, sem repetir. |
| 2 | `/materia/<qualquer>` | Título (h1), data, rótulos de origem lidos como texto ("Resumo por IA", "Original CityNews" etc.), seção "Fontes" com links que dizem para onde vão ("Abrir original em <veículo>"). |
| 3 | `/fontes` e `/panorama` | Lista de fontes com nome, tipo e botão Seguir com estado ("Seguindo"/"Não seguindo") anunciado ao mudar. Rótulo AGREGADO lido. |
| 4 | `/busca?q=prefeitura` | Campo com nome; contagem de resultados anunciada; resultados navegáveis por título. |
| 5 | `/pergunte` | Campo de pergunta; ao enviar, o estado "carregando" é anunciado; a resposta separa fato, inferência e lacuna com títulos; cada afirmação cita a fonte. Pergunta sem fonte suficiente: a recusa é lida e explica o motivo. |
| 6 | `/entrar` e `/criar-conta` | Campos com rótulos, erros ligados ao campo (lidos ao focar), botão do Google com nome claro, "Agora não" presente nos convites. |
| 7 | Banner de consentimento (1ª visita) | Foco vai ao diálogo, "Só o necessário" e "Aceitar" lidos, Esc fecha, foco volta ao ponto de origem. |
| 8 | `/estudio/fila` (admin) | Tabela com cabeçalhos lidos por célula; abrir um item (`/estudio/fila/<id>`) e aprovar/recusar: botões com nome e confirmação anunciada. |

## Marque em cada rota
- **Ordem de leitura** faz sentido? (sim/não e onde quebra)
- **Todo controle tem nome** (botão, link, campo, ícone)? Algum diz só "botão" ou "link"?
- **Mudanças de estado** são anunciadas (carregando, erro, sucesso, abertura de diálogo)?
- **Imagens**: texto alternativo útil, e decorativas ignoradas?
- **Rótulos de origem** (ORIGINAL CITYNEWS, AGREGADO, RESUMO POR IA, IMAGEM GERADA POR IA…) aparecem na leitura, não só na cor?
- **Atalhos de leitor** funcionam: título (H), região (D/landmarks), link (K), lista (L), tabela (T).

## Tabela de resultado

| Rota | Leitor | Problema encontrado | Gravidade (bloqueia / incomoda / sugestão) |
|---|---|---|---|
| | | | |

Gravidade "bloqueia" = a pessoa não consegue concluir a tarefa (ler a matéria, buscar, entrar, aprovar). Esses entram no ciclo seguinte antes de qualquer divulgação ampla.
