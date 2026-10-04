import type { CallAgent } from "@/lib/ai/call-agent";
import type { BreakerStore } from "../breaker";
import { copiedPhrase } from "@/lib/ai/schemas/aggregate-summary";
import { WriteSchema, type WriteOutput } from "@/lib/ai/schemas/write";
import type { AiError } from "@/lib/ai/types";
import { RULE_RATIONALE } from "@/content/pt-BR/rules";
import { err, ok } from "@/lib/result";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import type {
  DraftContext,
  DraftInput,
  DraftItem,
  Embed,
  Flags,
  PublishRepo,
  Revalidate,
  RulesSource,
} from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { bodyLines, insufficientMaterial, MIN_BODY_LINES } from "./auto-checklist";
import { appendCreditLine, creditSourcesOf, type Doc } from "./credit-line";
import { aiStepError, inputHash } from "./understanding";

export interface PublishStepDeps {
  repo: PublishRepo;
  rules: RulesSource;
  flags: Flags;
  callAgent: CallAgent;
  promptVersion: (agentId: string) => Promise<number | null>;
  embed: Embed;
  revalidate: Revalidate;
  now: () => Date;
  /** Descarta parágrafo que copia 8 palavras seguidas da fonte (produção; o provedor falso copia). */
  copyGuard?: boolean;
  /** Disjuntor de volume e de erro (AUT-T4); ausente = sem disjuntor (testes). */
  breaker?: BreakerStore;
}

/**
 * Pedido ao agente `write`: matéria com profundidade e título que chame o clique sem enganar.
 * Profundidade vem dos fatos dos itens (nunca de enchimento); o título promete só o que o texto entrega.
 */
export const WRITE_TASK = [
  "Escreva título, linha fina, resumo e corpo do assunto. Cada parágrafo cita os ids dos itens que o sustentam e usa palavras próprias (nunca 8 palavras seguidas de uma fonte).",
  `CORPO: no mínimo ${MIN_BODY_LINES} linhas (cerca de ${MIN_BODY_LINES * 75} caracteres, de 8 a 12 parágrafos) quando os itens trouxerem fatos para isso; use todo o material de todos os itens do assunto e o contexto que eles dão (menos só se faltar fato nas fontes; nunca encha, nunca invente). Ordem: 1) lide com o fato principal (o quê, quem, onde, quando); 2) detalhes e números exatos; 3) quem fala, atribuído ("segundo a Prefeitura"); 4) contexto que está nos itens (antecedentes, valores, prazos, bairros de Cuiabá e Várzea Grande); 5) o que muda ou o que o leitor precisa fazer, se houver serviço; 6) o que ainda não se sabe ou divergência entre fontes. Cada parágrafo traz um fato novo.`,
  'TÍTULO: específico e chamativo, de 60 a 100 caracteres, com o dado mais forte (número, local, nome, prazo) e verbo ativo; pode abrir uma curiosidade, mas a resposta tem de estar no texto. Proibido: prometer o que o texto não entrega, superlativo sem dado, ponto de exclamação, caixa alta, "você não vai acreditar", "chocante", exagero em crime, tragédia ou saúde. Em tema sensível o título é sóbrio e factual.',
  "LINHA FINA: complementa o título com o segundo dado mais relevante, sem repeti-lo.",
].join("\n");

/**
 * Regras de redação que substituem o portão humano (spec de autonomia §3): segurança, política e
 * saúde publicam sozinhas, então o texto já nasce com presunção de inocência, sem identificar
 * menor nem vítima, sem método de suicídio e sem orientação clínica, sempre atribuído à fonte.
 */
export const REDACTION_RULES =
  'REGRAS DE REDAÇÃO (obrigatórias): 1) presunção de inocência: use "suspeito", "acusado", "segundo a polícia" e nunca "culpado" ou "criminoso" antes de condenação; 2) nenhum menor de idade nem vítima de violência sexual é identificado (nome, foto, escola, endereço, parentesco); 3) em caso de suicídio, nenhum detalhe de método ou local; 4) saúde sem orientação clínica, dose, tratamento nem promessa de cura; 5) atribua sempre à fonte com "segundo {fonte}" ou "de acordo com {fonte}"; fato sem fonte no item não entra no texto.';
const ATTRIBUTION_RULE =
  'ATRIBUIÇÃO: atribua o fato principal à fonte ("segundo {fonte}"). A linha final "Com informações de {fonte}" é acrescentada pelo sistema; não a escreva.';
