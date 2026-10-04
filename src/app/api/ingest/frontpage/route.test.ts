import type { FrontpageReport } from "@/lib/pipeline/steps/frontpage";

const SECRET = "segredo-de-teste-da-rota-frontpage-32+";
const { defaultFrontpageDeps, runFrontpage } = vi.hoisted(() => ({
  defaultFrontpageDeps: vi.fn(() => ({})),
  runFrontpage: vi.fn(async (): Promise<FrontpageReport> => ({
    status: "done" as const,
    sources: 0,
    read: 0,
    signals: 0,
    matched: 0,
    skipped: {},
  })),
}));
vi.mock("@/lib/pipeline/deps", () => ({ defaultFrontpageDeps }));
vi.mock("@/lib/pipeline/steps/frontpage", () => ({ runFrontpage }));
const { runHotPins } = vi.hoisted(() => ({
  runHotPins: vi.fn(async () => ({ pinned: 1, renewed: 0, skipped: 0 })),
}));
vi.mock("@/lib/pipeline/hot-pins", () => ({ runHotPins }));

const req = (secret?: string) =>
  new Request("http://localhost/api/ingest/frontpage", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  defaultFrontpageDeps.mockClear();
  runFrontpage.mockClear();
  runHotPins.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ingest/frontpage", () => {
  it("configuração da rota igual à dos outros ticks", async () => {
    const route = await import("./route");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.maxDuration).toBe(60);
  });

  it("sem o segredo (ou com segredo inválido) devolve 401 e não monta dependências", async () => {
    const { POST } = await import("./route");
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("errado"))).status).toBe(401);
    expect(defaultFrontpageDeps).not.toHaveBeenCalled();
    expect(runFrontpage).not.toHaveBeenCalled();
    expect(runHotPins).not.toHaveBeenCalled();
  });

  it("com o segredo roda o passo e devolve o relatório", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "done", signals: 0 });
    expect(runFrontpage).toHaveBeenCalledTimes(1);
  });

  it("depois do passo aplica a pauta quente (HOT-T3) e devolve o resultado junto", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(SECRET));
    expect(runHotPins).toHaveBeenCalledWith("frontpage");
    expect(await res.json()).toMatchObject({ hot: { pinned: 1 } });
  });

  it("pauta quente indisponível (null) não derruba a rota", async () => {
    runHotPins.mockResolvedValueOnce(null as never);
    const { POST } = await import("./route");
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "done", hot: null });
  });
});
