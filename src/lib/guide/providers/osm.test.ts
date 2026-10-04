import { describe, expect, it, vi } from "vitest";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { buildQuery, createOsmProvider, toVenue, type OsmElement } from "./osm";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ELEMENTS: { elements: OsmElement[] } = {
  elements: [
    {
      type: "node",
      id: 1001,
      lat: -15.6012,
      lon: -56.0971,
      tags: {
        name: "Padaria Pão Dourado",
        shop: "bakery",
        "addr:street": "Rua das Acácias",
        "addr:housenumber": "120",
        "addr:suburb": "Goiabeiras",
        phone: "+55 65 3000-1111;+55 65 3000-2222",
        website: "paodourado.example",
        "contact:instagram": "@paodourado",
        opening_hours: "Mo-Sa 06:00-20:00",
      },
    },
    {
      type: "way",
      id: 2002,
      center: { lat: -15.61, lon: -56.1 },
      tags: { name: "Padaria Estrela do Sul", shop: "bakery", cuisine: "regional" },
    },
    { type: "node", id: 3003, lat: -15.6, lon: -56.1, tags: { shop: "bakery" } },
    { type: "node", id: 1001, lat: -15.6012, lon: -56.0971, tags: { name: "Repetido" } },
  ],
};

describe("buildQuery", () => {
  it("consulta o município (admin_level 8) e a categoria, com timeout e limite", () => {
    const q = buildQuery({ category: "padaria", area: "Cuiabá", limit: 100 });
    expect(q).toContain('area["boundary"="administrative"]["admin_level"="8"]["name"="Cuiabá"]');
    expect(q).toContain('nwr["shop"="bakery"]["name"](area.a)');
    expect(q).toContain("[timeout:60]");
    expect(q).toContain("out center tags 100;");
  });

  it("restaurante por cozinha estreita a consulta", () => {
    const q = buildQuery({ category: "restaurante", subcategory: "italiana", area: "Cuiabá" });
    expect(q).toContain('["cuisine"~"italian|pasta"]');
  });

  it("busca por nome escapa regex e aspas (nada injeta cláusula)", () => {
    const q = buildQuery({ name: 'Bar "X" (.*)', area: "Cuiabá" });
    expect(q).toContain('\\"X\\"');
    expect(q).toContain("\\(\\.\\*\\)");
    expect(q).not.toContain('"X" (.*)');
  });

  it("categoria desconhecida não gera consulta", () => {
    expect(buildQuery({ category: "inexistente", area: "Cuiabá" })).toBe("");
  });
});

describe("toVenue", () => {
  it("mapeia nome, endereço, bairro, contato e horário; só a primeira fonte de telefone", () => {
    const v = toVenue(ELEMENTS.elements[0]!, "padaria", null)!;
    expect(v).toMatchObject({
      name: "Padaria Pão Dourado",
      category: "padaria",
      address: "Rua das Acácias, 120",
      neighborhood: "Goiabeiras",
      phone: "+55 65 3000-1111",
      website: "https://paodourado.example/",
      instagram: "https://www.instagram.com/paodourado",
      hours: "Mo-Sa 06:00-20:00",
      lat: -15.6012,
      lng: -56.0971,
      placeIds: { osm: "node/1001" },
      sources: ["osm"],
    });
    expect(v.rating).toBeNull();
  });

  it("usa o centro de uma área e a cozinha do OSM como subcategoria", () => {
    const v = toVenue(ELEMENTS.elements[1]!, "restaurante", null)!;
    expect(v.lat).toBe(-15.61);
    expect(v.subcategory).toBe("regional");
  });

  it("sem nome descarta", () => {
    expect(toVenue(ELEMENTS.elements[2]!, "padaria", null)).toBeNull();
  });

  it("instagram inválido é ignorado", () => {
    const v = toVenue(
      {
        type: "node",
        id: 9,
        lat: 1,
        lon: 1,
        tags: { name: "X Y", "contact:instagram": "javascript:alert(1)" },
      },
      "bar",
      null,
    )!;
    expect(v.instagram).toBeNull();
  });
});

describe("createOsmProvider", () => {
  it("busca com User-Agent identificável, descarta repetidos e sem nome", async () => {
    const http = vi.fn<HttpFetch>(async () => json(ELEMENTS));
    const p = createOsmProvider({ http, sleep: async () => {}, minIntervalMs: 0 });
    const r = await p.search({ category: "padaria", area: "Cuiabá" });
    expect(r.ok && r.value.map((v) => v.name)).toEqual([
      "Padaria Pão Dourado",
      "Padaria Estrela do Sul",
    ]);
    const [url, init] = http.mock.calls[0]!;
    expect(url).toMatch(/^https:\/\/overpass-api\.de\/api\/interpreter\?data=/);
    expect(init.headers["User-Agent"]).toMatch(/CityNewsBot/);
  });

  it("respeita o intervalo mínimo entre consultas", async () => {
    let t = 1_000;
    const sleeps: number[] = [];
    const http: HttpFetch = async () => json({ elements: [] });
    const p = createOsmProvider({
      http,
      minIntervalMs: 2000,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await p.search({ category: "padaria", area: "Cuiabá" });
    t += 500;
    await p.search({ category: "bar", area: "Cuiabá" });
    expect(sleeps).toEqual([1500]);
  });

  it("429 e 504 viram rate_limited; outras falhas, http, network e invalid", async () => {
    const run = async (res: () => Response | Promise<Response>) =>
      createOsmProvider({
        http: async () => res(),
        sleep: async () => {},
        minIntervalMs: 0,
      }).search({
        category: "padaria",
        area: "Cuiabá",
      });
    expect(await run(() => json({}, 429))).toEqual({ ok: false, error: "rate_limited" });
    expect(await run(() => json({}, 504))).toEqual({ ok: false, error: "rate_limited" });
    expect(await run(() => json({}, 500))).toEqual({ ok: false, error: "http" });
    expect(await run(() => new Response("não é json", { status: 200 }))).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(
      await createOsmProvider({
        http: async () => {
          throw new Error("rede");
        },
        sleep: async () => {},
        minIntervalMs: 0,
      }).search({ category: "padaria", area: "Cuiabá" }),
    ).toEqual({ ok: false, error: "network" });
  });

  it("details só aceita id no formato tipo/número", async () => {
    const http = vi.fn<HttpFetch>(async () => json({ elements: [ELEMENTS.elements[0]] }));
    const p = createOsmProvider({ http, sleep: async () => {}, minIntervalMs: 0 });
    expect(await p.details("node/1001; drop")).toEqual({ ok: false, error: "invalid" });
    const r = await p.details("node/1001");
    expect(r.ok && r.value?.name).toBe("Padaria Pão Dourado");
  });
});