/** Editorias cujo texto publica sozinho com as regras de redação reforçadas. */
const SENSITIVE_SECTIONS = new Set(["seguranca", "politica", "saude"]);

/** Pedido ao agente `write` para a editoria: regras de redação reforçadas em segurança, política e saúde. */
export function writeTaskFor(section: string, sensitive = false): string {
  return [
    WRITE_TASK,
    ATTRIBUTION_RULE,
    ...(SENSITIVE_SECTIONS.has(section) || sensitive ? [REDACTION_RULES] : []),
  ].join("\n");
}

/** Pedido extra quando o texto anterior ficou curto (R41, até 2 refações). */
const REWRITE_TASK = `REESCRITA: o texto anterior ficou com menos de ${MIN_BODY_LINES} linhas. Refaça usando todos os fatos, números, citações e contexto de TODOS os itens, em 8 a 12 parágrafos curtos; não repita o título nem encha com frases vazias, e não invente nada.`;

/** `topic:<id>`, ou `topic:<id>#rewrite<n>` quando o texto curto volta para ser refeito (R41). */
const TOPIC_REF = /^topic:([^\s#]+)(?:#rewrite(\d+))?$/;
/** Pipeline só reescreve a própria matéria enquanto ela está em rascunho ou revisão. */
const PIPELINE_OWNED = new Set(["draft", "in_review"]);

type Paragraph = { text: string; citations: string[] };

/** Documento do editor (doc → paragraph → text), com as citações em `attrs`. */
export function toDoc(paragraphs: Paragraph[]): Doc {
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      attrs: { citations: p.citations },
      content: [{ type: "text", text: p.text }],
    })),
  };
}

/**
 * Material do redator para um item: o título e o corpo inteiro da página (`enrich`) quando existe,
 * senão o trecho do feed. Uma frase de RSS não sustenta 30 linhas; o corpo da fonte sustenta.
 */
export function materialOf(i: DraftItem): string {
  const text = i.sourceText?.trim() || i.excerpt;
  return text ? `${i.title}\n${text}` : i.title;
}

function roleOf(ctx: DraftContext, item: DraftItem): "primary" | "secondary" | "context" {
  if (item.reliability === "primary") return "primary";
  const r = ctx.verify?.roles?.find((x) => x.id === item.id)?.role;
  return r === "context" ? "context" : "secondary";
}

/** Só parágrafos com citação de item do assunto (nenhuma frase sem fonte). */
export function citedParagraphs(
  out: WriteOutput,
  ids: Set<string>,
  sourceTexts: string[] = [],
): Paragraph[] {
  return (
    out.body
      .map((p) => ({
        text: p.text.trim(),
        citations: [...new Set(p.citations)].filter((c) => ids.has(c)),
      }))
      .filter((p) => p.text.length > 0 && p.citations.length > 0)
      // Texto de terceiros não é republicado: parágrafo que copia 8 palavras seguidas cai
      // (nome próprio e número são fato e quebram a sequência).
      .filter((p) => !sourceTexts.some((t) => copiedPhrase(p.text, t) !== null))
  );
}

/** Rascunho sem IA (Review Focus 4): lista as fontes para a redação escrever. */
function fallbackDraft(ctx: DraftContext): { title: string; dek: string; body: Paragraph[] } {
  return {
    title: ctx.topic.title,
    dek: `Rascunho sem IA com ${ctx.items.length} fonte(s): revise e escreva antes de publicar.`,
    body: ctx.items.map((i) => ({
      text: `${i.sourceName}: ${i.title}${i.excerpt ? `. ${i.excerpt}` : ""} (${i.canonicalUrl})`,
      citations: [i.id],
    })),
  };
}

function summaryWordsFor(section: string): number {
  return DEFAULT_RULES.categories[section]?.summaryWords ?? 60;
}

/**
 * Etapas 11 e 12 (resumo, título e linha fina) pelo agente `write`, com citações por parágrafo.
 * O `callAgent` já tenta o modelo de fallback; se ele também falhar (ou o orçamento acabar, ou a
 * IA estiver desligada), a matéria nasce em revisão com um rascunho sem IA e o motivo: o assunto
 * nunca se perde. Idempotente por (assunto, revisão = itens, versão do prompt). Próxima: `image`.
 */
