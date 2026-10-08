import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Opts = { global?: { fetch?: typeof fetch } };
const seen: { opts: Opts | null } = { opts: null };
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_u: string, _k: string, opts: Opts) => {
    seen.opts = opts;
    return {};
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: Opts) => {
    seen.opts = opts;
    return {};
  },
  createBrowserClient: () => ({}),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

import { createPublicClient, createServerClient, createServiceClient } from "./client";

/** Mede em quanto tempo o `fetch` do cliente aborta uma requisição que nunca responde. */
async function abortsAfter(f: typeof fetch, ms: number): Promise<string> {
  const outcome = f("https://db.test/rest/v1/x").then(
    () => "respondeu",
    (e: unknown) => (e as { name?: string }).name ?? "outro",
  );
  await vi.advanceTimersByTimeAsync(ms - 1);
  const early = await Promise.race([outcome, Promise.resolve("pendente")]);
  await vi.advanceTimersByTimeAsync(2);
  return `${early}/${await outcome}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_i: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    ),
  );
  seen.opts = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("clientes do banco com prazo (item 82)", () => {
  it("cliente de sessão do leitor: 8 s", async () => {
    await createServerClient();
    expect(await abortsAfter(seen.opts!.global!.fetch!, 8000)).toBe("pendente/TimeoutError");
  });

  it("cliente público com cache do Next: 8 s", async () => {
    createPublicClient({ tags: ["home"], revalidate: 60 });
    expect(await abortsAfter(seen.opts!.global!.fetch!, 8000)).toBe("pendente/TimeoutError");
  });

  it("service role (cron e pipeline): 20 s", async () => {
    createServiceClient();
    expect(await abortsAfter(seen.opts!.global!.fetch!, 20_000)).toBe("pendente/TimeoutError");
  });
});
