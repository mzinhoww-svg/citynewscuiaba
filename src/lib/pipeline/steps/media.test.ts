// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore } from "@/lib/media/store";
import { takedownReproduction } from "@/lib/media/takedown";
import type { FlagKey, MediaSourceItem } from "../ports";
import { createFakeHttp, type FakeRoute, fakeResolve } from "../testing/fake-http";
import { createMemoryMediaRepo } from "../testing/memory-media-repo";
import type { PipelineMessage } from "../types";
import {
  createMediaStep,
  PHOTO_REFETCH_LEAD_SEC,
  PHOTO_RETRIES,
  PHOTO_RETRY_DELAY_SEC,
  reusableAsset,
} from "./media";
import { inlinePosition } from "@/lib/media/score";

const NOW = new Date("2026-09-27T18:00:00Z");
const image = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/images", name)));
const jpeg = (name: string): FakeRoute => ({
  body: image(name),
  headers: { "content-type": "image/jpeg" },
});

const msg: PipelineMessage = { runId: "r1", step: "image", itemRef: "article:a1", attempt: 1 };

function sourceItem(
  over: Partial<MediaSourceItem["source"]> = {},
  item: Partial<MediaSourceItem> = {},
): MediaSourceItem {
  return {
    itemId: "i1",
    title: "Feira de artesanato ocupa a Orla do Porto neste fim de semana",
    imageUrl: "https://folhadocerrado.example/img/feira.jpg",
    pageUrl: "https://folhadocerrado.example/cultura/feira-orla-do-porto",
    author: "Ana Prado",
    ...item,
    source: {
      id: "src-folha",
      slug: "folha-do-cerrado",
      name: "Folha do Cerrado",
      baseUrl: "https://folhadocerrado.example",
      imagePolicy: "reproduction",
      agreementUntil: null,
      rateLimitPerHour: 60,
      ...over,
    },
  };
}

function setup(opts: {
  items?: MediaSourceItem[];
  flags?: Partial<Record<FlagKey, boolean>>;
  routes?: Record<string, FakeRoute>;
  category?: string;
  failPut?: boolean;
  /** `false`: o limite por hora da fonte está esgotado. */
  rateLimit?: boolean;
}) {
  const repo = createMemoryMediaRepo(
    opts.rateLimit === undefined ? {} : { rateLimit: opts.rateLimit },
  );
  repo.setContext({
    articleId: "a1",
    topicId: "t1",
    title: "Feira de artesanato ocupa a Orla do Porto",
    sectionSlug: opts.category ?? "cultura",
    category: opts.category ?? "cultura",
    sensitive: false,
    tags: [],
    items: opts.items ?? [sourceItem()],
  });
  const store = createMemoryMediaStore({ failPut: opts.failPut });
  const { http, calls } = createFakeHttp({
    "https://folhadocerrado.example/robots.txt": { status: 404 },
    "https://folhadocerrado.example/img/feira.jpg": jpeg("reproducao-1600x900.jpg"),
    ...opts.routes,
  });
  const flags = { image_reproduction_enabled: true, ...opts.flags };
  const step = createMediaStep({
    repo,
    store,
    flags: { isEnabled: async (k) => flags[k] ?? false },
    http,
    resolve: fakeResolve(),
    userAgent: "CityNewsBot/1.0",
    now: () => NOW,
    analyze: analyzeImage,
  });
  return { repo, store, step, calls };
}

