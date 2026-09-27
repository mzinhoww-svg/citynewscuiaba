import { err } from "@/lib/result";

vi.mock("@/lib/db/queries", () => ({
  getEvent: vi.fn(async () => err({ kind: "unconfigured" })),
}));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

it("sem banco configurado responde 404 com mensagem, nunca 5xx", async () => {
  const { GET } = await import("./route");
  const res = await GET(new Request("http://x/api/ics/evento"), params("evento"));
  expect(res.status).toBe(404);
  expect(await res.text()).toMatch(/indisponível/i);
});

it("banco fora do ar também responde 404 sem cache", async () => {
  const { getEvent } = await import("@/lib/db/queries");
  vi.mocked(getEvent).mockResolvedValueOnce(err({ kind: "unavailable", message: "x" }));
  const { GET } = await import("./route");
  const res = await GET(new Request("http://x/api/ics/evento"), params("evento"));
  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("no-store");
});
