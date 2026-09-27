/** Justificativas de `decidePublication` (pt-BR, com os números usados). */
const n2 = (x: number): string => x.toFixed(2).replace(".", ",");

export const RULE_RATIONALE = {
  breaking: () => "Notícia urgente (breaking) sempre passa por revisão humana.",
  sensitive: (topics: string[]) => `Tema sensível (${topics.join(", ")}) exige revisão humana.`,
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
  image: (category: string) => `Categoria ${category} exige imagem aprovada.`,
  minScore: (score: number, min: number, category: string) =>
    `Confiança ${n2(score)} abaixo do mínimo ${n2(min)} da categoria ${category}.`,
  modeAuto: (category: string, score: number, sources: number) =>
    `Categoria ${category} em modo automático: ${sources} fonte(s), confiança ${n2(score)}.`,
  modeAutoNotify: (category: string, score: number, sources: number) =>
    `Categoria ${category} em modo automático com aviso: ${sources} fonte(s), confiança ${n2(score)}.`,
  modeReview: (category: string) => `Categoria ${category} em modo revisão.`,
} as const;
