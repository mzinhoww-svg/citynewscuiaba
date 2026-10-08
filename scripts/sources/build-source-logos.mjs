/**
 * Logotipos das fontes enviados pelo dono (pacote "logos-portais-cuiaba", out/2026).
 * Lê os arquivos de `assets/source-logos/originais/` e grava em `assets/source-logos/<slug>.png`
 * o que o portal aceita (`validateLogo`, D-F25): PNG quadrado, 512 px de lado, até 200 KB.
 *
 *   - marca horizontal: aparada e centralizada no quadrado com fundo transparente (o círculo do
 *     avatar é branco e o quadrado inteiro cabe dentro dele);
 *   - O Documento: sem o selo "25 anos", que some no tamanho do avatar;
 *   - Agência Brasil: a marca oficial é verde-limão sobre azul; em fundo branco o contraste não
 *     chega a 1,5:1, então ela vai sobre um disco azul.
 *
 * Uso: `node scripts/sources/build-source-logos.mjs` (gera também `manifest.json` com o caminho
 * no bucket `source-logos`, `<id da fonte>/<hash>.png`, igual a `logoObjectPath`).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DIR = "assets/source-logos";
const SIDE = 512;
const MAX_BYTES = 200 * 1024;
const NAVY = { r: 0x0b, g: 0x2a, b: 0x4a, alpha: 1 };
const CLEAR = { r: 255, g: 255, b: 255, alpha: 0 };

/** slug e id da fonte em produção (tabela `sources`), arquivo original e tratamento. */
const LOGOS = [
  { slug: "agencia-brasil", id: "13f750a5-71fe-42db-b526-89cf063c2e1a", file: "agencia-brasil.svg", plate: true },
  { slug: "canal-rural", id: "0894833c-3b6b-4dc1-8236-b7e98bdfeacd", file: "canal-rural.png" },
  { slug: "circuito-mt", id: "592f618e-370f-481b-b833-fd1848e45082", file: "circuito-mato-grosso.png" },
  { slug: "folhamax", id: "61e93957-0953-4812-adc6-06b35ef2cb93", file: "folhamax.png" },
  { slug: "gazeta-digital", id: "4e8d4a94-2ee7-4cd3-bd57-05ca03a8f658", file: "gazeta-digital.png" },
  { slug: "hipernoticias", id: "586da643-c568-4984-bcbe-8a3ddabeefc8", file: "hipernoticias.png" },
  { slug: "leiagora", id: "b2c3d404-8dbb-4bd6-b734-012b4e031be4", file: "leiagora.jpg" },
  { slug: "o-documento", id: "0c7873f0-9238-43be-8058-1f4935a59ec9", file: "o-documento.png", keepLeft: 0.8 },
  { slug: "olhar-direto", id: "343ad011-5545-44fd-a7a8-d57da5d5d6cc", file: "olhardireto.png" },
  { slug: "prefeitura-vg", id: "b10b15bd-d3b5-4d8e-8eee-5473e097ec27", file: "prefeitura-varzea-grande.png" },
  { slug: "rdnews", id: "128c9fbc-2828-4ef6-8ef9-630eac945a60", file: "rdnews.png" },
  { slug: "so-noticias", id: "2a7b0a33-da4f-49cd-97c7-1d2c756ed06b", file: "so-noticias.png" },
];

/** Marca aparada (sem margem vazia), como PNG com transparência. */
async function trimmed(path, keepLeft) {
  let img = sharp(readFileSync(path), { density: 600 }).ensureAlpha();
  if (keepLeft) {
    const { width, height } = await img.metadata();
    img = sharp(await img.png().toBuffer()).extract({
      left: 0,
      top: 0,
      width: Math.round(width * keepLeft),
      height,
    });
  }
  const buf = await img.png().toBuffer();
  try {
    return await sharp(buf).trim({ threshold: 10 }).png().toBuffer();
  } catch {
    return buf;
  }
}

async function build({ file, plate, keepLeft }) {
  const mark = await trimmed(join(DIR, "originais", file), keepLeft);
  if (plate) {
    // Disco azul do tamanho do quadrado; a marca ocupa 86% da largura, no centro.
    const inner = await sharp(mark).resize({ width: Math.round(SIDE * 0.86) }).png().toBuffer();
    const disc = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDE}" height="${SIDE}"><circle cx="${SIDE / 2}" cy="${SIDE / 2}" r="${SIDE / 2}" fill="rgb(${NAVY.r},${NAVY.g},${NAVY.b})"/></svg>`,
    );
    return sharp(disc).composite([{ input: inner, gravity: "center" }]).png({ compressionLevel: 9 }).toBuffer();
  }
  return sharp(mark)
    .resize(SIDE, SIDE, { fit: "contain", background: CLEAR })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const manifest = [];
for (const logo of LOGOS) {
  let out = await build(logo);
  if (out.length > MAX_BYTES) {
    out = await sharp(out).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  }
  const meta = await sharp(out).metadata();
  if (meta.width !== SIDE || meta.height !== SIDE || out.length > MAX_BYTES) {
    throw new Error(`${logo.slug}: ${meta.width}x${meta.height}, ${out.length} bytes`);
  }
  writeFileSync(join(DIR, `${logo.slug}.png`), out);
  const hash = createHash("sha256").update(out).digest("hex").slice(0, 16);
  manifest.push({ slug: logo.slug, id: logo.id, original: logo.file, path: `${logo.id}/${hash}.png`, bytes: out.length });
  console.log(`${logo.slug.padEnd(16)} ${String(out.length).padStart(7)} B  ${logo.id}/${hash}.png`);
}
writeFileSync(join(DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
