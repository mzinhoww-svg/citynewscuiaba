/**
 * Imagem de terceiros pela política `reproduction` (D-02): cópia sem recorte no Storage, ativo no
 * Media Registry (direitos `unknown`, aviso "Foto: reprodução web", crédito e página de origem) e
 * dedupe por sha256. `storeExternalCopy` é o passo comum ao Guia (`venue-media.ts`) e à Agenda;
 * `registerExternalImage` é o fluxo completo da Agenda (ARD-T2): flag, host, robots, download,
 * tamanho mínimo, registro. Ativo bloqueado ou vencido nunca volta a ser usado.
 */
import { checkRobots, type CrawlDeps } from "@/lib/pipeline/http";
import type { MediaAssetRecord } from "@/lib/pipeline/ports";
import { err, ok, type Result } from "@/lib/result";
import { analyzeImage } from "./analyze";
import { cdnHostsOf } from "./cdn-hosts";
import { isIpLiteral } from "./ip-literal";
import { fetchImage, registrableDomain } from "./fetch-image";
import { isReusable } from "./rights";
import { mediaPath, type MediaStore } from "./store";
import type { ImageAnalysis } from "./types";

export { cdnHostsOf };

/** Largura mínima da imagem de evento (spec agenda rica §4). */
export const MIN_EXTERNAL_WIDTH = 400;

export const EXTERNAL_IMAGE_LICENSE =
  "Reprodução da imagem de divulgação da página oficial (política reproduction, D-02): aviso Foto: reprodução web, crédito e link obrigatórios, sem recorte, remoção em 24 h a pedido.";

/** "Foto: reprodução web · {fonte}" (D-02). */
export const reproductionCredit = (name: string) => `Foto: reprodução web · ${name}`;

/** Ativo novo de reprodução externa (`media_insert_asset`, sem fonte de notícia). */
export interface NewExternalAsset {
  storagePath: string;
  originUrl: string;
  pageUrl: string;
  sourceName: string;
  license: string;
  credit: string;
  allowedUse: string;
  width: number;
  height: number;
  phash: bigint;
  sha256: string;
  contentType: string;
  provenance: Record<string, unknown>;
}

/** Imagem baixada e medida, pronta para a cópia. */
export interface ExternalCopy {
  imageUrl: string;
  pageUrl: string;
  sourceName: string;
  bytes: Uint8Array;
  analysis: ImageAnalysis;
  credit: string;
  license: string;
  allowedUse: string;
  /** `provenance.kind` (ex.: `venue_official_photo`, `event_image`). */
  provenanceKind: string;
}

/** Copia para o Storage (`reproducao/{sha256}.{ext}`) e cria o ativo; devolve o id. */
export async function storeExternalCopy(
  deps: {
    store: MediaStore;
    insert: (a: NewExternalAsset) => Promise<string>;
    now: () => Date;
  },
  c: ExternalCopy,
): Promise<Result<string, "storage">> {
  const path = mediaPath("reproduction", c.analysis.sha256, c.analysis.format);
  const put = await deps.store.put(path, c.bytes, c.analysis.contentType);
  if (!put.ok) return err("storage");
  const id = await deps.insert({
    storagePath: put.value.path,
    originUrl: c.imageUrl,
    pageUrl: c.pageUrl,
    sourceName: c.sourceName,
    license: c.license,
    credit: c.credit,
    allowedUse: c.allowedUse,
    width: c.analysis.width,
    height: c.analysis.height,
    phash: c.analysis.phash,
    sha256: c.analysis.sha256,
    contentType: c.analysis.contentType,
    provenance: {
      policy: "reproduction",
      kind: c.provenanceKind,
      imageUrl: c.imageUrl,
      pageUrl: c.pageUrl,
      fetchedAt: deps.now().toISOString(),
      bytes: c.analysis.bytes,
      sha256: c.analysis.sha256,
      unmodified: true,
    },
  });
  return ok(id);
}

export type ExternalImageError =
  "flag_off" | "host" | "size" | "type" | "fetch" | "blocked" | "storage";

export interface ExternalImageRepo {
  /** Ativo com a mesma URL de origem (bloqueado vence: a origem retirada nunca volta). */
  assetByOrigin(originUrl: string): Promise<MediaAssetRecord | null>;
  /** Ativo com o mesmo arquivo (bloqueado vence). */
  assetBySha256(sha256: string): Promise<MediaAssetRecord | null>;
  insertExternalAsset(a: NewExternalAsset): Promise<string>;
}

export interface ExternalImageDeps {
  crawl: CrawlDeps;
  repo: ExternalImageRepo;
  store: MediaStore;
  /** Flag `image_reproduction_enabled`: desligada, nada é baixado. */
  reproductionEnabled: () => Promise<boolean>;
  now: () => Date;
  signal?: AbortSignal;
}

