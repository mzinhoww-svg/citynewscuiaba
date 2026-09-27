import type { ResolveHost } from "../net";
import type { HttpFetch } from "../ports";

export interface FakeRoute {
  status?: number;
  /** Texto (feeds) ou bytes (imagens de `tests/fixtures/images`). */
  body?: string | Uint8Array;
  headers?: Record<string, string>;
}

/** `fetch` falso: responde por URL a partir de fixtures; nunca acessa a rede. */
export function createFakeHttp(routes: Record<string, FakeRoute | ((h: Headers) => FakeRoute)>) {
  const calls: {
    url: string;
    headers: Headers;
    signal: AbortSignal | null;
    redirect: RequestRedirect | undefined;
  }[] = [];
  const http: HttpFetch = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url, headers, signal: init.signal ?? null, redirect: init.redirect });
    init.signal?.throwIfAborted();
    const route = routes[url];
    const r = typeof route === "function" ? route(headers) : route;
    if (!r) return new Response("não encontrado", { status: 404 });
    const status = r.status ?? 200;
    const nullBody = status === 204 || status === 304 || (status >= 300 && status < 400);
    const body = r.body instanceof Uint8Array ? new Uint8Array(r.body) : (r.body ?? "");
    return new Response(nullBody ? null : body, { status, headers: r.headers ?? {} });
  };
  return { http, calls };
}

/** Endereço público de documentação usado pelos testes (nenhum DNS real). */
export const FAKE_PUBLIC_IP = "93.184.215.14";

/** DNS falso: nomes do mapa resolvem para os endereços dados; o resto, para um IP público. */
export function fakeResolve(map: Record<string, string[]> = {}): ResolveHost {
  return async (host) => map[host] ?? [FAKE_PUBLIC_IP];
}
