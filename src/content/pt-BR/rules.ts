/** Justificativas de `decidePublication` (pt-BR, com os números usados). */
const n2 = (x: number): string => x.toFixed(2).replace(".", ",");

export const RULE_RATIONALE = {
  invalidInput: (fields: string[]) =>
    `Entrada inválida (${fields.join(", ")}): número ausente, negativo ou fora da faixa. Vai para revisão.`,
  breaking: () => "Notícia urgente (breaking) sempre passa por revisão humana.",
  sensitive: (topics: string[]) => `Tema sensível (${topics.join(", ")}) exige revisão humana.`,
  sensitiveFlag: () => "Tema sensível apontado na classificação exige revisão humana.",
  rulesUnavailable: (why: string) =>
    `Regras de autonomia indisponíveis (${why}): revisão obrigatória, falha fechada.`,
  aiUnavailable: (why: string) =>
    `IA indisponível na redação (${why}): rascunho montado sem IA, revisão humana obrigatória.`,
  neverAuto: () =>
    "Notícia urgente, tema sensível, Segurança ou rascunho sem IA nunca publicam sozinhos: vai para revisão.",
  noSource: () =>
    'Matéria sem fonte citada: a publicação automática exige a linha "Com informações de {fonte}". Vai para revisão.',
  noTitle: () => "Matéria sem título: não publica sozinha, vai para revisão.",
  truncatedBody: () =>
    "Corpo cortado no meio de um parágrafo mesmo depois de refeito o texto: vai para revisão.",
  breakerOpen: (why: string) =>
    `Disjuntor de publicação aberto (${why}): publicação automática pausada, vai para revisão.`,
  waitingCover: () => "Capa ainda a caminho: espera até 10 min antes de usar o cartão tipográfico.",
  staleDecision: () => "Decisão de publicação desatualizada: a matéria mudou depois da regra.",
  autoPublishOff: () =>
    "Publicação automática desligada (feature_flags.auto_publish ou modo leitura): vai para revisão.",
  forceReview: (version: number) =>
    `Revisão obrigatória ligada nas regras v${version}: nada é publicado sozinho.`,
  unknownCategory: (category: string) =>
    `Categoria "${category}" sem regra definida: vai para revisão.`,
  blocked: (category: string) => `Categoria ${category} bloqueada para publicação automática.`,
  minSources: (have: number, need: number, category: string) =>
    `${have} fonte(s) independente(s), mínimo ${need} para a categoria ${category}.`,
  primary: (category: string) =>
    `Categoria ${category} exige fonte primária e nenhuma foi encontrada.`,
  conflict: () => "Fontes divergem em fato central: vai para revisão.",
  dubious: () => "Conteúdo marcado como extremamente duvidoso: vai para revisão.",
  untrustedGrave: () =>
    "Fonte não confiável, assunto grave (acusação, saúde individual ou segurança) e sem segunda fonte: vai para revisão.",
  image: (category: string) => `Categoria ${category} exige imagem aprovada.`,
  minScore: (score: number, min: number, category: string) =>
    `Confiança ${n2(score)} abaixo do mínimo ${n2(min)} da categoria ${category}.`,
  modeAuto: (category: string, score: number, sources: number) =>
    `Categoria ${category} em modo automático: ${sources} fonte(s), confiança ${n2(score)}.`,
  modeAutoNotify: (category: string, score: number, sources: number) =>
    `Categoria ${category} em modo automático com aviso: ${sources} fonte(s), confiança ${n2(score)}.`,
  modeReview: (category: string) => `Categoria ${category} em modo revisão.`,
} as const;

/** Textos do revisor automático (AUT-T6): vão para `review_reason` e `decisions`, só no Estúdio. */
export const REVIEW_TEXT = {
  invalidAnswer: () =>
    "O revisor não conseguiu decidir (resposta fora do formato): mantida para uma pessoa.",
  neverArchiveByExpiry: () => "Prazo vencido nunca arquiva matéria: mantida para uma pessoa.",
  heldPrefix: (why: string) => `Revisor automático manteve na fila: ${why}`,
  archivedPrefix: (why: string) => `Arquivada pelo revisor automático: ${why}`,
} as const;

/**
 * Justificativas do motor de autonomia (`src/lib/rules/engine.ts`). Vão para `decisions` e
 * `review_reason`, só no Estúdio e no Control Center.
 */
export const AUTONOMY_TEXT = {
  reprocess: (why: string, attempt: number, total: number, minutes: number) =>
    `${why} Reprocesso automático ${attempt} de ${total} em ${minutes} min.`,
  exhaustedDegraded: (why: string) =>
    `${why} Reprocessos esgotados; risco baixo e texto aceitável: publica em modo degradado.`,
  exhaustedQuarantine: (why: string) =>
    `${why} Reprocessos esgotados e risco alto: isolada em quarentena, fora do ar.`,
  exhaustedHuman: (why: string) =>
    `${why} Reprocessos esgotados sem resolver: exceção para uma pessoa decidir.`,
  duplicate: () => "Duplicata de matéria existente: isolada em quarentena (recomendação: mesclar).",
  stale: (hours: number) =>
    `Notícia com mais de ${hours} h: não publica, isolada em quarentena (recomendação: arquivar).`,
  dubious: () =>
    "Conteúdo marcado como extremamente duvidoso: isolado em quarentena, fora do ar, com recomendação registrada.",
  conflictHuman: () =>
    "Fontes divergem em fato central, com confiança baixa ou tema sensível: exceção humana.",
  conflictAttributed: (why: string) =>
    `Fontes divergem, mas a confiança é alta e há fonte primária confiável: publica com atribuição. ${why}`,
  awaitAutoPublish: () =>
    "Publicação automática desligada pelo dono (auto_publish ou modo leitura): fica em rascunho e volta sozinha quando religar.",
  ownerHold: (why: string) => `${why} Fica em rascunho até as regras mudarem.`,
  ownerReview: (why: string) => `${why} Configuração explícita do dono: exceção humana.`,
  legacyGate: (why: string) => `${why} Regras antigas mantêm o portão: exceção humana.`,
  degraded: (why: string) =>
    `Rascunho degradado (${why}) com qualidade aceitável e risco baixo: publica em modo degradado.`,
  degradedWeak: (why: string) =>
    `Rascunho degradado (${why}) com qualidade baixa ou risco alto: refaz depois.`,
  breakerHold: (why: string) =>
    `Disjuntor de publicação aberto (${why}): fica em rascunho e volta sozinha quando o disjuntor se recuperar.`,
  staleRetry: () =>
    "Decisão de publicação desatualizada: a matéria mudou depois da regra; as regras decidem de novo.",
} as const;