describe("etapa de imagem (13 e 14)", () => {
  it("reproduction: copia a imagem com proveniência, crédito e link, e liga à matéria", async () => {
    const { repo, store, step } = setup({});
    const r = await step(msg);
    expect(r).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
    const [asset] = repo.assets();
    expect(asset).toMatchObject({
      kind: "reproduction",
      status: "approved",
      originUrl: "https://folhadocerrado.example/img/feira.jpg",
      credit: "Ana Prado",
      width: 1600,
      height: 900,
      sourceId: "src-folha",
    });
    expect(asset!.details).toMatchObject({
      pageUrl: "https://folhadocerrado.example/cultura/feira-orla-do-porto",
      sourceName: "Folha do Cerrado",
      contentType: "image/jpeg",
      provenance: expect.objectContaining({
        policy: "reproduction",
        imageUrl: "https://folhadocerrado.example/img/feira.jpg",
        fetchedAt: NOW.toISOString(),
        unmodified: true,
      }),
    });
    expect(asset!.storagePath).toMatch(/^reproducao\/[0-9a-f]{64}\.jpg$/);
    // Cópia byte a byte: sem recorte de crédito nem de marca.
    expect(store.files.get(asset!.storagePath)?.bytes).toEqual(image("reproducao-1600x900.jpg"));
    expect(repo.links()).toEqual([
      expect.objectContaining({ articleId: "a1", mediaId: asset!.id, chosenBy: "pipeline:image" }),
    ]);
    expect(repo.decisions()[0]).toMatchObject({
      objectRef: "article:a1",
      step: "image",
      output: expect.objectContaining({
        kind: "reproduction",
        label: "REPRODUÇÃO · Folha do Cerrado · Ana Prado",
      }),
    });
  });

  it("flag image_reproduction_enabled desligada: nada é baixado; cai para o acervo", async () => {
    const { repo, step, calls } = setup({ flags: { image_reproduction_enabled: false } });
    repo.addArchive({ id: "acervo-1", tags: ["cultura"] });
    expect((await step(msg)).ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(repo.links()).toEqual([expect.objectContaining({ mediaId: "acervo-1" })]);
    expect(repo.decisions()[0]!.output).toMatchObject({ kind: "illustrative" });
    expect(repo.decisions()[0]!.rationale).toMatch(/reprodução desligada/);
  });

  it("política none nunca baixa a imagem; sem acervo, card tipográfico", async () => {
    const { repo, step, calls } = setup({ items: [sourceItem({ imagePolicy: "none" })] });
    expect((await step(msg)).ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(repo.links()).toEqual([]);
    expect(repo.decisions()[0]!.output).toMatchObject({ kind: "typographic" });
  });

  it("acordo vencido não usa a foto; acordo vigente usa como original", async () => {
    const expired = setup({
      items: [sourceItem({ imagePolicy: "with_agreement", agreementUntil: "2026-09-01" })],
    });
    await expired.step(msg);
    expect(expired.repo.decisions()[0]!.output).toMatchObject({ kind: "typographic" });
    expect(expired.calls).toHaveLength(0);

    const valid = setup({
      items: [sourceItem({ imagePolicy: "with_agreement", agreementUntil: "2026-12-31" })],
    });
    await valid.step(msg);
    expect(valid.repo.assets()[0]).toMatchObject({ kind: "original", status: "approved" });
  });

  it("baixa resolução reprova e tenta o próximo item", async () => {
    const { repo, step } = setup({
      items: [
        sourceItem(
          {},
          { itemId: "i1", imageUrl: "https://folhadocerrado.example/img/pequena.jpg" },
        ),
        sourceItem({}, { itemId: "i2" }),
      ],
      routes: {
        "https://folhadocerrado.example/img/pequena.jpg": jpeg("baixa-resolucao-500x281.jpg"),
      },
    });
    await step(msg);
    expect(repo.assets().map((a) => a.originUrl)).toEqual([
      "https://folhadocerrado.example/img/feira.jpg",
    ]);
    expect(repo.decisions()[0]!.rationale).toMatch(/low_res/);
  });

  it("robots.txt que bloqueia a imagem impede a cópia", async () => {
    const { repo, step } = setup({
      routes: {
        "https://folhadocerrado.example/robots.txt": { body: "User-agent: *\nDisallow: /img/" },
      },
    });
    await step(msg);
    expect(repo.assets()).toEqual([]);
    expect(repo.decisions()[0]!.rationale).toMatch(/robots/);
  });

  it("imagem de outro domínio é descartada com motivo, sem nenhum acesso", async () => {
    const { repo, step, calls } = setup({
      items: [sourceItem({}, { imageUrl: "https://cdn.terceiro.example/feira.jpg" })],
    });
    await step(msg);
    expect(repo.assets()).toEqual([]);
    expect(calls).toEqual([]);
    expect(repo.decisions()[0]!.rationale).toMatch(/fora do domínio da fonte/);
  });

  it("subdomínio da fonte vale; redirecionamento para fora do domínio é recusado", async () => {
    const sub = setup({
      items: [sourceItem({}, { imageUrl: "https://img.folhadocerrado.example/feira.jpg" })],
      routes: {
        "https://img.folhadocerrado.example/robots.txt": { status: 404 },
        "https://img.folhadocerrado.example/feira.jpg": jpeg("reproducao-1600x900.jpg"),
      },
    });
    await sub.step(msg);
    expect(sub.repo.assets()).toHaveLength(1);

    const redirected = setup({
      routes: {
        "https://folhadocerrado.example/img/feira.jpg": {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        },
      },
    });
    await redirected.step(msg);
    expect(redirected.repo.assets()).toEqual([]);
    expect(redirected.calls.map((c) => c.url)).not.toContain(
      "http://169.254.169.254/latest/meta-data",
    );
    expect(redirected.repo.decisions()[0]!.rationale).toMatch(/fora do domínio|não permitido/);
  });

  it("SVG ou resposta que não é imagem é ignorada", async () => {
    const { repo, step } = setup({
      routes: {
        "https://folhadocerrado.example/img/feira.jpg": {
          body: image("vetor.svg"),
          headers: { "content-type": "image/svg+xml" },
        },
      },
    });
    await step(msg);
    expect(repo.assets()).toEqual([]);
  });

  it("mesma foto já copiada de outra origem é duplicada; mesma origem é reutilizada", async () => {
    const { repo, step } = setup({});
    await step(msg);
    repo.setContext({
      articleId: "a2",
      topicId: "t2",
      title: "Outra matéria",
      sectionSlug: "cultura",
      category: "cultura",
      sensitive: false,
      tags: [],
      items: [
        sourceItem({}, { imageUrl: "https://folhadocerrado.example/img/copia.jpg" }),
        sourceItem(),
      ],
    });
    const other = createMediaStep({
      repo,
      store: createMemoryMediaStore(),
      flags: { isEnabled: async () => true },
      http: createFakeHttp({
        "https://folhadocerrado.example/img/copia.jpg": jpeg(
          "reproducao-recomprimida-1400x788.jpg",
        ),
      }).http,
      resolve: fakeResolve(),
      userAgent: "CityNewsBot/1.0",
      now: () => NOW,
      analyze: analyzeImage,
    });
    await other({ ...msg, itemRef: "article:a2" });
    expect(repo.assets()).toHaveLength(1);
    expect(repo.links().map((l) => [l.articleId, l.mediaId])).toEqual([
      ["a1", "m-1"],
      ["a2", "m-1"],
    ]);
  });

  it("imagem removida a pedido nunca volta a ser copiada", async () => {
    const { repo, step, store } = setup({});
    await step(msg);
    const r = await takedownReproduction(
      { repo, store, revalidate: async () => {}, now: () => NOW },
      { sourceId: "src-folha" },
      "c1000000-0000-4000-8000-000000000002",
      "Pedido do veículo por e-mail",
    );
    expect(r).toEqual({ ok: true, value: { blocked: 1, articleIds: ["a1"] } });
    repo.setContext({
      articleId: "a3",
      topicId: "t3",
      title: "Mais uma",
      sectionSlug: "cultura",
      category: "cultura",
      sensitive: false,
      tags: [],
      items: [sourceItem()],
    });
    await step({ ...msg, itemRef: "article:a3" });
    expect(repo.links().filter((l) => l.articleId === "a3")).toEqual([]);
  });

  it("falha do Storage é transitória (nova tentativa), sem ligar mídia", async () => {
    const { repo, step } = setup({ failPut: true });
    const r = await step(msg);
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ kind: "transient" }) });
    expect(repo.links()).toEqual([]);
  });

  it("matéria que já tem imagem segue direto (idempotente)", async () => {
    const { repo, step, calls } = setup({});
    await step(msg);
    const n = calls.length;
    expect(await step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
    expect(calls.length).toBe(n);
    expect(repo.decisions()).toHaveLength(1);
  });
});

