import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import type { ExternalImageRepo, NewExternalAsset } from "@/lib/media/external";
import type { RightsStatus } from "@/lib/media/rights";
import type { MediaAssetRecord } from "@/lib/pipeline/ports";
import { toSigned64 } from "@/lib/pipeline/simhash";

const COLUMNS =
  "id, kind, storage_path, origin_url, status, width, height, credit, source_id, tags, rights_status, license_until, removed_at, captured_at";

interface Row {
  id: string;
  kind: MediaAssetRecord["kind"];
  storage_path: string;
  origin_url: string | null;
  status: string;
  width: number | null;
  height: number | null;
  credit: string | null;
  source_id: string | null;
  tags: string[] | null;
  rights_status: RightsStatus | null;
  license_until: string | null;
  removed_at: string | null;
}

/** Status efetivo hoje (como a visão `media_registry`): bloqueio e validade vencida vencem. */
function toRecord(r: Row, now: Date): MediaAssetRecord {
  const blocked = r.status === "blocked" || r.removed_at !== null;
  // Como `media_rights_status_for`: validade anterior a hoje (data, sem hora) está vencida.
  const expired =
    r.license_until !== null && r.license_until.slice(0, 10) < now.toISOString().slice(0, 10);
  const rightsStatus: RightsStatus | undefined = blocked
    ? "blocked"
    : expired
      ? "expired"
      : (r.rights_status ?? undefined);
  return {
    id: r.id,
    kind: r.kind,
    storagePath: r.storage_path,
    originUrl: r.origin_url,
    status: blocked ? "blocked" : r.status === "approved" ? "approved" : "pending",
    width: r.width,
    height: r.height,
    credit: r.credit,
    sourceId: r.source_id,
    tags: r.tags ?? [],
    ...(rightsStatus ? { rightsStatus } : {}),
  };
}

/** Insere um ativo de reprodução externa pela mesma função das matérias e do Guia. */
export async function insertExternalAsset(db: DbClient, a: NewExternalAsset): Promise<string> {
  const { data, error } = await db.rpc("media_insert_asset", {
    p: {
      kind: "reproduction",
      storagePath: a.storagePath,
      originUrl: a.originUrl,
      pageUrl: a.pageUrl,
      sourceId: null,
      sourceName: a.sourceName,
      author: null,
      license: a.license,
      credit: a.credit,
      allowedUse: a.allowedUse,
      width: a.width,
      height: a.height,
      phash: toSigned64(a.phash).toString(),
      sha256: a.sha256,
      contentType: a.contentType,
      risk: "medio",
      provenance: a.provenance,
    } as Json,
  });
  if (error || !data) throw new Error(`external asset: ${error?.message ?? "sem retorno"}`);
  return data;
}

/** Media Registry das imagens de terceiros da Agenda (service role). */
export function createExternalMediaRepo(
  db: DbClient,
  now: () => Date = () => new Date(),
): ExternalImageRepo {
  async function by(column: "origin_url" | "sha256", value: string) {
    const today = now().toISOString().slice(0, 10);
    // 1º: qualquer linha bloqueada ou vencida, sem teto de linhas (a retirada vence sempre).
    const barred = await db
      .from("media_assets")
      .select(COLUMNS)
      .eq(column, value)
      .or(
        `status.eq.blocked,removed_at.not.is.null,rights_status.in.(blocked,expired),license_until.lt.${today}`,
      )
      .limit(1)
      .returns<Row[]>();
    if (barred.error) throw new Error(`external media (${column}): ${barred.error.message}`);
    const hit = barred.data?.[0];
    if (hit) return toRecord(hit, now());
    // 2º: o ativo mais antigo com a mesma origem/arquivo.
    const { data, error } = await db
      .from("media_assets")
      .select(COLUMNS)
      .eq(column, value)
      .order("captured_at", { ascending: true })
      .limit(1)
      .returns<Row[]>();
    if (error) throw new Error(`external media (${column}): ${error.message}`);
    const first = data?.[0];
    return first ? toRecord(first, now()) : null;
  }
  return {
    assetByOrigin: (url) => by("origin_url", url),
    assetBySha256: (sha) => by("sha256", sha),
    insertExternalAsset: (a) => insertExternalAsset(db, a),
  };
}
