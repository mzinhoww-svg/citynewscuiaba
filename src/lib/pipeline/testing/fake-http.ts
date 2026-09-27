import type { HttpFetch } from "../ports";

export interface FakeRoute {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

/** `fetch` falso: responde por URL a partir de fixtures; nunca acessa a rede. */
export function createFakeHttp(routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>) {
  const calls: { url: string; headers: Headers; signal: AbortSignal | null }[] = [];
  const http: HttpFetch = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url, headers, signal: init.signal ?? null });
    const route = routes[url];
    const r = typeof route === "function" ? route(headers) : route;
    if (!r) return new Response("não encontrado", { status: 404 });
    const status = r.status ?? 200;
    const nullBody = status === 204 || status === 304;
    return new Response(nullBody ? null : (r.body ?? ""), { status, headers: r.headers ?? {} });
  };
  return { http, calls };
}