/** Três fontes fictícias, cada uma com uma imagem de proporção e resolução diferentes. */
const FOLHA = "https://folhadocerrado.example";
const MTA = "https://mtagora.example";
const DIARIO = "https://diariomn.example";

function multi(
  n: number,
  over: { dup?: boolean; sameSource?: boolean; paragraphs?: number; humanEdited?: boolean } = {},
) {
  const defs = [
    {
      id: "src-folha",
      slug: "folha-do-cerrado",
      name: "Folha do Cerrado",
      base: FOLHA,
      img: "reproducao-1600x900.jpg",
      author: "Ana Prado",
    },
    {
      id: "src-mta",
      slug: "mt-agora",
      name: "MT Agora",
      base: MTA,
      img: over.dup ? "reproducao-recomprimida-1400x788.jpg" : "reproducao-b-1500x1000.jpg",
      author: null,
    },
    {
      id: "src-diario",
      slug: "diario-mn",
      name: "Diário do Médio Norte",
      base: DIARIO,
      img: "reproducao-c-1280x720.jpg",
      author: "Rui Lopes",
    },
  ].slice(0, n);
  const items: MediaSourceItem[] = defs.map((d, i) =>
    sourceItem(
      { id: over.sameSource ? "src-folha" : d.id, slug: d.slug, name: d.name, baseUrl: d.base },
      {
        itemId: `i${i + 1}`,
        imageUrl: `${d.base}/img/foto-${i + 1}.jpg`,
        pageUrl: `${d.base}/materia-${i + 1}`,
        author: d.author,
        title: `Título ${i + 1}`,
      },
    ),
  );
  const routes: Record<string, FakeRoute> = {};
  defs.forEach((d, i) => {
    routes[`${d.base}/robots.txt`] = { status: 404 };
    routes[`${d.base}/img/foto-${i + 1}.jpg`] = jpeg(d.img);
  });
  const h = setup({ items, routes });
  h.repo.setContext({
    articleId: "a1",
    topicId: "t1",
    title: "Feira",
    sectionSlug: "cultura",
    category: "cultura",
    sensitive: false,
    tags: [],
    items,
    bodyParagraphs: over.paragraphs ?? 5,
    humanEdited: over.humanEdited ?? false,
  });
  return h;
}

