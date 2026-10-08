import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { readPublic } = vi.hoisted(() => ({
  readPublic: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, value: [] })),
}));
vi.mock("./run", () => ({ readPublic, many: vi.fn(), one: vi.fn() }));

import { upcomingEventsAtVenue } from "./events";

describe("upcomingEventsAtVenue (cache)", () => {
  it("usa a tag `agenda` (retirar ou editar evento revalida) com revalidate ≤ 300 s", async () => {
    await upcomingEventsAtVenue("6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b");
    const cache = readPublic.mock.calls[0]?.[1] as { tags: string[]; revalidate: number };
    expect(cache.tags).toContain("agenda");
    expect(cache.revalidate).toBeGreaterThan(0);
    expect(cache.revalidate).toBeLessThanOrEqual(300);
  });
});