export function createWriteStep(deps: PublishStepDeps): StepHandler {
  return async (msg, run) => {
    const ref = TOPIC_REF.exec(msg.itemRef);
    const topicId = ref?.[1];
    if (!topicId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const rewrite = Number(ref?.[2] ?? 0);
    const topicRef = `topic:${topicId}`;
    const ctx = await deps.repo.draftContext(topicId);
    if (!ctx) return err(stepError.notFound(`assunto ${topicId} não encontrado`));
    if (ctx.items.length === 0) return ok([]);

    const existing = ctx.article;
    if (existing && (existing.humanEdited || !PIPELINE_OWNED.has(existing.status)))
      return ok([nextMessage(msg, "notify", `article:${existing.id}#new_sources`)]);

    const version = await deps.promptVersion("write");
    const revision = ctx.items
      .map((i) => i.id)
      .sort()
      .join(",");
    const hash = inputHash("write", version, revision, rewrite);
    if (existing && (await deps.repo.findDecision(topicRef, "summarize", hash)))
      return ok([nextMessage(msg, "image", `article:${existing.id}`)]);

    const section =
      ctx.topic.sectionSlug ?? ctx.items.find((i) => i.sectionSlug)?.sectionSlug ?? "cidade";
    const ids = new Set(ctx.items.map((i) => i.id));
    const system = [
      `Editoria: ${section}. Resumo com até ${summaryWordsFor(section)} palavras.`,
      "Itens (id: fonte, papel):",
      ...ctx.items.map((i) => `- ${i.id}: ${i.sourceName} (${roleOf(ctx, i)})`),
    ].join("\n");
    const r = await deps.callAgent(
      "write",
      {
        system,
        data: ctx.items.map((i) => ({ id: i.id, text: materialOf(i) })),
        task: [
          writeTaskFor(
            section,
            ctx.items.some((i) => i.sensitive),
          ),
          ...(rewrite > 0 ? [REWRITE_TASK] : []),
        ].join("\n"),
      },
      WriteSchema,
      { signal: run?.signal },
    );
    if (!r.ok && r.error === "injection") return err(aiStepError(r.error, "redação", { topicId }));

    let failure: AiError | "citations" | null = r.ok ? null : r.error;
    let draft: { title: string; dek: string; body: Paragraph[]; summary: string[] | null };
    if (r.ok) {
      const body = citedParagraphs(r.value, ids, deps.copyGuard ? ctx.items.map(materialOf) : []);
      if (body.length > 0)
        draft = { title: r.value.title, dek: r.value.dek, body, summary: r.value.summary };
      else {
        failure = "citations";
        draft = { ...fallbackDraft(ctx), summary: null };
      }
    } else draft = { ...fallbackDraft(ctx), summary: null };

    const reason =
      failure === null
        ? null
        : RULE_RATIONALE.aiUnavailable(
            failure === "citations" ? "texto sem citações válidas" : failure,
          );
    const input: DraftInput = {
      topicId,
      slug: ctx.topic.slug,
      sectionSlug: section,
      title: draft.title,
      dek: draft.dek,
      body: appendCreditLine(
        toDoc(draft.body),
        creditSourcesOf(ctx.items),
        ctx.items.map((i) => i.id),
      ),
      aiSummary: draft.summary,
      confidence: ctx.topic.confidence,
      confidenceScore: ctx.topic.confidenceScore,
      status: failure === null ? "draft" : "in_review",
      aiFallback: failure !== null,
      reviewReason: reason,
      sources: ctx.items.map((i) => ({ itemId: i.id, role: roleOf(ctx, i) })),
    };
    const saved = await deps.repo.saveDraft(input);
    // R41: o texto precisa de 30 linhas; só fica menor se as fontes não trazem conteúdo.
    const materialShort = insufficientMaterial(ctx.items.map(materialOf));
    await deps.repo.recordDecision({
      objectRef: topicRef,
      step: "summarize",
      agentId: "write",
      promptVersion: version,
      inputHash: hash,
      output: {
        articleId: saved.articleId,
        version: saved.version,
        fallback: failure !== null,
        error: failure,
        paragraphs: draft.body.length,
        bodyLines: bodyLines(input.body),
        rewrite,
        insufficientSource: materialShort,
      },
      rationale:
        reason ??
        `Rascunho do agente write com ${draft.body.length} parágrafo(s) citado(s) de ${ctx.items.length} item(ns).`,
    });
    return ok([nextMessage(msg, "image", `article:${saved.articleId}`)]);
  };
}