describe("capa e imagem no texto (UI-T16)", () => {
  it("3 fontes: capa = melhor nota, imagem do texto = outra fonte, outra foto; papéis e posição gravados", async () => {
    const { repo, step, calls } = multi(3);
    expect((await step(msg)).ok).toBe(true);
    const links = repo.links();
    expect(links.map((l) => l.role).sort()).toEqual(["cover", "inline"]);
    const cover = links.find((l) => l.role === "cover")!;
    const inline = links.find((l) => l.role === "inline")!;
    const coverAsset = repo.assets().find((a) => a.id === cover.mediaId)!;
    const inlineAsset = repo.assets().find((a) => a.id === inline.mediaId)!;
    expect(coverAsset.sourceId).not.toBe(inlineAsset.sourceId);
    expect(coverAsset.originUrl).toBe(`${FOLHA}/img/foto-1.jpg`);
    expect(inline.position).toBe(3);
    expect(cover.position).toBeNull();
    expect(cover.chosenBy).toBe("pipeline:image");
    expect(inline.chosenBy).toBe("pipeline:image");
    expect(repo.assets().every((a) => a.kind === "reproduction")).toBe(true);
    // até 4 candidatas avaliadas, uma por fonte
    expect(calls.filter((c) => c.url.endsWith(".jpg")).length).toBeLessThanOrEqual(4);
    const out = repo.decisions()[0]!.output as Record<string, unknown>;
    expect(out).toMatchObject({
      kind: "reproduction",
      cover: { mediaId: cover.mediaId },
      inline: { mediaId: inline.mediaId, position: 3 },
    });
  });

  it("uma candidata: só a capa", async () => {
    const { repo, step } = multi(1);
    await step(msg);
    expect(repo.links().map((l) => l.role)).toEqual(["cover"]);
  });

  it("duas imagens da mesma fonte não formam par", async () => {
    const { repo, step } = multi(2, { sameSource: true });
    await step(msg);
    expect(repo.links().map((l) => l.role)).toEqual(["cover"]);
  });

  it("duas quase iguais (phash próximo) não formam par", async () => {
    const { repo, step } = multi(2, { dup: true });
    await step(msg);
    expect(repo.links().map((l) => l.role)).toEqual(["cover"]);
  });

  it("corpo de 3 parágrafos: depois do 2º; de 1 parágrafo: sem imagem no texto", async () => {
    const three = multi(3, { paragraphs: 3 });
    await three.step(msg);
    expect(three.repo.links().find((l) => l.role === "inline")?.position).toBe(2);
    expect(inlinePosition(3)).toBe(2);
    const one = multi(3, { paragraphs: 1 });
    await one.step(msg);
    expect(one.repo.links().map((l) => l.role)).toEqual(["cover"]);
    const none = multi(3, { paragraphs: 0 });
    await none.step(msg);
    expect(none.repo.links().map((l) => l.role)).toEqual(["cover"]);
  });

  it("para de avaliar quando já há capa e imagem do texto (2 fontes); sem inline, 1 só", async () => {
    const two = multi(3);
    await two.step(msg);
    expect(two.calls.filter((c) => c.url.endsWith(".jpg"))).toHaveLength(2);
    const one = multi(3, { paragraphs: 1 });
    await one.step(msg);
    expect(one.calls.filter((c) => c.url.endsWith(".jpg"))).toHaveLength(1);
  });

  it("aborto do prazo sem nada gravado: erro transitório, sem capa de acervo", async () => {
    const h = multi(3);
    h.repo.addArchive({ id: "acervo-1", tags: ["cultura"] });
    const ac = new AbortController();
    ac.abort();
    const r = await h.step(msg, { signal: ac.signal } as never);
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ kind: "transient" }) });
    expect(h.repo.links()).toEqual([]);
    expect(h.repo.decisions()).toEqual([]);
  });

  it("reprodução sem autor usa o nome da fonte como crédito do ativo", async () => {
    const { repo, step } = multi(3);
    await step(msg);
    const mta = repo.assets().find((a) => a.sourceId === "src-mta");
    expect(mta?.credit).toBe("MT Agora");
    expect(repo.assets().find((a) => a.sourceId === "src-folha")?.credit).toBe("Ana Prado");
  });

  it("capa removida a pedido (bloqueada): não acrescenta imagem do texto", async () => {
    const h = multi(3);
    h.repo.addAsset({ id: "m-capa", originUrl: `${FOLHA}/img/foto-1.jpg`, sourceId: "src-folha" });
    h.repo.link("a1", "m-capa", "pipeline:image");
    await h.repo.blockAsset("m-capa", "pedido", NOW);
    await h.step(msg);
    expect(h.repo.links().map((l) => l.role)).toEqual(["cover"]);
  });

  it("é idempotente: rodar de novo não baixa nem liga nada", async () => {
    const { repo, step, calls } = multi(3);
    await step(msg);
    const n = calls.length;
    const links = structuredClone(repo.links());
    expect(await step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
    expect(calls.length).toBe(n);
    expect(repo.links()).toEqual(links);
    expect(repo.decisions()).toHaveLength(1);
  });

  it("reprocesso acrescenta a imagem do texto a matéria que só tem capa, sem trocar a capa", async () => {
    const { repo, step } = multi(3, { paragraphs: 1 });
    await step(msg); // corpo curto: só capa
    expect(repo.links().map((l) => l.role)).toEqual(["cover"]);
    const coverId = repo.links()[0]!.mediaId;
    const items = (await repo.mediaContext("a1"))!.items;
    repo.setContext({
      articleId: "a1",
      topicId: "t1",
      title: "Feira",
      sectionSlug: "cultura",
      category: "cultura",
      sensitive: false,
      tags: [],
      items,
      bodyParagraphs: 6,
    });
    await step({ ...msg, attempt: 2 });
    const links = repo.links();
    expect(links.find((l) => l.role === "cover")!.mediaId).toBe(coverId);
    expect(links.find((l) => l.role === "inline")).toMatchObject({ position: 3 });
    expect(links).toHaveLength(2);
    expect(repo.assets()).toHaveLength(2);
  });

  it("não troca capa escolhida por pessoa nem mexe em matéria editada por pessoa", async () => {
    const human = multi(3);
    human.repo.addAsset({
      id: "m-humano",
      originUrl: `${DIARIO}/img/antiga.jpg`,
      sourceId: "src-diario",
    });
    human.repo.link("a1", "m-humano", "c1000000-0000-4000-8000-000000000002");
    await human.step(msg);
    expect(human.repo.links()).toHaveLength(1);
    expect(human.repo.links()[0]).toMatchObject({ mediaId: "m-humano", role: "cover" });
    expect(human.calls).toHaveLength(0);

    const edited = multi(3, { humanEdited: true });
    await edited.step(msg);
    expect(edited.repo.links()).toEqual([]);
    expect(edited.calls).toHaveLength(0);
  });

  it("capa do pipeline de outra fonte: a imagem do texto vem de fonte diferente da capa existente", async () => {
    const h = multi(3, { paragraphs: 5 });
    h.repo.addAsset({ id: "m-capa", originUrl: `${FOLHA}/img/foto-1.jpg`, sourceId: "src-folha" });
    h.repo.link("a1", "m-capa", "pipeline:image");
    await h.step(msg);
    const inline = h.repo.links().find((l) => l.role === "inline")!;
    const asset = h.repo.assets().find((a) => a.id === inline.mediaId)!;
    expect(asset.sourceId).not.toBe("src-folha");
    expect(h.calls.some((c) => c.url === `${FOLHA}/img/foto-1.jpg`)).toBe(false);
  });

  it("remover a pedido uma das duas não derruba a outra", async () => {
    const { repo, store, step } = multi(3);
    await step(msg);
    const [first, second] = repo.links();
    const r = await takedownReproduction(
      { repo, store, revalidate: async () => {}, now: () => NOW },
      { mediaId: second!.mediaId },
      "c1000000-0000-4000-8000-000000000002",
      "Pedido do veículo",
    );
    expect(r).toEqual({ ok: true, value: { blocked: 1, articleIds: ["a1"] } });
    const status = (id: string) => repo.assets().find((a) => a.id === id)!.status;
    expect(status(second!.mediaId)).toBe("blocked");
    expect(status(first!.mediaId)).toBe("approved");
    expect(store.files.has(repo.assets().find((a) => a.id === first!.mediaId)!.storagePath)).toBe(
      true,
    );
  });
});

