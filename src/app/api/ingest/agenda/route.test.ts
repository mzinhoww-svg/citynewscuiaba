// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ingest/agenda", () => {
  it("recusa sem o segredo do cron", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    const res = await POST(new Request("http://x/api/ingest/agenda", { method: "POST" }));
    expect(res.status).toBe(401);
    const bad = await POST(
      new Request("http://x/api/ingest/agenda", {
        method: "POST",
        headers: { authorization: "Bearer errado" },
      }),
    );
    expect(bad.status).toBe(401);
  });
  it("recusa tudo quando o segredo não está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(
      new Request("http://x/api/ingest/agenda", {
        method: "POST",
        headers: { authorization: "Bearer " },
      }),
    );
    expect(res.status).toBe(401);
  });
});
