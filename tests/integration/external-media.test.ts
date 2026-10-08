// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createExternalMediaRepo, insertExternalAsset } from "@/lib/db/external-media-store";
import type { NewExternalAsset } from "@/lib/media/external";

const db = createServiceClient();
const repo = createExternalMediaRepo(db);
const SHA = "e".repeat(64);
const ORIGIN = "https://imagens-ard.example/cartaz.jpg";

const asset = (i: number): NewExternalAsset => ({
  storagePath: `reproducao/ard-t2-${i}.jpg`,
  originUrl: i === 0 ? ORIGIN : `https://imagens-ard.example/c-${i}.jpg`,
  pageUrl: "https://imagens-ard.example/evento",
  sourceName: "Casa ARD (fictícia)",
  license: "teste",
  credit: "Foto: reprodução web · Casa ARD (fictícia)",
  allowedUse: "event",
  width: 1600,
  height: 900,
  phash: 1n,
  sha256: SHA,
  contentType: "image/jpeg",
  provenance: { policy: "reproduction", kind: "event_image" },
});

afterAll(async () => {
  await db.from("media_assets").delete().eq("sha256", SHA);
});

describe("createExternalMediaRepo (Media Registry da Agenda)", () => {
  it("devolve o ativo pela origem e pelo sha256, com direitos unknown", async () => {
    const id = await insertExternalAsset(db, asset(0));
    expect((await repo.assetByOrigin(ORIGIN))?.id).toBe(id);
    const bySha = await repo.assetBySha256(SHA);
    expect(bySha).toMatchObject({ id, status: "approved", rightsStatus: "unknown" });
  });

  it("linha bloqueada depois de mais de 20 linhas do mesmo arquivo ainda barra o reuso", async () => {
    for (let i = 1; i <= 21; i++) await insertExternalAsset(db, asset(i));
    const last = await insertExternalAsset(db, asset(22));
    await db.from("media_assets").update({ status: "blocked" }).eq("id", last);
    expect(await repo.assetBySha256(SHA)).toMatchObject({ id: last, status: "blocked" });
  });

  it("validade vencida também barra", async () => {
    await db.from("media_assets").update({ status: "approved" }).eq("sha256", SHA);
    await db.from("media_assets").update({ license_until: "2026-01-01" }).eq("origin_url", ORIGIN);
    expect((await repo.assetByOrigin(ORIGIN))?.rightsStatus).toBe("expired");
  });
});
