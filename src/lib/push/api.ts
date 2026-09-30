/**
 * Rotas públicas do push (spec 2026-09-28 §13; Review Focus 4 e 5): handlers puros com deps
 * injetáveis, no padrão de `src/lib/events/api.ts`. `Origin` do site, corpo ≤ 4 KB, zod estrito,
 * limites por IP em hash com sal diário, nenhum log de endpoint ou token.
 */
import { readConsentCookie } from "@/lib/consent";
import type { ResolveHost } from "@/lib/pipeline/net";
import { clientIp, ipKey } from "@/lib/security/rate-limit";
import { endpointHost, endpointProblem, endpointResolvesSafely } from "./endpoints";
import {
  patchBodySchema,
  receiptBodySchema,
  rotateBodySchema,
  subscribeBodySchema,
  type PatchBody,
  type PushPrefs,
} from "./schemas";
import { bearer, hashToken, newManageToken, tokenMatches } from "./token";
import type { BrowserFamily, DeviceClass, Platform, TargetKey } from "./types";
import { browserFamily, deviceClass, platformOf } from "./ua";

export const MAX_BODY_BYTES = 4 * 1024;
export const LIMITS = {
  subscribe: { bucket: "push-sub", limit: 10, windowSec: 3600 },
  patch: { bucket: "push-patch", limit: 60, windowSec: 3600 },
  patchIp: { bucket: "push-patch-ip", limit: 120, windowSec: 3600 },
  remove: { bucket: "push-del", limit: 20, windowSec: 3600 },
  rotate: { bucket: "push-rotate", limit: 10, windowSec: 3600 },
  receipt: { bucket: "push-receipt", limit: 120, windowSec: 3600 },
} as const;

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  endpointHost: string | null;
  tokenHash: string;
  targets: TargetKey[];
  prefs: PushPrefs;
  metricsConsent: boolean;
  installed: boolean;
  userId: string | null;
  browser: BrowserFamily;
  deviceClass: DeviceClass;
  platform: Platform;
}

export type NewSubscription = Omit<SubscriptionRow, "id">;

export interface SubscriptionPatch {
  targets?: TargetKey[];
  prefs?: Partial<PushPrefs>;
  metricsConsent?: boolean;
  installed?: boolean;
  seen?: boolean;
}

export interface PushSubscriptionStore {
  findByEndpoint(endpoint: string): Promise<{ id: string; tokenHash: string } | null>;
  insert(row: NewSubscription): Promise<{ id: string }>;
  /** Substitui a inscrição do mesmo endpoint (token novo, alvos novos). */
  replace(id: string, row: NewSubscription): Promise<void>;
  get(id: string): Promise<SubscriptionRow | null>;
  update(id: string, patch: SubscriptionPatch): Promise<void>;
  remove(id: string): Promise<void>;
  rotate(id: string, endpoint: string, keys: { p256dh: string; auth: string }): Promise<void>;
  receiptHit(
    sendId: string,
    event: "delivered" | "clicked",
    device: DeviceClass,
    browser: BrowserFamily,
    now: Date,
  ): Promise<boolean>;
}

export interface PushApiDeps {
  store: PushSubscriptionStore;
  /** `true` quando ainda cabe no limite. */
  hitLimit(bucket: string, key: string, limit: number, windowSec: number): Promise<boolean>;
  /** `null` sem sal em produção: 503, falha fechado. */
  salt: string | null;
  now(): Date;
  siteOrigin: string;
  resolve: ResolveHost;
  testHosts: string[];
  /** Chaves VAPID presentes (ou provedor falso). */
  enabled: boolean;
  /** Id do leitor com sessão, se houver. */
  userId?(req: Request): Promise<string | null>;
}

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
export const RATE_LIMITED_TEXT = "Muitas tentativas. Tente de novo em alguns minutos.";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: HEADERS });
}
function empty(status: number): Response {
  return new Response(null, { status, headers: HEADERS });
}
function error(status: number, message: string): Response {
  return json(status, { error: message });
}

function originOk(req: Request, siteOrigin: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(siteOrigin).origin;
  } catch {
    return false;
  }
}

async function readJson(
  req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; res: Response }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, res: error(413, "grande demais") };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, res: error(400, "corpo ilegível") };
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    return { ok: false, res: error(413, "grande demais") };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, res: error(400, "JSON inválido") };
  }
}

type Gate = { ok: true; key: string } | { ok: false; res: Response };

/** Origem, disponibilidade, sal e limite por IP. */
async function gate(
  req: Request,
  deps: PushApiDeps,
  limit: { bucket: string; limit: number; windowSec: number },
  keySuffix?: string,
  /** Apagar e alterar a própria inscrição valem sem chaves VAPID (LGPD, PWA-15). */
  requireEnabled = true,
): Promise<Gate> {
  if (!originOk(req, deps.siteOrigin))
    return { ok: false, res: error(403, "origem não permitida") };
  if (requireEnabled && !deps.enabled)
    return { ok: false, res: error(503, "avisos indisponíveis") };
  if (!deps.salt) return { ok: false, res: error(503, "indisponível") };
  const key = keySuffix ?? ipKey(clientIp(req.headers), deps.now(), deps.salt);
  const bucket = keySuffix ? `${limit.bucket}:${keySuffix}` : limit.bucket;
  if (!(await deps.hitLimit(bucket, key, limit.limit, limit.windowSec)))
    return { ok: false, res: error(429, RATE_LIMITED_TEXT) };
  return { ok: true, key };
}

