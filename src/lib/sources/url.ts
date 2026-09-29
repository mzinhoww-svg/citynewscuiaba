import { isForbiddenHost } from "@/lib/pipeline/net";
import { err, ok, type Result } from "@/lib/result";

export type UrlError =
  "invalid" | "scheme" | "credentials" | "port" | "too_long" | "forbidden_host";

const MAX_LENGTH = 2048;
const TRACKING = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "yclid",
  "_ga",
  "ref_src",
]);
/** Segundo nível público comum sob TLD de país (`com.br`, `gov.br`): sem lista pública completa. */
const SECOND_LEVEL = new Set(["com", "org", "net", "gov", "edu", "mil", "co", "ac"]);

/**
 * URL colada no cadastro: esquema http(s), sem credenciais, porta padrão, host com ponto e fora das
 * faixas internas. Remove fragmento, `utm_*` e afins e a barra final (a raiz fica `/`).
 */
export function normalizePastedUrl(input: string): Result<URL, UrlError> {
  const raw = input.trim();
  if (!raw) return err("invalid");
  if (raw.length > MAX_LENGTH) return err("too_long");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return err("invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return err("scheme");
  if (url.username || url.password) return err("credentials");
  if (url.port && url.port !== "80" && url.port !== "443") return err("port");
  const host = url.hostname.replace(/\.$/, "");
  if (!host) return err("invalid");
  if (isForbiddenHost(host) || !host.includes(".") || host.startsWith("["))
    return err("forbidden_host");
  url.hash = "";
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith("utm_") && !TRACKING.has(k.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return ok(url);
}

/** Domínio sem `www.`, em minúsculas (chave de limite por host e de deduplicação). */
export function hostKey(u: URL): string {
  return u.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/** Site registrável aproximado (`a.b.mtagora.example` → `mtagora.example`; `x.com.br` → `x.com.br`). */
export function registrableHost(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1] ?? "";
  const sld = labels[labels.length - 2] ?? "";
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Slug ASCII (minúsculas, hífen) a partir do nome; vazio se nada sobrar. */
export function slugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
