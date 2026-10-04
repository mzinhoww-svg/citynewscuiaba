import "server-only";
import { z } from "zod";
import { clientIp, rateLimitSalt } from "@/lib/security/rate-limit";
import { isBot, trackKey, type AdEvent } from "./track";

/**
 * Rotas de anúncio (ADS-T1, spec banners-padrão §4): contagem agregada sem identificador.
 * `POST /api/ads/view` recebe impressão (peça renderizada) e visualização (>= 50% por 1 s);
 * `GET /api/ads/click/[id]` conta o clique e redireciona (302). Nunca quebram a página: sem
 * banco ou com link inválido, o leitor segue (para a home, no clique).
 */
export interface AdApiDeps {
  track(placement: string, section: string | null, event: AdEvent, key: string): Promise<boolean>;
  /** Link https da peça ativa; `null` se não existir. */
  lookupHref(placement: string): Promise<string | null>;
  salt: string | null;
  now: () => Date;
}

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const SECTION = /^[a-z0-9-]{1,60}$/;

const Body = z.object({
  placement: z.string().uuid(),
  section: z.string().regex(SECTION).nullish(),
  event: z.enum(["impression", "view"]),
});

function key(req: Request, deps: AdApiDeps, placement: string, event: AdEvent, salt: string) {
  return trackKey({
    salt,
    ip: clientIp(req.headers),
    ua: req.headers.get("user-agent") ?? "",
    placementId: placement,
    event,
    now: deps.now(),
  });
}

export async function handleAdTrack(req: Request, deps: AdApiDeps): Promise<Response> {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 1024) return new Response(null, { status: 413, headers: HEADERS });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400, headers: HEADERS });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400, headers: HEADERS });
  if (isBot(req.headers.get("user-agent") ?? ""))
    return new Response(null, { status: 204, headers: HEADERS });
  if (!deps.salt) return new Response(null, { status: 503, headers: HEADERS });
  const { placement, section, event } = parsed.data;
  try {
    await deps.track(
      placement,
      section ?? null,
      event,
      key(req, deps, placement, event, deps.salt),
    );
  } catch {
    return new Response(null, { status: 503, headers: HEADERS });
  }
  return new Response(null, { status: 204, headers: HEADERS });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleAdClick(req: Request, id: string, deps: AdApiDeps): Promise<Response> {
  const url = new URL(req.url);
  const home = new URL("/", url).toString();
  const go = (to: string) =>
    new Response(null, { status: 302, headers: { ...HEADERS, Location: to } });
  if (!UUID.test(id)) return go(home);
  let href: string | null = null;
  try {
    href = await deps.lookupHref(id);
  } catch {
    return go(home);
  }
  if (!href || !/^https:\/\//i.test(href)) return go(home);
  const sectionParam = url.searchParams.get("s");
  const section = sectionParam && SECTION.test(sectionParam) ? sectionParam : null;
  if (deps.salt && !isBot(req.headers.get("user-agent") ?? "")) {
    try {
      await deps.track(id, section, "click", key(req, deps, id, "click", deps.salt));
    } catch {
      // contagem perdida não segura o leitor
    }
  }
  return go(href);
}

export function defaultAdApiDeps(): AdApiDeps {
  return {
    track: async (placement, section, event, k) => {
      const { trackAdEvent } = await import("@/lib/db/ads-store");
      return trackAdEvent(placement, section, event, k);
    },
    lookupHref: async (placement) => {
      const { adHref } = await import("@/lib/db/ads-store");
      return adHref(placement);
    },
    salt: rateLimitSalt(),
    now: () => new Date(),
  };
}