describe("foto que ainda não deu para buscar: nova tentativa agendada", () => {
  it("limite da fonte esgotado: publica com o card e agenda nova tentativa da foto", async () => {
    const { repo, step } = setup({ rateLimit: false });
    const r = await step(msg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([
      { ...msg, step: "rules" },
      { ...msg, step: "image", itemRef: "article:a1#photo1", delaySec: PHOTO_RETRY_DELAY_SEC },
    ]);
    expect(repo.decisions()[0]!.output).toMatchObject({ kind: "typographic" });
  });

  it("item sem URL de foto: pede a página de novo (og:image) antes da nova tentativa", async () => {
    const { step } = setup({ items: [sourceItem({}, { itemId: "i9", imageUrl: null })] });
    const r = await step(msg);
    expect(r.ok && r.value).toEqual([
      { ...msg, step: "rules" },
      { ...msg, step: "enrich", itemRef: "item:i9#refetch", delaySec: PHOTO_RETRY_DELAY_SEC },
      {
        ...msg,
        step: "image",
        itemRef: "article:a1#photo1",
        delaySec: PHOTO_RETRY_DELAY_SEC + PHOTO_REFETCH_LEAD_SEC,
      },
    ]);
  });

  it("nova tentativa acha a foto: liga a capa e não volta para as regras", async () => {
    const { repo, step } = setup({});
    const r = await step({ ...msg, itemRef: "article:a1#photo1" });
    expect(r).toEqual({ ok: true, value: [] });
    expect(repo.links()).toEqual([expect.objectContaining({ articleId: "a1", role: "cover" })]);
  });

  it("capa do acervo já resolve: não agenda nova tentativa", async () => {
    const { repo, step } = setup({ rateLimit: false });
    repo.addArchive({ id: "acervo-1", tags: ["cultura"] });
    expect(await step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
  });

  it("para depois de PHOTO_RETRIES tentativas", async () => {
    const { step } = setup({ rateLimit: false });
    const r = await step({ ...msg, itemRef: `article:a1#photo${PHOTO_RETRIES}` });
    expect(r).toEqual({ ok: true, value: [] });
  });

  it("política none ou reprodução desligada não agenda nada (não é falta de cota)", async () => {
    const none = setup({ items: [sourceItem({ imagePolicy: "none" }, { imageUrl: null })] });
    expect(await none.step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
    const off = setup({ flags: { image_reproduction_enabled: false }, rateLimit: false });
    expect(await off.step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
  });
});

describe("takedownReproduction (remoção em 24 h)", () => {
  it("bloqueia, apaga a cópia, invalida as páginas e audita", async () => {
    const { repo, step, store } = setup({});
    await step(msg);
    const path = repo.assets()[0]!.storagePath;
    const tags: string[] = [];
    const r = await takedownReproduction(
      { repo, store, revalidate: async (t) => void tags.push(...t), now: () => NOW },
      { mediaId: "m-1" },
      "c1000000-0000-4000-8000-000000000002",
      "Veículo pediu remoção",
    );
    expect(r.ok).toBe(true);
    expect(repo.assets()[0]!.status).toBe("blocked");
    expect(store.files.has(path)).toBe(false);
    expect(tags).toContain("article:a1");
    expect(repo.audits()).toEqual([
      expect.objectContaining({ action: "media.takedown", objectRef: "media:m-1" }),
    ]);
  });

  it("exige motivo e asset existente", async () => {
    const { repo, store } = setup({});
    const deps = { repo, store, revalidate: async () => {}, now: () => NOW };
    expect(await takedownReproduction(deps, { mediaId: "m-1" }, "x", " ")).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(await takedownReproduction(deps, { mediaId: "nada" }, "x", "motivo")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("reaproveitamento pelo Media Registry (D-02)", () => {
  const asset = {
    id: "m",
    kind: "reproduction" as const,
    storagePath: "x",
    originUrl: "https://x/a.jpg",
    status: "approved" as const,
    width: 800,
    height: 600,
    credit: null,
    sourceId: null,
    tags: [],
  };
  it("bloqueada ou com autorização vencida nunca volta a ser escolhida", () => {
    expect(reusableAsset({ ...asset, status: "blocked" })).toBe(false);
    expect(reusableAsset({ ...asset, rightsStatus: "expired" })).toBe(false);
    expect(reusableAsset({ ...asset, rightsStatus: "blocked" })).toBe(false);
  });
  it("direitos desconhecidos seguem a política de reprodução (não bloqueiam)", () => {
    expect(reusableAsset({ ...asset, rightsStatus: "unknown" })).toBe(true);
    expect(reusableAsset(asset)).toBe(true);
  });
});
