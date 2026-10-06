import { err, ok, type Result } from "@/lib/result";
import { fetchWithTimeout, isTimeoutError } from "./fetch-with-timeout";

/** Prazo padrão das consultas do cliente (pollers do portal e do Estúdio). */
export const CLIENT_FETCH_TIMEOUT_MS = 10_000;

export type FetchJsonError = "timeout" | "network" | "http" | "parse";

export interface FetchJsonOptions<T> {
  timeoutMs?: number;
  init?: RequestInit;
  /** Valida o formato do corpo; sem ele, o corpo vem como está. */
  guard?: (v: unknown) => v is T;
}

/**
 * GET (ou o que `init` disser) de JSON com prazo, devolvendo `Result` em vez de lançar
 * (item 83): `timeout` (passou do prazo), `network` (sem rede), `http` (status fora de 2xx) e
 * `parse` (corpo não é JSON ou não passa no `guard`). Sem cache e com `accept: application/json`
 * por padrão.
 *
 * ```ts
 * const r = await fetchJson("/api/estudio/notificacoes", { guard: isSnapshot });
 * if (r.ok) setSnap(r.value);
 * ```
 */
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchJsonOptions<T> = {},
): Promise<Result<T, FetchJsonError>> {
  const { timeoutMs = CLIENT_FETCH_TIMEOUT_MS, init, guard } = opts;
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  let res: Response;
  try {
    res = await fetchWithTimeout(timeoutMs)(url, { cache: "no-store", ...init, headers });
  } catch (e) {
    return err(isTimeoutError(e) ? "timeout" : "network");
  }
  if (!res.ok) return err("http");
  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    return err(isTimeoutError(e) ? "timeout" : "parse");
  }
  if (guard && !guard(body)) return err("parse");
  return ok(body as T);
}
