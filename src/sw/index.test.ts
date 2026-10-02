// @vitest-environment node
/**
 * Eventos do service worker com um `ServiceWorkerGlobalScope` de mentira (gate do PWA):
 * PWA-06 (Estúdio, entrar e /auth passam direto pela rede), PWA-07 (a resposta da página sai sem
 * esperar o corpo inteiro) e PWA-11 (toque no aviso não navega a aba do Estúdio).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./shared-db", () => ({
  allEntries: async () => [],
  deleteEntries: async () => undefined,
  getMeta: async () => null,
  putEntry: async () => undefined,
  setMeta: async () => undefined,
  touch: async () => undefined,
}));

type Handler = (event: unknown) => void;
const cachePut = vi.fn<(req: unknown, res: unknown) => Promise<void>>(async () => undefined);
const handlers = new Map<string, Handler>();
const ORIGIN = "https://citynews.example";

const clients = {
  matchAll: vi.fn(),
  openWindow: vi.fn(async () => null),
  claim: vi.fn(async () => undefined),
};

beforeAll(async () => {
  const cacheStore = {
    match: async () => undefined,
    put: (req: unknown, res: unknown) => cachePut(req, res),
    add: async () => undefined,
    delete: async () => true,
    keys: async () => [],
  };
  vi.stubGlobal("self", {
    location: { origin: ORIGIN },
    addEventListener: (type: string, h: Handler) => handlers.set(type, h),
    skipWaiting: async () => undefined,
    clients,
    registration: { showNotification: async () => undefined },
    navigator: { onLine: true },
  });
  vi.stubGlobal("caches", {
    open: async () => cacheStore,
    keys: async () => [],
    delete: async () => true,
  });
  const path = "./index";
  await import(/* @vite-ignore */ path);
});

beforeEach(() => {
  clients.matchAll.mockReset();
  clients.openWindow.mockClear();
});

interface FetchProbe {
  responded: Promise<Response> | null;
  waited: Promise<unknown>[];
}
function navigate(path: string): FetchProbe {
  const probe: FetchProbe = { responded: null, waited: [] };
  handlers.get("fetch")!({
    request: { method: "GET", mode: "navigate", url: `${ORIGIN}${path}` },
    respondWith: (p: Promise<Response>) => (probe.responded = p),
    waitUntil: (p: Promise<unknown>) => probe.waited.push(p),
  });
  return probe;
}

describe("fetch de navegação", () => {
  it.each(["/estudio", "/estudio/admin/notificacoes", "/entrar", "/auth/callback", "/perfil"])(
    "%s passa direto pela rede: o SW não responde (PWA-06)",
    (path) => {
      expect(navigate(path).responded).toBeNull();
    },
  );

  it("página pública sem cache lenta demais não vira Sem conexão para rota fora da allowlist (PWA-06)", async () => {
    // `/sobre` não é da allowlist: sem tempo limite de 4 s; a resposta da rede chega.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return new Response("ok", { status: 200 });
      }),
    );
    const probe = navigate("/sobre");
    const res = await probe.responded!;
    expect(await res.text()).toBe("ok");
  });

  it("matéria: a resposta sai antes de o corpo terminar (streaming preservado, PWA-07)", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "x-cn-offline": "1", "content-type": "text/html" },
          }),
      ),
    );
    const probe = navigate("/materia/chuva-em-cuiaba");
    const res = await Promise.race([
      probe.responded!,
      new Promise<null>((r) => setTimeout(() => r(null), 500)),
    ]);
    expect(res).not.toBeNull();
    // O corpo só termina depois; nada foi lido antes da resposta.
    controller.enqueue(new TextEncoder().encode("<title>Chuva · CityNews</title>"));
    controller.close();
    expect(await (res as Response).text()).toContain("Chuva");
    await Promise.allSettled(probe.waited);
  });
});

describe("notificationclick", () => {
  const click = async (url: string) => {
    const waited: Promise<unknown>[] = [];
    handlers.get("notificationclick")!({
      notification: { close: () => undefined, data: { url } },
      waitUntil: (p: Promise<unknown>) => waited.push(p),
    });
    await Promise.all(waited);
  };
  const win = (url: string) => ({
    url,
    focus: vi.fn(async () => undefined),
    navigate: vi.fn(async () => undefined),
  });

  it("navega a janela do portal e nunca a do Estúdio (PWA-11)", async () => {
    const studio = win(`${ORIGIN}/estudio/materias/x/editar`);
    const site = win(`${ORIGIN}/cidade`);
    clients.matchAll.mockResolvedValue([studio, site]);
    await click("/materia/chuva");
    expect(studio.navigate).not.toHaveBeenCalled();
    expect(site.navigate).toHaveBeenCalledWith("/materia/chuva");
    expect(site.focus).toHaveBeenCalled();
  });

  it("só há aba do Estúdio: abre uma janela nova", async () => {
    const studio = win(`${ORIGIN}/estudio`);
    clients.matchAll.mockResolvedValue([studio]);
    await click("/materia/chuva");
    expect(studio.navigate).not.toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith("/materia/chuva");
  });
});

describe("cache-saved (PWA-10)", () => {
  async function sync(paths: unknown[]) {
    const waited: Promise<unknown>[] = [];
    handlers.get("message")!({
      data: { type: "cache-saved", paths },
      waitUntil: (p: Promise<unknown>) => waited.push(p),
    });
    await Promise.all(waited);
  }
  const page = (marker: boolean) =>
    new Response("<title>Chuva · CityNews</title>", {
      status: 200,
      headers: marker ? { "x-cn-offline": "1" } : {},
    });

  it("busca sem cookie (credentials omit) e guarda só resposta com o marcador", async () => {
    cachePut.mockClear();
    const fetchMock = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async () =>
      page(true),
    );
    vi.stubGlobal("fetch", fetchMock);
    await sync(["/materia/chuva-em-cuiaba"]);
    const calls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/"));
    expect(calls.length).toBeGreaterThan(0);
    for (const [, init] of calls.filter(([u]) => !String(u).startsWith("/offline")))
      expect(init).toMatchObject({ credentials: "omit" });
    expect(cachePut.mock.calls.map(([r]) => String(r))).toContain("/materia/chuva-em-cuiaba");
  });

  it("resposta sem o marcador (havia sessão ou rota fora da política) não vai para o cache", async () => {
    cachePut.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page(false)),
    );
    await sync(["/materia/chuva-em-cuiaba"]);
    expect(cachePut).not.toHaveBeenCalled();
  });

  it.each([
    "/estudio/materias",
    "/perfil",
    "/api/materia",
    "/entrar",
    "//evil.example/x",
    "/cidade",
  ])("caminho %s fora das matérias nem chega a ser buscado", async (path) => {
    cachePut.mockClear();
    const fetchMock = vi.fn<(url: unknown) => Promise<Response>>(async () => page(true));
    vi.stubGlobal("fetch", fetchMock);
    await sync([path]);
    expect(fetchMock.mock.calls.map(([u]) => String(u))).not.toContain(path);
    expect(cachePut.mock.calls.map(([r]) => String(r))).not.toContain(path);
  });
});
