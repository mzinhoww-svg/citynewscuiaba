/**
 * Registro padrão de IA (= `supabase/migrations/0006_ai_seed.sql`). Modelos com ids do OpenRouter
 * e preço em R$ por 1 000 tokens (US$ 1 = R$ 5,50 na data do seed); tudo editável no Control
 * Center. Orçamentos por agente somam o teto global de R$ 30/dia (A-006).
 */
import type { AiModel } from "./types";

export const DEFAULT_MODELS: AiModel[] = [
  {
    id: "google/gemini-2.5-flash",
    maxTokens: 2048,
    temperature: 0.2,
    costPer1kIn: 0.00165,
    costPer1kOut: 0.01375,
    active: true,
  },
  {
    id: "openai/gpt-4o-mini",
    maxTokens: 2048,
    temperature: 0.2,
    costPer1kIn: 0.00083,
    costPer1kOut: 0.0033,
    active: true,
  },
  {
    id: "openai/text-embedding-3-small",
    maxTokens: null,
    temperature: null,
    costPer1kIn: 0.00011,
    costPer1kOut: 0,
    active: true,
  },
];

export interface DefaultAgent {
  id: string;
  fn: string;
  model: string;
  fallback: string | null;
  dailyBudgetBrl: number;
  /** Prompt v1 (produção). `null` para o agente de embeddings. */
  prompt: string | null;
}

const PRIMARY = "google/gemini-2.5-flash";
const FALLBACK = "openai/gpt-4o-mini";

export const DEFAULT_AGENTS: DefaultAgent[] = [
  {
    id: "classify",
    fn: "Classifica o item coletado em uma editoria, mede a relevância local e marca tema sensível",
    model: PRIMARY,
    fallback: FALLBACK,
    dailyBudgetBrl: 3,
    prompt:
      "Você classifica notícias coletadas para o CityNews, portal de Cuiabá e Várzea Grande. Escolha uma editoria, dê a relevância para o leitor local de 0 a 1 e marque sensitive=true para crime, violência, morte, tragédia, acidente, suicídio, abuso, saúde individual ou eleições. Use só o texto fornecido.",
  },
  {
    id: "locate",
    fn: "Identifica município e bairro do fato quando o dicionário não resolve",
    model: PRIMARY,
    fallback: FALLBACK,
    dailyBudgetBrl: 2,
    prompt:
      "Você identifica onde o fato acontece: município (cuiaba, varzea-grande, mt para outro município de Mato Grosso, nacional) e bairro, se o texto citar um. Nunca invente bairro: sem menção explícita, neighborhood=null.",
  },
  {
    id: "verify",
    fn: "Resume o fato principal do assunto, atribui papel às fontes e aponta conflito central",
    model: PRIMARY,
    fallback: FALLBACK,
    dailyBudgetBrl: 4,
    prompt:
      "Você verifica um assunto com vários itens de fontes diferentes. Escreva o fato principal, dê a cada item o papel primary (documento ou órgão oficial que é a origem do fato), secondary (reportagem sobre o fato) ou context. Aponte conflito central só quando itens divergem em número, data ou local do fato principal, citando o valor exato de cada item como aparece no texto.",
  },
  {
    id: "write",
    fn: "Escreve o rascunho normalizado do assunto com citações",
    model: PRIMARY,
    fallback: FALLBACK,
    dailyBudgetBrl: 12,
    prompt:
      "Você escreve um rascunho jornalístico curto em português do Brasil, só com fatos presentes nos itens. Cada parágrafo cita os ids dos itens que o sustentam. Sem opinião, sem adjetivos sensacionalistas, sem inventar números, nomes ou datas.",
  },
  {
    id: "answer",
    fn: "Responde perguntas da busca com IA separando fatos, inferências e lacunas",
    model: PRIMARY,
    fallback: FALLBACK,
    dailyBudgetBrl: 6,
    prompt:
      "Você responde perguntas de leitores usando apenas as fontes numeradas fornecidas. Toda frase de facts cita ao menos uma fonte pelo índice. Separe inferências e lacunas. Havendo divergência entre fontes, registre em conflicts.",
  },
  {
    id: "image",
    fn: "Decide se o tema permite ilustração gerada e descreve a imagem",
    model: PRIMARY,
    fallback: FALLBACK,
    dailyBudgetBrl: 2,
    prompt:
      "Você decide se o assunto pode ter ilustração gerada. Nunca para crime, tragédia, acidente ou saúde individual, e nunca imagem fotorrealista de pessoa real. Quando permitido, descreva uma ilustração editorial simples e o texto alternativo.",
  },
  {
    id: "embed",
    fn: "Gera embeddings para deduplicação, agrupamento e busca",
    model: "openai/text-embedding-3-small",
    fallback: null,
    dailyBudgetBrl: 1,
    prompt: null,
  },
];
