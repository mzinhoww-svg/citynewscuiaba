// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { VenueProvider } from "@/lib/guide/providers/types";
import { venue, venueRecord } from "@/lib/guide/testing";
import { err, ok } from "@/lib/result";
import { runGooglePhotoBackfill, type GooglePhotoBackfillDeps } from "./venue-google-photos";
import type { StoredVenue } from "./venue-sync";

const NOW = new Date("2026-10-08T12:00:00Z");
const photo = (n: number) => ({
  name: `places/ChIJ-teste-lugar-${n}/photos/ref${n}`,
  author: `Autor ${n}`,
  authorUri: null,
});

function stored(n: number): StoredVenue {
  return {
    ...venue({ placeIds: { google: `ChIJ-teste-lugar-${n}` }, sources: ["google", "osm"] }),
    ratingUpdatedAt: null,
    googleFetchedAt: "2026-10-01T00:00:00Z",
  };
}

function setup(over: { left?: number; details?: VenueProvider["details"]; venues?: number } = {}) {
  let made = 0;
  const venues = Array.from({ length: over.venues ?? 3 }, (_, i) => stored(i + 1));
  const details = vi.fn<VenueProvider["details"]>(
    over.details ??
      (async (id) => {
        const n = Number(id.split("-").pop());
        return ok(
          venueRecord({
            name: "Nome do Google",
            category: "restaurante",
            rating: 4.5,
            ratingCount: 900,
            ratingSource: "google",
            googlePhoto: photo(n),
            placeIds: { google: id },
            sources: ["google"],
          }),
        );
      }),
  );
  const google: VenueProvider = {
    source: "google",
    search: async () => ok([]),
    details: async (id) => {
      made += 1;
      return details(id);
    },
  };
  const save = vi.fn<GooglePhotoBackfillDeps["store"]["save"]>(async (c) => ({
    inserted: 0,
    updated: c.updates.length,
  }));
  const missingGooglePhotos = vi.fn(async (limit: number) => venues.slice(0, limit));
  const deps: GooglePhotoBackfillDeps = {
    google,
    store: { missingGooglePhotos, save },
    callsLeft: () => (over.left ?? 30) - made,
    now: () => NOW,
  };
  return { deps, save, details, missingGooglePhotos, venues };
}

describe("runGooglePhotoBackfill (A-212)", () => {
  it("busca pelo Place ID e grava a foto com os dados do Google renovados", async () => {
    const { deps, save, missingGooglePhotos, venues } = setup();
    const r = await runGooglePhotoBackfill(deps, { limit: 10 });
    expect(missingGooglePhotos).toHaveBeenCalledWith(10);
    expect(r).toEqual({ checked: 3, photos: 3, status: "ok" });
    const [changes, at] = save.mock.calls[0]!;
    expect(at).toBe(NOW);
    expect(changes.inserts).toEqual([]);
    const u = changes.updates[0]!;
    expect(u).toMatchObject({ id: venues[0]!.id, ratingChecked: false, googleChecked: true });
    expect(u.record.googlePhoto).toEqual(photo(1));
    // O que já existe (nome e categoria do Guia) não muda.
    expect(u.record.name).toBe(venues[0]!.name);
    expect(u.record.category).toBe("padaria");
  });

  it("para quando a cota do Google acaba", async () => {
    const { deps, details, save } = setup({ left: 2 });
    const r = await runGooglePhotoBackfill(deps, { limit: 10 });
    expect(details).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ checked: 2, photos: 2, status: "budget" });
    expect(save.mock.calls[0]![0].updates).toHaveLength(2);
  });

  it("sem cota não consulta o banco nem o Google", async () => {
    const { deps, details, missingGooglePhotos, save } = setup({ left: 0 });
    expect(await runGooglePhotoBackfill(deps, { limit: 10 })).toEqual({
      checked: 0,
      photos: 0,
      status: "budget",
    });
    expect(missingGooglePhotos).not.toHaveBeenCalled();
    expect(details).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("sem provedor do Google: no_key", async () => {
    const { deps } = setup();
    expect(await runGooglePhotoBackfill({ ...deps, google: null }, { limit: 10 })).toEqual({
      checked: 0,
      photos: 0,
      status: "no_key",
    });
  });

  it("recusa da chave para; erro comum pula o lugar; lugar sem foto só renova os dados", async () => {
    const recusa = setup({ details: async () => err("unauthorized") });
    expect(await runGooglePhotoBackfill(recusa.deps, { limit: 10 })).toEqual({
      checked: 1,
      photos: 0,
      status: "error:unauthorized",
    });
    expect(recusa.save).not.toHaveBeenCalled();

    let n = 0;
    const misto = setup({
      details: async (id) => {
        n += 1;
        if (n === 1) return err("http");
        if (n === 2) return ok(venueRecord({ googlePhoto: null, placeIds: { google: id } }));
        return ok(venueRecord({ googlePhoto: photo(3), placeIds: { google: id } }));
      },
    });
    const r = await runGooglePhotoBackfill(misto.deps, { limit: 10 });
    expect(r).toEqual({ checked: 3, photos: 1, status: "ok" });
    // O lugar sem foto também é gravado: os dados do Google foram renovados e ele vai para o fim
    // da fila (mais antigo primeiro), sem gastar a cota todo dia.
    expect(misto.save.mock.calls[0]![0].updates.map((u) => u.record.googlePhoto)).toEqual([
      null,
      photo(3),
    ]);
  });
});