export interface ExternalImageInput {
  /** Arquivo da imagem (JSON-LD `image`, Tribe `image.url` ou `og:image`). */
  url: string;
  /** Página do evento (link do crédito). */
  pageUrl: string;
  /** Nome da fonte (crédito). */
  sourceName: string;
  /** Página cujo HTML trouxe a imagem (listagem ou página do evento); padrão `pageUrl`. */
  siteUrl?: string;
  /** Hosts que a própria página referencia fora da imagem (CDN declarada, `cdnHostsOf`). */
  cdnHosts?: readonly string[];
  /** `allowed_use` do ativo; padrão `event`. */
  allowedUse?: string;
}

const hostOf = (u: string): string | null => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
};

/** Motivo da recusa pela regra de host, ou `null`: https, mesmo domínio registrável ou CDN da página. */
function hostProblem(u: URL, sites: readonly string[], cdnHosts: readonly string[]): string | null {
  if (u.protocol !== "https:") return `imagem sem https: ${u.href}`;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  // IP literal nunca: não tem domínio registrável (nem como CDN declarada).
  if (isIpLiteral(host)) return `imagem em endereço IP (${host})`;
  const reg = registrableDomain(host);
  if (sites.some((s) => registrableDomain(s) === reg)) return null;
  if (cdnHosts.includes(host)) return null;
  return `imagem fora do domínio da página (${host})`;
}

/** Ativo conhecido que não pode ser usado (bloqueado ou vencido). */
const unusable = (a: MediaAssetRecord): boolean =>
  a.status === "blocked" || (a.rightsStatus !== undefined && !isReusable(a.rightsStatus));

/**
 * Registra a imagem de divulgação do evento: flag ligada; só `https`; mesmo domínio registrável da
 * página (ou da página que trouxe a imagem) ou CDN referenciada nela, inclusive a URL final depois
 * dos redirecionamentos; `robots.txt`; raster com pelo menos 400 px de largura. Mesma origem ou
 * mesmo arquivo (sha256) reaproveitam o ativo; bloqueado ou vencido → `blocked`. `onNetwork`
 * avisa quem conta o teto: flag desligada, host recusado e origem conhecida não fazem pedido.
 */
export async function registerExternalImage(
  deps: ExternalImageDeps,
  input: ExternalImageInput,
  /** Chamado uma vez, logo antes do primeiro pedido HTTP (recusa sem rede não o chama). */
  onNetwork: () => void = () => {},
): Promise<Result<{ mediaId: string }, ExternalImageError>> {
  if (!(await deps.reproductionEnabled())) return err("flag_off");
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return err("host");
  }
  const sites = [hostOf(input.pageUrl), hostOf(input.siteUrl ?? input.pageUrl)].filter(
    (h): h is string => h !== null,
  );
  const cdn = (input.cdnHosts ?? []).map((h) => h.toLowerCase());
  if (parsed.username || parsed.password || hostProblem(parsed, sites, cdn) !== null)
    return err("host");

  const known = await deps.repo.assetByOrigin(parsed.href);
  if (known && unusable(known)) return err("blocked");
  if (known) return ok({ mediaId: known.id });

  onNetwork();
  const robots = await checkRobots(deps.crawl, parsed.href, {
    bucket: `media-ext:${parsed.hostname.toLowerCase()}`,
    limitPerHour: 60,
    ...(deps.signal ? { signal: deps.signal } : {}),
  });
  if (robots.kind === "disallowed") return err("blocked");
  if (robots.kind !== "allowed") return err("fetch");

  let hostRejected = false;
  const downloaded = await fetchImage(deps.crawl, parsed.href, {
    sourceBaseUrl: input.pageUrl,
    ...(deps.signal ? { signal: deps.signal } : {}),
    allowUrl: (u) => {
      const problem = hostProblem(u, sites, cdn);
      if (problem) hostRejected = true;
      return problem;
    },
  });
  if (!downloaded.ok) {
    if (hostRejected) return err("host");
    return err(/não é imagem raster/.test(downloaded.error) ? "type" : "fetch");
  }
  const analysis = await analyzeImage(downloaded.value.bytes);
  if (!analysis.ok) return err("type");
  if (analysis.value.width < MIN_EXTERNAL_WIDTH) return err("size");

  const same = await deps.repo.assetBySha256(analysis.value.sha256);
  if (same && unusable(same)) return err("blocked");
  if (same) return ok({ mediaId: same.id });

  const saved = await storeExternalCopy(
    { store: deps.store, insert: (a) => deps.repo.insertExternalAsset(a), now: deps.now },
    {
      imageUrl: parsed.href,
      pageUrl: input.pageUrl,
      sourceName: input.sourceName,
      bytes: downloaded.value.bytes,
      analysis: analysis.value,
      credit: reproductionCredit(input.sourceName),
      license: EXTERNAL_IMAGE_LICENSE,
      allowedUse: input.allowedUse ?? "event",
      provenanceKind: "event_image",
    },
  );
  if (!saved.ok) return saved;
  return ok({ mediaId: saved.value });
}
