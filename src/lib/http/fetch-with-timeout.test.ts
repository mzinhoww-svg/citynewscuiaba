import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetch-with-timeout";

/** `fetch` falso que só termina quando o sinal aborta. */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("aborta a requisição que passa do prazo com TimeoutError", async () => {
    vi.useFakeTimers();
    const base = hangingFetch();
    vi.stubGlobal("fetch", base);
    const outcome = fetchWithTimeout(8000)("https://exemplo.test/x").then(
      () => "ok",
      (e: unknown) => (e as { name?: string }).name,
    );
    await vi.advanceTimersByTimeAsync(7999);
    expect(base).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(await outcome).toBe("TimeoutError");
  });

  it("devolve a resposta dentro do prazo e repassa o init", async () => {
    const base = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", base);
    const res = await fetchWithTimeout(8000)("https://exemplo.test/x", { method: "POST" });
    expect(res.status).toBe(200);
    const init = base.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("respeita o sinal de quem chama sem perder o prazo", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ctrl = new AbortController();
    const p = fetchWithTimeout(8000)("https://exemplo.test/x", { signal: ctrl.signal });
    ctrl.abort(new DOMException("parou", "AbortError"));
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("usa o fetch base informado (cache do Next, testes)", async () => {
    const base = vi.fn(async () => new Response("ok"));
    await fetchWithTimeout(20_000, base)("https://exemplo.test/y");
    expect(base).toHaveBeenCalledTimes(1);
  });
});