function zodMessage(e: { issues: { message: string; path: PropertyKey[] }[] }): string {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "corpo"}: ${i.message}` : "inválido";
}

async function endpointAllowed(endpoint: string, deps: PushApiDeps): Promise<boolean> {
  if (endpointProblem(endpoint, deps.testHosts) !== null) return false;
  return endpointResolvesSafely(new URL(endpoint), deps.resolve, deps.testHosts);
}

const DEFAULT_PREFS: PushPrefs = {
  follow: true,
  urgent: true,
  highlight: true,
  quietStart: 22,
  quietEnd: 7,
  dailyLimit: 3,
};

function publicView(row: SubscriptionRow) {
  return {
    id: row.id,
    targets: row.targets,
    prefs: row.prefs,
    metricsConsent: row.metricsConsent,
    installed: row.installed,
  };
}

/** POST /api/push/subscriptions */
export async function handleSubscribe(req: Request, deps: PushApiDeps): Promise<Response> {
  const g = await gate(req, deps, LIMITS.subscribe);
  if (!g.ok) return g.res;
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = subscribeBodySchema.safeParse(body.value);
  if (!parsed.success) return error(400, zodMessage(parsed.error));
  const b = parsed.data;
  if (!(await endpointAllowed(b.endpoint, deps))) return error(400, "endpoint não permitido");
  const ua = req.headers.get("user-agent") ?? "";
  const { token, hash } = newManageToken();
  const row: NewSubscription = {
    endpoint: b.endpoint,
    p256dh: b.keys.p256dh,
    auth: b.keys.auth,
    endpointHost: endpointHost(b.endpoint),
    tokenHash: hash,
    targets: b.targets as TargetKey[],
    prefs: b.prefs ?? DEFAULT_PREFS,
    metricsConsent: b.metricsConsent,
    installed: b.installed,
    userId: deps.userId ? await deps.userId(req) : null,
    browser: browserFamily(ua),
    deviceClass: deviceClass(ua),
    platform: platformOf(ua),
  };
  const existing = await deps.store.findByEndpoint(b.endpoint);
  if (existing) {
    if (!b.oldToken || !tokenMatches(b.oldToken, existing.tokenHash))
      return error(409, "inscrição já existe");
    await deps.store.replace(existing.id, row);
    return json(200, { id: existing.id, token });
  }
  const { id } = await deps.store.insert(row);
  return json(201, { id, token });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function owned(req: Request, id: string, deps: PushApiDeps): Promise<SubscriptionRow | null> {
  const row = await deps.store.get(id);
  if (!row || !tokenMatches(bearer(req), row.tokenHash)) return null;
  return row;
}

/** PATCH /api/push/subscriptions/:id */
export async function handlePatch(req: Request, id: string, deps: PushApiDeps): Promise<Response> {
  // Id que não é UUID nunca existe: 404 sem gravar no rate limit (PWA-05).
  if (!UUID_RE.test(id)) return error(404, "inscrição não encontrada");
  const ip = await gate(req, deps, LIMITS.patchIp, undefined, false);
  if (!ip.ok) return ip.res;
  const g = await gate(req, deps, LIMITS.patch, id, false);
  if (!g.ok) return g.res;
  const row = await owned(req, id, deps);
  if (!row) return error(404, "inscrição não encontrada");
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = patchBodySchema.safeParse(body.value);
  if (!parsed.success) return error(400, zodMessage(parsed.error));
  const b: PatchBody = parsed.data;
  await deps.store.update(id, {
    ...(b.targets ? { targets: b.targets as TargetKey[] } : {}),
    ...(b.prefs ? { prefs: b.prefs } : {}),
    ...(b.metricsConsent !== undefined ? { metricsConsent: b.metricsConsent } : {}),
    ...(b.installed !== undefined ? { installed: b.installed } : {}),
    seen: true,
  });
  const after = await deps.store.get(id);
  return json(200, publicView(after ?? row));
}

/** DELETE /api/push/subscriptions/:id */
export async function handleDelete(req: Request, id: string, deps: PushApiDeps): Promise<Response> {
  if (!UUID_RE.test(id)) return error(404, "inscrição não encontrada");
  const g = await gate(req, deps, LIMITS.remove, undefined, false);
  if (!g.ok) return g.res;
  const row = await owned(req, id, deps);
  if (!row) return error(404, "inscrição não encontrada");
  await deps.store.remove(id);
  return empty(204);
}

/** PUT /api/push/subscriptions/rotate (`pushsubscriptionchange`) */
export async function handleRotate(req: Request, deps: PushApiDeps): Promise<Response> {
  const g = await gate(req, deps, LIMITS.rotate);
  if (!g.ok) return g.res;
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = rotateBodySchema.safeParse(body.value);
  if (!parsed.success) return error(400, zodMessage(parsed.error));
  const b = parsed.data;
  const existing = await deps.store.findByEndpoint(b.oldEndpoint);
  if (!existing || !tokenMatches(bearer(req), existing.tokenHash))
    return error(404, "inscrição não encontrada");
  if (!(await endpointAllowed(b.endpoint, deps))) return error(400, "endpoint não permitido");
  await deps.store.rotate(existing.id, b.endpoint, b.keys);
  return json(200, { id: existing.id });
}

/** POST /api/push/receipt: só com Métricas no cookie; nunca liga a uma inscrição. */
export async function handleReceipt(req: Request, deps: PushApiDeps): Promise<Response> {
  const g = await gate(req, deps, LIMITS.receipt);
  if (!g.ok) return g.res;
  const consent = readConsentCookie(req.headers.get("cookie") ?? "");
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = receiptBodySchema.safeParse(body.value);
  if (!parsed.success) return error(400, zodMessage(parsed.error));
  if (!consent.metrics) return empty(204);
  const b = parsed.data;
  await deps.store.receiptHit(b.s, b.e, b.d, b.b, deps.now());
  return empty(204);
}

/** Serve ao store do banco: hash do token para comparação. */
export { hashToken };
