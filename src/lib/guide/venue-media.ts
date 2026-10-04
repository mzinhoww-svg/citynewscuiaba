import { analyzeImage } from "@/lib/media/analyze";
import { checkImage, DUPLICATE_MAX_DISTANCE } from "@/lib/media/checks";
import { fetchImage, outsideSourceDomain, sourceDomain } from "@/lib/media/fetch-image";
import type { MediaStore } from "@/lib/media/store";
import { mediaPath } from "@/lib/media/store";
import { takedownReproduction, type TakedownDeps } from "@/lib/media/takedown";
import type { ImageAnalysis } from "@/lib/media/types";
import { checkRobots, type CrawlDeps } from "@/lib/pipeline/http";
import type { MediaRepo } from "@/lib/pipeline/ports";
import { err, ok, type Result } from "@/lib/result";
import type { SiteError, SiteFacts } from "./providers/site";
import { guideTags } from "./tags";
import type { Venue } from "./types";

/**
 * Foto OFICIAL do lugar (spec G3, GUIA-T3): só a imagem que o próprio site do lugar publica, pela
 * política `reproduction`: crédito "Reprodução web · {nome}", link da página de origem, cópia sem
 * recorte, retirada em 24 h a pedido (mesmo `takedownReproduction` das matérias). Imagem de
 * terceiro (Google, TripAdvisor, qualquer outro domínio) nunca entra: sem foto oficial vale o
 * cartão tipográfico. Mesmas verificações das matérias: `robots.txt`, domínio, 600 px, duplicata.
 */

export const VENUE_PHOTO_LICENSE =
  "Reprodução da imagem oficial do lugar (política reproduction, A-010): rótulo Reprodução web, crédito e link obrigatórios, sem recorte, remoção em 24 h a pedido.";

export type PhotoError = "none" | "blocked" | "low_res";

export interface VenuePhotoCandidate {
  /** Arquivo da imagem no site do lugar. */
  imageUrl: string;
  /** Página do site de onde a imagem foi lida (link do crédito). */
  pageUrl: string;
  bytes: Uint8Array;
  analysis: ImageAnalysis;
  /** "Foto: reprodução web · {nome}". */
  credit: string;
  /** Ativo já guardado para esta origem (nada a copiar de novo). */
  existingAssetId: string | null;
}

export interface NewVenueAsset {
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

export interface VenueMediaRepo extends Pick<MediaRepo, "assetByOrigin" | "phashNeighbors"> {
  insertVenueAsset(a: NewVenueAsset): Promise<string>;
  linkVenueMedia(l: {
    venueId: string;
    mediaId: string;
    credit: string;
    originUrl: string;
    position: number;
  }): Promise<void>;
}

export interface VenueMediaDeps {
  crawl: CrawlDeps;
  /** Fatos do site oficial (a imagem de destaque vem daqui). */
  site: (website: string) => Promise<Result<SiteFacts, SiteError>>;
  repo: VenueMediaRepo;
  store: MediaStore;
  /** Flag `image_reproduction_enabled`: desligada, nenhuma foto de terceiro entra. */
  reproductionEnabled: () => Promise<boolean>;
  now: () => Date;
}

/** Texto do crédito: "Foto: reprodução web · {nome do lugar}" (D-02). */
export { guideTags };

export const photoCredit = (name: string) => `Foto: reprodução web · ${name}`;

export async function officialPhotoFor(
  v: Pick<Venue, "name" | "website">,
  deps: VenueMediaDeps,
): Promise<Result<VenuePhotoCandidate, PhotoError>> {
  if (!v.website) return err("none");
  if (!(await deps.reproductionEnabled())) return err("blocked");
  const domain = sourceDomain(v.website);
  if (!domain) return err("none");

  const facts = await deps.site(v.website);
  if (!facts.ok) return err(facts.error === "robots" ? "blocked" : "none");
  const imageUrl = facts.value.imageUrl;
  if (!imageUrl) return err("none");

  // Só do domínio do próprio lugar (ou subdomínio, ou CDN do mesmo domínio registrável).
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return err("none");
  }
  if (outsideSourceDomain(parsed, domain) !== null) return err("none");

  // `robots.txt` também vale para o arquivo da imagem.
  const robots = await checkRobots(deps.crawl, imageUrl, {
    bucket: `guide-site:${parsed.hostname.toLowerCase()}`,
    limitPerHour: 20,
  });
  if (robots.kind === "disallowed") return err("blocked");
  if (robots.kind !== "allowed") return err("none");

  // Retirada a pedido: a origem removida nunca volta a ser copiada.
  const known = await deps.repo.assetByOrigin(imageUrl);
  if (known?.status === "blocked") return err("blocked");

