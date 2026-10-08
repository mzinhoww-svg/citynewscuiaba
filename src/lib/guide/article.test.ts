import { describe, expect, it, vi } from "vitest";
import type { CallAgent } from "@/lib/ai/call-agent";
import { err, ok } from "@/lib/result";
import {
  articleParagraphs,
  articleSignature,
  checkArticle,
  fallbackArticle,
  venueFacts,
  writeListArticle,
  type ArticleVenue,
} from "./article";

const VENUES: ArticleVenue[] = [
  {
    id: "v1",
    position: 1,
    name: "Bakehouse 44",
    neighborhood: "Goiabeiras",
    rating: 4.7,
    ratingCount: 1282,
    ratingSource: "google",
    priceLevel: 2,
  },
  {
    id: "v2",
    position: 2,
    name: "Padaria América",
    neighborhood: null,
    rating: 4.4,
    ratingCount: 3567,
    ratingSource: "google",
    priceLevel: null,
  },
  {
    id: "v3",
    position: 3,
    name: "Sorella",
    neighborhood: "Duque de Caxias",
    rating: 4.5,
    ratingCount: 1330,
    ratingSource: "google",
    priceLevel: null,
  },
];
const INPUT = { title: "As 3 melhores padarias de Cuiabá", noun: "padarias", venues: VENUES };

const GOOD_ARTICLE = [
  "Pão quente de manhã é quase um ritual em Cuiabá, e três endereços aparecem com folga quando o assunto é padaria bem avaliada pelos clientes.",
  "A Bakehouse 44, em Goiabeiras, abre a lista com nota 4,7 em 1.282 avaliações. É o tipo de lugar que virou referência para quem quer café da manhã caprichado sem sair do bairro.",
  "A Padaria América vem em seguida e impressiona pelo volume: são 3.567 avaliações, com nota 4,4. Fecha a lista a Sorella, no Duque de Caxias, com 4,5.",
].join("\n\n");

const NOTES = [
  { id: "v1", note: "Nota 4,7 em 1.282 avaliações, a mais alta da lista." },
  { id: "v2", note: "A mais avaliada da lista, com 3.567 avaliações." },
  { id: "v3", note: "Nota 4,5 e endereço no Duque de Caxias." },
];

describe("checkArticle", () => {
  it("aceita texto que cita todos os lugares só com números dos dados", () => {
    const r = checkArticle({ article: GOOD_ARTICLE, notes: NOTES }, VENUES);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(articleParagraphs(r.article.intro)).toHaveLength(3);
      expect(r.article.notes).toEqual({
        v1: NOTES[0]!.note,
        v2: NOTES[1]!.note,
        v3: NOTES[2]!.note,
      });
      expect(r.article.source).toBe("ai");
    }
  });

  it("recusa lugar não citado, número inventado e visita que não aconteceu", () => {
    const article = GOOD_ARTICLE.replace("Fecha a lista a Sorella", "Fecha a lista outra casa")
      .replace("1.282", "1.900")
      .concat("\n\nVisitamos as três num sábado.");
    const r = checkArticle({ article, notes: [] }, VENUES);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join(" | ")).toMatch(/não cita Sorella/);
      expect(r.problems.join(" | ")).toMatch(/1\.900/);
      expect(r.problems.join(" | ")).toMatch(/frase proibida/);
    }
  });

  it("recusa menção a IA e texto gerado", () => {
    const r = checkArticle(
      { article: `${GOOD_ARTICLE}\n\nTexto gerado por inteligência artificial.`, notes: [] },
      VENUES,
    );
    expect(r.ok).toBe(false);
  });

  it("comentário com número inventado reprova; comentário de id desconhecido é ignorado", () => {
    const r = checkArticle(
      {
        article: GOOD_ARTICLE,
        notes: [
          { id: "v1", note: "Aberta desde 1998, com nota 4,7 entre os clientes." },
          { id: "x", note: "Comentário de um lugar que não está na lista." },
        ],
      },
      VENUES,
    );
    expect(r.ok).toBe(false);
  });
});

describe("fallbackArticle", () => {
  it("cita todos os lugares, só com números dos dados, e passa na própria conferência", () => {
    const a = fallbackArticle(INPUT);
    expect(a.source).toBe("fallback");
    for (const v of VENUES) expect(a.intro).toContain(v.name);
    expect(a.intro).toContain("No topo está Bakehouse 44, no bairro Goiabeiras, com nota 4,7");
    expect(a.intro).toContain("1.282 avaliações no Google");
    const r = checkArticle({ article: a.intro, notes: [] }, VENUES);
    expect(r.ok).toBe(true);
  });
});

describe("writeListArticle", () => {
  const agent = (...outs: Parameters<typeof ok>[0][]) => {
    const fn = vi.fn();
    for (const o of outs) fn.mockResolvedValueOnce(o === "fail" ? err("provider") : ok(o));
    return fn as unknown as CallAgent & ReturnType<typeof vi.fn>;
  };

  it("usa o texto do modelo quando ele passa na conferência", async () => {
    const callAgent = agent({ article: GOOD_ARTICLE, notes: NOTES });
    const a = await writeListArticle({ callAgent }, INPUT);
    if ("failed" in a) throw new Error("esperava texto");
    expect(a.source).toBe("ai");
    expect(a.notes.v2).toBe(NOTES[1]!.note);
    const [agentId, input] = (callAgent as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(agentId).toBe("guide_writer");
    expect(input.data).toEqual(VENUES.map((v) => ({ id: v.id, text: venueFacts(v) })));
  });

  it("texto reprovado tenta de novo pedindo a correção; depois vale o texto montado", async () => {
    const bad = { article: `${GOOD_ARTICLE}\n\nEstivemos lá.`, notes: [] };
    const callAgent = agent(bad, "fail");
    const a = await writeListArticle({ callAgent }, INPUT);
    if ("failed" in a) throw new Error("esperava o texto montado");
    expect(a.source).toBe("fallback");
    expect(a.problems.length).toBeGreaterThan(0);
    const second = (callAgent as ReturnType<typeof vi.fn>).mock.calls[1]![1];
    expect(second.task).toMatch(/Corrija: frase proibida/);
  });

  it("sem fallback, reprovado devolve failed; a correção da rodada anterior vai na 1ª tentativa", async () => {
    const bad = { article: `${GOOD_ARTICLE}\n\nEstivemos lá.`, notes: [] };
    const callAgent = agent(bad);
    const a = await writeListArticle(
      { callAgent, attempts: 1, fallback: false, previous: ["não cita Sorella"] },
      INPUT,
    );
    expect(a).toMatchObject({ failed: true });
    expect(a.problems.join(" ")).toMatch(/frase proibida/);
    const first = (callAgent as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(first.task).toMatch(/Corrija: não cita Sorella/);
  });
});

describe("venueFacts e assinatura", () => {
  it("bloco de dados só com o que o texto pode usar", () => {
    expect(venueFacts(VENUES[0]!)).toBe(
      "Posição: 1\nNome: Bakehouse 44\nBairro: Goiabeiras\nNota: 4,7\nAvaliações: 1.282\nFonte da nota: google\nFaixa de preço: preço moderado",
    );
    expect(articleSignature(["a", "b"])).toBe("a,b");
  });
});
