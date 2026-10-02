// Build do service worker (PW-T3): determinístico e igual ao versionado em public/.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildSw } from "./build-sw.mjs";

const hash = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("build-sw", () => {
  it("dois builds seguidos geram o mesmo sw.js, offline.js e offline.css", async () => {
    const a = mkdtempSync(join(tmpdir(), "cn-sw-a-"));
    const b = mkdtempSync(join(tmpdir(), "cn-sw-b-"));
    dirs.push(a, b);
    const fa = await buildSw(a);
    const fb = await buildSw(b);
    expect(fa.map(hash)).toEqual(fb.map(hash));
    for (const f of fa) expect(readFileSync(f, "utf8")).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  }, 30_000);

  it("public/ está igual ao build (o CI confere com git diff)", async () => {
    const d = mkdtempSync(join(tmpdir(), "cn-sw-c-"));
    dirs.push(d);
    for (const f of await buildSw(d)) {
      const name = f.slice(f.lastIndexOf("/") + 1);
      expect(hash(f), name).toBe(hash(join("public", name)));
    }
  }, 30_000);

  it("sw.js preserva cn-salvos-v1, cache-saved e data.href; offline.js não tem inline", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain("cn-salvos-v1");
    expect(sw).toContain("cache-saved");
    expect(sw).toMatch(/href/);
    expect(sw).not.toMatch(/\beval\(|new Function\(|importScripts\(/);
  });
});
