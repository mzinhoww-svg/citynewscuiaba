import { describe, expect, it } from "vitest";
import { pickAutomatic, pickAutomaticDetailed, scoreArticle } from "./score";
import type { Candidate } from "./types";

const at = (local: string) => new Date(`${local}-04:00`);
const NOW = at("2026-10-03T14:10:00");

let seq = 0;
function cand(over: Partial<Candidate> & { published?: string }): Candidate {
  seq += 1;
  const { published, ...rest } = over;
  return {
    id: `a${seq}`,
    publishedAt: at(published ?? "2026-10-03T09:00:00"),
    sectionSlug: "cidade",
    confidenceScore: 0.6,
    sourceCount: 2,
    sponsored: false,
    hasCover: true,
    newsScope: "cuiaba",
    nationalCommotion: false,
    ...rest,
  };
}

describe("scoreArticle", () => {
  it("é estável dentro da janela: now diferente na mesma janela, mesmo score", () => {
    const a = cand({});
    expect(scoreArticle(a, at("2026-10-03T14:00:00"))).toBe(
      scoreArticle(a, at("2026-10-03T14:59:59")),
    );
    expect(scoreArticle(a, at("2026-10-03T12:00:00"), 3)).toBe(
      scoreArticle(a, at("2026-10-03T14:59:59"), 3),
    );
  });

  it("local vale mais que regional; nacional sem comoção vale 0", () => {
    const local = scoreArticle(cand({ newsScope: "cuiaba" }), NOW);
    const mt = scoreArticle(cand({ newsScope: "mt" }), NOW);
    const nat = scoreArticle(cand({ newsScope: "national" }), NOW);
    expect(local).toBeGreaterThan(mt);
    expect(nat).toBe(0);
  });

  it("nacional com comoção pontua, abaixo do regional", () => {
    const commotion = scoreArticle(cand({ newsScope: "national", nationalCommotion: true }), NOW);
    expect(commotion).toBeGreaterThan(0);
    expect(commotion).toBeLessThan(scoreArticle(cand({ newsScope: "mt" }), NOW));
  });

  it("mais confiança e mais fontes pontuam mais", () => {
    expect(scoreArticle(cand({ confidenceScore: 0.9 }), NOW)).toBeGreaterThan(
      scoreArticle(cand({ confidenceScore: 0.3 }), NOW),
    );
    expect(scoreArticle(cand({ sourceCount: 4 }), NOW)).toBeGreaterThan(
      scoreArticle(cand({ sourceCount: 1 }), NOW),
    );
  });
});

describe("pickAutomatic", () => {
  it("só usa publicadas antes do início da janela (1 h)", () => {
    const inside = cand({ published: "2026-10-03T14:05:00", confidenceScore: 1, sourceCount: 5 });
    const before = cand({ published: "2026-10-03T13:50:00", confidenceScore: 0.4 });
    expect(pickAutomatic([inside, before], NOW, 1).map((c) => c.id)).toEqual([before.id]);
  });

  it("ignora patrocinada, com mais de 2 dias e nacional sem comoção", () => {
    const sponsored = cand({ sponsored: true, confidenceScore: 1 });
    const old = cand({ published: "2026-09-30T09:00:00", confidenceScore: 1 });
    const nat = cand({ newsScope: "national", confidenceScore: 1 });
    const ok = cand({ confidenceScore: 0.2 });
    expect(pickAutomatic([sponsored, old, nat, ok], NOW, 3).map((c) => c.id)).toEqual([ok.id]);
  });

  it("a escolha é a mesma em qualquer instante da janela de 1 h, mesmo com matéria nova entrando", () => {
    const base = [cand({ confidenceScore: 0.5 }), cand({ confidenceScore: 0.7 })];
    const first = pickAutomatic(base, at("2026-10-03T14:00:00"), 1)[0]!.id;
    const withNew = [
      ...base,
      cand({ published: "2026-10-03T14:20:00", confidenceScore: 1, sourceCount: 5 }),
    ];
    expect(pickAutomatic(withNew, at("2026-10-03T14:59:59"), 1)[0]!.id).toBe(first);
  });

  it("virada de hora: a matéria que entrou às 14h20 passa a disputar às 15h", () => {
    const newer = cand({ published: "2026-10-03T14:20:00", confidenceScore: 1, sourceCount: 5 });
    const older = cand({ confidenceScore: 0.3, sourceCount: 1 });
    expect(pickAutomatic([older, newer], at("2026-10-03T14:59:59"), 1)[0]!.id).toBe(older.id);
    expect(pickAutomatic([older, newer], at("2026-10-03T15:00:00"), 1)[0]!.id).toBe(newer.id);
  });

  it("muito relevante segura a posição por 3 h; o resto troca a cada hora", () => {
    const star = cand({ published: "2026-10-03T08:00:00", confidenceScore: 1, sourceCount: 5 });
    // Entra às 12h30 com pontuação maior ainda em uma hora seguinte, mas a estrela segura até 15h.
    const rival = cand({ published: "2026-10-03T12:30:00", confidenceScore: 1, sourceCount: 5 });
    const picks = [
      at("2026-10-03T12:00:00"),
      at("2026-10-03T13:10:00"),
      at("2026-10-03T14:59:00"),
    ].map((t) => pickAutomatic([star, rival], t, 1)[0]!.id);
    expect(new Set(picks)).toEqual(new Set([star.id]));
    const detail = pickAutomaticDetailed([star, rival], at("2026-10-03T13:10:00"), 1);
    expect(detail.until).toEqual(at("2026-10-03T15:00:00"));
  });

  it("pouco relevante dura 1 h: until é o fim da hora", () => {
    const weak = cand({ confidenceScore: 0.2, sourceCount: 1 });
    expect(pickAutomaticDetailed([weak], NOW, 1).until).toEqual(at("2026-10-03T15:00:00"));
  });

  it("R39: pula candidata sem capa e pede a busca de imagem dela", () => {
    const best = cand({ confidenceScore: 1, sourceCount: 5, hasCover: false });
    const next = cand({ confidenceScore: 0.5, hasCover: true });
    const r = pickAutomaticDetailed([best, next], NOW, 1);
    expect(r.items.map((c) => c.id)).toEqual([next.id]);
    expect(r.needsImage).toEqual([best.id]);
  });

  it("sem nenhuma candidata com capa, nada é escolhido", () => {
    const r = pickAutomaticDetailed([cand({ hasCover: false })], NOW, 1);
    expect(r.items).toEqual([]);
    expect(r.until).toBeNull();
  });

  it("capacidade 3: devolve as três melhores, ordenadas", () => {
    const list = [0.3, 0.9, 0.5, 0.7].map((s) => cand({ confidenceScore: s }));
    const out = pickAutomatic(list, NOW, 3);
    expect(out).toHaveLength(3);
    expect(out[0]!.confidenceScore).toBe(0.9);
    expect(out[1]!.confidenceScore).toBe(0.7);
  });

  it("nacional com comoção: no máximo uma vaga, e nunca a única vaga havendo local", () => {
    const nat = cand({
      newsScope: "national",
      nationalCommotion: true,
      confidenceScore: 1,
      sourceCount: 5,
    });
    const local = cand({ confidenceScore: 0.3, sourceCount: 1 });
    expect(pickAutomatic([nat, local], NOW, 1).map((c) => c.id)).toEqual([local.id]);
    expect(pickAutomatic([nat, local], NOW, 3).map((c) => c.id)).toContain(nat.id);
    // sem local nenhum, a posição não fica vazia
    expect(pickAutomatic([nat], NOW, 1).map((c) => c.id)).toEqual([nat.id]);
  });
});
