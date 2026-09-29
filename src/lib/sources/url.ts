/**
 * URL colada no cadastro de fonte (spec §7.1): valida sem tocar a rede (SSRF fica com
 * `crawlGet`/`checkRobots`, que já passam por `isForbiddenHost`/`resolve` de `pipeline/net.ts`).
 */
import { isForbiddenHost } from "@/lib/pipeline/net";
import { err, ok, type Result } from "@/lib/result";

export type UrlProblem =
  "invalid" | "scheme" | "credentials" | "port" | "too_long" | "forbidden_host";

const MAX_LENGTH = 2048;
/** Parâmetros de rastreio removidos da URL colada (spec §7.1: "sem parâmetros de rastreio"). */
const TRACKING_PARAM = /^(utm_|mc_[ce]id$|fbclid$|gclid$|igshid$|ref_src$|spm$)/i;

/** Host de um só rótulo (sem ponto), sempre interno, mesma régua de `isForbiddenHost`. */
function isSingleLabelHost(hostname: string): boolean {
  return !hostname.includes(".");
}

/**
 * Normaliza a URL colada: só `http`/`https`, sem credenciais, porta padrão, host permitido, até
 * 2048 caracteres; remove fragmento, parâmetros de rastreio e barra final do caminho.
 */
export function normalizePastedUrl(input: string): Result<URL, UrlProblem> {
  if (input.length > MAX_LENGTH) return err("too_long");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return err("invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return err("scheme");
  if (url.username || url.password) return err("credentials");
  if (url.port !== "") return err("port");
  if (isSingleLabelHost(url.hostname) || isForbiddenHost(url.hostname))
    return err("forbidden_host");

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  }
  return ok(url);
}

/** Chave de comparação de site (mesmo registrável, ignorando `www.`), usada em page-list.ts. */
export function hostKey(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

/** Slug a partir do nome da fonte: mesma régua de `pipeline/slug.ts`, fallback `"fonte"`. */
export function slugFromName(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 60).replace(/-+$/g, "") || "fonte";
}
