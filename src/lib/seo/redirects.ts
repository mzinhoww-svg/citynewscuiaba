/**
 * Redirecionamentos (A08): matéria arquivada ou endereço antigo → destino interno. Puro:
 * validação dos caminhos (só internos, sem esquema, sem laço) e resolução numa lista.
 */
import { err, ok, type Result } from "@/lib/result";

export interface Redirect {
  fromPath: string;
  toPath: string;
  kind: 301 | 302;
}

export type RedirectError = "invalid_from" | "invalid_to" | "same" | "loop";

const PATH = /^\/[^\s?#]*$/;

export function normalizePath(p: string): string {
  const t = p.trim();
  if (t.length > 1 && t.endsWith("/")) return t.slice(0, -1);
  return t;
}

/** Aceita só caminhos internos; `to` pode ter query. Recusa laço com a lista atual. */
export function validateRedirect(
  input: { fromPath: string; toPath: string },
  existing: readonly Redirect[] = [],
): Result<{ fromPath: string; toPath: string }, RedirectError> {
  const fromPath = normalizePath(input.fromPath);
  const toPath = normalizePath(input.toPath);
  if (!PATH.test(fromPath) || fromPath.length > 300) return err("invalid_from");
  if (!/^\/[^\s#]*$/.test(toPath) || toPath.length > 300 || toPath.startsWith("//"))
    return err("invalid_to");
  if (fromPath === toPath) return err("same");
  // Laço: o destino (ou a cadeia a partir dele) volta para a origem.
  const map = new Map(existing.map((r) => [r.fromPath, r.toPath]));
  map.set(fromPath, toPath);
  let cur: string | undefined = toPath.split("?")[0];
  for (let i = 0; i < 10 && cur; i++) {
    if (cur === fromPath) return err("loop");
    cur = map.get(cur)?.split("?")[0];
  }
  return ok({ fromPath, toPath });
}

/** Destino de um caminho na lista, ou `null`. */
export function resolveRedirect(path: string, list: readonly Redirect[]): Redirect | null {
  const p = normalizePath(path);
  return list.find((r) => r.fromPath === p) ?? null;
}
