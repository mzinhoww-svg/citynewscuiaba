const SECRET = "segredo-de-teste-da-rota-review-tick-32+";
const { defaultReviewDeps, sweep } = vi.hoisted(() => ({
  defaultReviewDeps: vi.fn(),
  sweep: vi.fn(async () => 2),
}));
vi.mock("@/lib/pipeline/deps", () => ({ defaultReviewDeps, defaultTopicSweep: () => sweep }));
const autonomy = vi.hoisted(() => vi.fn(async () => ({ rewrites: 1, reevaluations: 0 })));
vi.mock("@/lib/pipeline/autonomy-sweep", () => ({ runAutonomySweep: autonomy }));
vi.mock("@/lib/db/autonomy-store", () => ({ createAutonomySweepPort: () => ({}) }));
vi.mock("@/lib/db/client", () => ({ createServiceClient: () => ({}) }));

const req = (secret?: string) =>
  new Request("http://localhost/api/ingest/review-tick", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  defaultReviewDeps.mockReset();
  defaultReviewDeps.mockImplementation(() => ({
    repo: { mode: async () => "off" },
    flags: { isEnabled: async () => true },
    now: () => new Date("2026-10-04T02:00:00Z"),
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ingest/review-tick", () => {
  it("configuração da rota igual à dos outros ticks", async () => {
    const route = await import("./route");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.maxDuration).toBe(60);
  });

  it("sem o segredo devolve 401 e não monta dependências", async () => {
    const { POST } = await import("./route");
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("errado"))).status).toBe(401);
    expect(defaultReviewDeps).not.toHaveBeenCalled();
    expect(autonomy).not.toHaveBeenCalled();
  });

  it("com o segredo devolve o resultado do revisor (modo off: inativo)", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    // As varreduras de assuntos encerrados (AUT-T7) e de autonomia (A-143) rodam mesmo com o
    // revisor desligado.
    expect(await res.json()).toEqual({
      status: "inactive",
      mode: "off",
      topicsClosed: 2,
      autonomy: { rewrites: 1, reevaluations: 0 },
    });
    expect(autonomy).toHaveBeenCalledTimes(1);
  });
});