  const credit = photoCredit(v.name);
  const downloaded = await fetchImage(deps.crawl, imageUrl, { sourceBaseUrl: v.website });
  if (!downloaded.ok) return err("none");
  const analysis = await analyzeImage(downloaded.value.bytes);
  if (!analysis.ok) return err("none");

  const neighbors = await deps.repo.phashNeighbors(
    analysis.value.phash,
    DUPLICATE_MAX_DISTANCE,
    imageUrl,
  );
  const verdict = checkImage(
    {
      width: analysis.value.width,
      height: analysis.value.height,
      phashDistances: neighbors,
      watermark: false,
    },
    "reproduction",
  );
  if (verdict.issues.includes("low_res")) return err("low_res");
  if (!verdict.ok) return err("none");

  return ok({
    imageUrl,
    pageUrl: facts.value.pageUrl,
    bytes: downloaded.value.bytes,
    analysis: analysis.value,
    credit,
    existingAssetId: known?.id ?? null,
  });
}

/** Copia a foto para o Storage, cria o ativo e liga ao lugar. */
export async function savePhoto(
  v: Pick<Venue, "id" | "name">,
  c: VenuePhotoCandidate,
  deps: Pick<VenueMediaDeps, "repo" | "store" | "now">,
  position = 0,
): Promise<Result<string, "storage">> {
  let mediaId = c.existingAssetId;
  if (!mediaId) {
    const path = mediaPath("reproduction", c.analysis.sha256, c.analysis.format);
    const put = await deps.store.put(path, c.bytes, c.analysis.contentType);
    if (!put.ok) return err("storage");
    mediaId = await deps.repo.insertVenueAsset({
      storagePath: put.value.path,
      originUrl: c.imageUrl,
      pageUrl: c.pageUrl,
      sourceName: v.name,
      license: VENUE_PHOTO_LICENSE,
      credit: c.credit,
      allowedUse: `venue:${v.id}`,
      width: c.analysis.width,
      height: c.analysis.height,
      phash: c.analysis.phash,
      sha256: c.analysis.sha256,
      contentType: c.analysis.contentType,
      provenance: {
        policy: "reproduction",
        kind: "venue_official_photo",
        imageUrl: c.imageUrl,
        pageUrl: c.pageUrl,
        fetchedAt: deps.now().toISOString(),
        bytes: c.analysis.bytes,
        sha256: c.analysis.sha256,
        unmodified: true,
      },
    });
  }
  await deps.repo.linkVenueMedia({
    venueId: v.id,
    mediaId,
    credit: c.credit,
    originUrl: c.imageUrl,
    position,
  });
  return ok(mediaId);
}

export type AttachResult =
  | { status: "attached"; mediaId: string }
  | { status: "typographic"; reason: PhotoError | "storage" };

/** Procura a foto oficial e, achando, guarda. Sem foto, o lugar fica com o cartão tipográfico. */
export async function attachOfficialPhoto(
  v: Pick<Venue, "id" | "name" | "website">,
  deps: VenueMediaDeps,
): Promise<AttachResult> {
  const found = await officialPhotoFor(v, deps);
  if (!found.ok) return { status: "typographic", reason: found.error };
  const saved = await savePhoto(v, found.value, deps);
  if (!saved.ok) return { status: "typographic", reason: saved.error };
  return { status: "attached", mediaId: saved.value };
}

export interface VenuesOfMedia {
  venuesOfMedia(
    mediaId: string,
  ): Promise<{ venueId: string; venueSlug: string; listSlugs: string[] }[]>;
}

/**
 * Retirada a pedido (24 h): bloqueia a foto como em qualquer reprodução (sai do ar na hora, a
 * cópia é apagada e a origem nunca volta a ser copiada) e invalida o lugar e todas as listas que o
 * citam, que passam a mostrar o cartão tipográfico.
 */
export async function takedownVenuePhoto(
  deps: TakedownDeps & VenuesOfMedia,
  mediaId: string,
  actor: string,
  reason: string,
): Promise<
  Result<{ blocked: number; venues: string[]; lists: string[] }, "reason_required" | "not_found">
> {
  const affected = await deps.venuesOfMedia(mediaId);
  const r = await takedownReproduction(deps, { mediaId }, actor, reason);
  if (!r.ok) return r;
  const lists = [...new Set(affected.flatMap((a) => a.listSlugs))];
  const venues = affected.map((a) => a.venueSlug);
  await deps.revalidate([
    guideTags.index,
    ...venues.map(guideTags.venue),
    ...lists.map(guideTags.list),
  ]);
  return ok({ blocked: r.value.blocked, venues, lists });
}
