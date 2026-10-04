import { describe, expect, it, vi } from "vitest";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { createTripadvisorProvider, toVenue } from "./tripadvisor";

/** Valor fictício só para os testes; a chave real existe apenas no ambiente do servidor. */
const FAKE_KEY = "TESTE-chave-ficticia";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const SEARCH = {
  data: [
    {
      location_id: "9001",
      name: "Padaria Pão Dourado",
      address_obj: { street1: "Rua das Acácias, 120", city: "Cuiabá", state: "Mato Grosso" },
    },
    {
      location_id: "9002",
      name: "Padaria de Outra Cidade",
      address_obj: { street1: "Av. X", city: "Goiânia", state: "Goiás" },
    },
  ],
};

const DETAILS = {
  location_id: "9001",
  name: "Padaria Pão Dourado",
  web_url: "https://www.tripadvisor.com.br/Restaurant_Review-g1-d9001-Reviews-Pao_Dourado.html",
  address_obj: { street1: "Rua das Acácias, 120", city: "Cuiabá" },
  latitude: "-15.6012",
  longitude: "-56.0971",
  phone: "+55 65 3000-1111",
  website: "https://paodourado.example",
  rating: "4.5",
  num_reviews: "312",
  price_level: "$$ - $$$",
  ranking_data: { ranking: "7", ranking_string: "#7 de 800 Restaurantes em Cuiabá" },
  cuisine: [{ name: "Brasileira", localized_name: "Brasileira" }],
  hours: { weekday_text: ["segunda: 06:00-20:00", "terça: 06:00-20:00"] },
  // Texto de avaliação existe na resposta de algumas rotas; nunca pode ser lido nem guardado.
  reviews: [{ text: "TEXTO-DE-AVALIACAO-QUE-NAO-PODE-SER-GUARDADO" }],
};

describe("tripadvisor provider", () => {
  it("sem chave não faz nenhuma requisição e devolve no_key", async () => {
    const http = vi.fn<HttpFetch>();
    const p = createTripadvisorProvider({ apiKey: undefined, http });
    expect(p.enabled).toBe(false);
    expect(await p.search({ category: "padaria", area: "Cuiabá" })).toEqual({
      ok: false,
      error: "no_key",
    });
    expect(await p.details("9001")).toEqual({ ok: false, error: "no_key" });
    expect(http).not.toHaveBeenCalled();
    const blank = createTripadvisorProvider({ apiKey: "   ", http });
    expect(blank.enabled).toBe(false);
  });

  it("envia o Referer do site: a chave da Content API é restrita ao domínio cadastrado", async () => {
    const http = vi.fn<HttpFetch>(async () => json(SEARCH));
    const p = createTripadvisorProvider({
      apiKey: FAKE_KEY,
      http,
      referer: "https://citynews.example",
    });
    await p.search({ category: "padaria", area: "Cuiabá" });
    const init = http.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Referer")).toBe("https://citynews.example/");
  });

  it("busca por categoria perto de Cuiabá e descarta lugares de outras cidades", async () => {
    const http = vi.fn<HttpFetch>(async () => json(SEARCH));
    const p = createTripadvisorProvider({ apiKey: FAKE_KEY, http });
    const r = await p.search({ category: "padaria", area: "Cuiabá" });
    expect(r.ok && r.value.map((v) => v.placeIds.tripadvisor)).toEqual(["9001"]);
    const url = new URL(http.mock.calls[0]![0]);
    expect(url.pathname).toBe("/api/v1/location/search");
    expect(url.searchParams.get("searchQuery")).toBe("padaria Cuiabá");
    expect(url.searchParams.get("category")).toBe("restaurants");
    expect(url.searchParams.get("language")).toBe("pt");
    expect(url.searchParams.get("latLong")).toMatch(/^-15\./);
  });

  it("detalhes mapeiam nota, contagem, posição, preço e contato, sem texto de avaliação", async () => {
    const http = vi.fn<HttpFetch>(async () => json(DETAILS));
    const p = createTripadvisorProvider({ apiKey: FAKE_KEY, http });
    const r = await p.details("9001");
    expect(r.ok).toBe(true);
    const v = r.ok ? r.value! : null;
    expect(v).toMatchObject({
      name: "Padaria Pão Dourado",
      rating: 4.5,
      ratingCount: 312,
      ratingSource: "tripadvisor",
      tripadvisorRank: 7,
      priceLevel: 3,
      phone: "+55 65 3000-1111",
      website: "https://paodourado.example",
      lat: -15.6012,
      lng: -56.0971,
      placeIds: { tripadvisor: "9001" },
      sources: ["tripadvisor"],
    });
    expect(v?.tripadvisorUrl).toMatch(/^https:\/\/www\.tripadvisor\.com\.br\//);
    expect(JSON.stringify(v)).not.toContain("TEXTO-DE-AVALIACAO");
  });

  it("detalhe de lugar fora de Cuiabá vira null", async () => {
    const p = createTripadvisorProvider({
      apiKey: FAKE_KEY,
      http: async () => json({ ...DETAILS, address_obj: { city: "Campo Grande" } }),
    });
    expect(await p.details("9001")).toEqual({ ok: true, value: null });
  });

  it("id de lugar só numérico (nada vai para o caminho da URL)", async () => {
    const http = vi.fn<HttpFetch>();
    const p = createTripadvisorProvider({ apiKey: FAKE_KEY, http });
    expect(await p.details("../../admin")).toEqual({ ok: false, error: "invalid" });
    expect(http).not.toHaveBeenCalled();
  });

  it("erros viram códigos fixos e a chave nunca aparece no resultado", async () => {
    const statuses: [number, string][] = [
      [401, "unauthorized"],
      [403, "unauthorized"],
      [429, "rate_limited"],
      [500, "http"],
    ];
    for (const [status, code] of statuses) {
      const p = createTripadvisorProvider({ apiKey: FAKE_KEY, http: async () => json({}, status) });
      const r = await p.details("1");
      expect(r).toEqual({ ok: false, error: code });
      expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    }
    const down = createTripadvisorProvider({
      apiKey: FAKE_KEY,
      http: async (url) => {
        throw new Error(`falhou ${url}`);
      },
    });
    const r = await down.search({ category: "padaria", area: "Cuiabá" });
    expect(r).toEqual({ ok: false, error: "network" });
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });

  it("conta cada requisição feita (cota e custo)", async () => {
    const onCall = vi.fn();
    const p = createTripadvisorProvider({
      apiKey: FAKE_KEY,
      http: async () => json(SEARCH),
      onCall,
    });
    await p.search({ category: "padaria", area: "Cuiabá" });
    await p.search({ category: "bar", area: "Cuiabá" });
    expect(onCall).toHaveBeenCalledTimes(2);
  });

  it("toVenue recusa nota fora da escala", () => {
    const v = toVenue(
      { location_id: "1", name: "Lugar X", rating: "9.9", num_reviews: "-3" },
      "bar",
      null,
    )!;
    expect(v.rating).toBeNull();
    expect(v.ratingCount).toBeNull();
    expect(v.ratingSource).toBeNull();
  });
});
