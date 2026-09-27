import { err } from "@/lib/result";

vi.mock("@/lib/db/queries", () => ({
  getArticleUpdatedAt: vi.fn(async () => err({ kind: "unconfigured" })),
}));

it("sem banco responde 200 com updatedAt nulo (o aviso de atualização só não aparece)", async () => {
  const { GET } = await import("./route");
  const res = await GET(new Request("http://x/api/materia/m/atualizacao"), {
    params: Promise.resolve({ slug: "m" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ updatedAt: null });
  expect(res.headers.get("cache-control")).toBe("no-store");
});
