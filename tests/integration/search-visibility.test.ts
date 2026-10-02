// @vitest-environment node
// Busca × correções do gate P1/P3 (A-051): o texto da fonte (`collected_items.excerpt`) nunca é
// exibido nem indexado, e assunto `internal` ou item em quarentena nunca aparece em busca,
// sugestões, "você quis dizer" ou na busca com IA.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { SEARCH_DEFAULTS, type SearchFilters } from "@/lib/search";
import { retrieveForAnswer } from "@/lib/search/ask";
import { searchHybrid, suggest } from "@/lib/search/server";

const INTERNAL_TOPIC = "c4000000-0000-4000-8000-000000000004";
/** Item de fonte `summary_2_sentences` (Diário da Baixada) usado para o marcador. */
const MARKED_ITEM = "c3000000-0000-4000-8000-000000000029";
/** Item posto em quarentena durante a suíte (MT Agora, qualidade do ar). */
const QUARANTINED_ITEM = "c3000000-0000-4000-8000-000000000013";
/** Palavra que não existe no acervo: só entra no `excerpt` (e depois no `summary`). */
const MARKER = "jabuticabeiral";

const noEmbed = { embed: async () => null };
const f = (change: Partial<SearchFilters> = {}): SearchFilters => ({
  ...SEARCH_DEFAULTS,
  ...change,
});

async function run(q: string, change: Partial<SearchFilters> = {}) {
  const r = await searchHybrid(q, f(change), noEmbed);
  if (!r.ok) throw new Error(`busca falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

const db = createServiceClient();
let original: { excerpt: string | null; summary: string | null } | null = null;
let excerpts: string[] = [];

beforeAll(async () => {
  const { data, error } = await db
    .from("collected_items")
    .select("excerpt, summary")
    .eq("id", MARKED_ITEM)
    .single();
  expect(error).toBeNull();
  original = data;
  const all = await db.from("collected_items").select("excerpt").not("excerpt", "is", null);
  excerpts = (all.data ?? []).flatMap((r) => (r.excerpt ? [r.excerpt] : []));
  expect(excerpts.length).toBeGreaterThan(10);
});

afterAll(async () => {
  if (original)
    await db
      .from("collected_items")
      .update({ excerpt: original.excerpt, summary: original.summary })
      .eq("id", MARKED_ITEM);
  await db
    .from("collected_items")
    .update({ quarantined_at: null, quarantine_reason: null })
    .eq("id", QUARANTINED_ITEM);
});

describe("busca nunca expõe o texto da fonte (A-051)", () => {
  it("palavra só do excerpt não acha nada; no resumo próprio, acha", async () => {
    const upd = await db
      .from("collected_items")
      .update({ excerpt: `${original!.excerpt} Mutirão na ${MARKER}.` })
      .eq("id", MARKED_ITEM);
    expect(upd.error).toBeNull();
    // Força o gatilho do índice a recalcular com o excerpt novo.
    await db.from("collected_items").update({ summary: original!.summary }).eq("id", MARKED_ITEM);
    const none = await run(MARKER);
    expect(none.total).toBe(0);
    expect(none.didYouMean ?? "").not.toContain(MARKER);

    await db
      .from("collected_items")
      .update({ summary: `Resumo do CityNews sobre a ${MARKER} no Centro.` })
      .eq("id", MARKED_ITEM);
    const found = await run(MARKER);
    expect(found.groups.flatMap((g) => g.items.map((i) => i.item.id))).toContain(MARKED_ITEM);
  });

  it("resultado (inclusive o trecho destacado) só traz título e resumo próprio", async () => {
    for (const q of ["onibus cpa", "viaduto", "fumaca", "plano diretor", "mutirao emprego"]) {
      const r = await run(q, { origin: "others" });
      expect(r.total).toBeGreaterThan(0);
      const json = JSON.stringify(r);
      for (const e of excerpts) expect(json).not.toContain(e);
    }
  });
});

describe("assunto interno e item em quarentena nunca aparecem (A-051)", () => {
  it("assunto interno fica fora da busca e não agrupa os itens dele", async () => {
    const { data } = await db.rpc("search_hybrid", { p_q: "feira agro", p_filters: {} });
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.some((r) => r.kind === "topic")).toBe(false);
    expect(data!.some((r) => r.topic_id === INTERNAL_TOPIC)).toBe(false);
    const byTitle = await db.rpc("search_hybrid", { p_q: "assunto apuracao economia" });
    expect(byTitle.data ?? []).toEqual([]);

    const r = await run("feira agro");
    expect(r.groups.some((g) => g.topic)).toBe(false);
    expect(JSON.stringify(r)).not.toContain("Assunto em apuração");
    expect((await run("apuracao", { type: "topics" })).total).toBe(0);
  });

  it("sugestões e 'você quis dizer' não usam o título do assunto interno", async () => {
    const s = await suggest("assunto em apur");
    expect(s.ok && s.value).toEqual([]);
    const { data } = await db.rpc("search_did_you_mean", { p_q: "apuracaoo" });
    expect(data ?? "").not.toContain("apuracao");
  });

  it("item em quarentena some da busca e do 'você quis dizer'", async () => {
    const q = "qualidade ar terceiro dia";
    const before = await run(q, { type: "aggregated" });
    expect(before.groups.flatMap((g) => g.items.map((i) => i.item.id))).toContain(QUARANTINED_ITEM);
    const upd = await db
      .from("collected_items")
      .update({ quarantined_at: new Date().toISOString(), quarantine_reason: "teste" })
      .eq("id", QUARANTINED_ITEM);
    expect(upd.error).toBeNull();
    const after = await run(q, { type: "aggregated" });
    expect(after.groups.flatMap((g) => g.items.map((i) => i.item.id))).not.toContain(
      QUARANTINED_ITEM,
    );
    // Nem o id sai da função de busca (security definer, sem RLS).
    const rpc = await db.rpc("search_hybrid", { p_q: q, p_filters: { type: "aggregated" } });
    expect((rpc.data ?? []).map((r) => r.id)).not.toContain(QUARANTINED_ITEM);
    const ask = await retrieveForAnswer("qualidade do ar em Cuiabá", noEmbed);
    expect(ask.ok && ask.value.some((c) => c.id === QUARANTINED_ITEM)).toBe(false);
  });

  it("busca com IA: texto da fonte só como dado, nunca no que é exibido", async () => {
    const r = await retrieveForAnswer("plano de ônibus do CPA", noEmbed);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const agg = r.value.filter((c) => c.kind === "aggregated");
    expect(agg.length).toBeGreaterThan(0);
    // Fonte summary_2_sentences leva o excerpt ao modelo; o texto público é o resumo próprio.
    expect(agg.some((c) => c.sourceText && excerpts.includes(c.sourceText))).toBe(true);
    for (const c of agg) expect(excerpts).not.toContain(c.text);
    expect(JSON.stringify(r.value)).not.toContain("Assunto em apuração");
  });
});
