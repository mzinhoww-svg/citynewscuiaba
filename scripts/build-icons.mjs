// Ícones do PWA a partir do brand kit (spec 2026-09-28 §7.10; PW-T4). Nenhuma arte nova:
// o símbolo (public/brand/svg/citynews-symbol-negative.svg, versão clara) sobre `--cn-tinta`,
// com as cores lidas de src/styles/tokens.css (nunca hex neste script).
//   any 192/512        símbolo a 70% do lado
//   maskable 192/512   símbolo dentro da zona segura de 80% (símbolo a 50% do lado)
//   apple-touch-icon   180, como `any`
//   badge-72           monocromático (branco sobre transparente)
//   splash             1170x2532, 1179x2556, 1284x2778, símbolo centralizado sobre tinta
// Uso: node scripts/build-icons.mjs [--out <pasta>]
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : join(root, "public/icons");

function token(css, name) {
  const m = new RegExp(`${name}\\s*:\\s*([^;}]+)[;}]`).exec(css);
  if (!m) throw new Error(`token ${name} ausente em tokens.css`);
  return m[1].trim();
}

/** Símbolo como SVG com as cores dos tokens (o SVG do kit traz as mesmas cores em hex). */
function symbolSvg(stroke, dot) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 90 80"><path d="M74.5 29.4 A32 32 0 1 0 74.5 70.6" fill="none" stroke="${stroke}" stroke-width="15"/><circle cx="90" cy="50" r="9" fill="${dot}"/></svg>`;
}

async function symbolPng(svg, width) {
  return sharp(Buffer.from(svg)).resize({ width, fit: "inside" }).png().toBuffer();
}

async function composed(size, ratio, background, svg) {
  const w = Math.round(size * ratio);
  const glyph = await symbolPng(svg, w);
  const meta = await sharp(glyph).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: glyph, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png()
    .toBuffer();
}

async function splash(width, height, background, svg) {
  const glyphW = Math.round(Math.min(width, height) * 0.28);
  const glyph = await symbolPng(svg, glyphW);
  const meta = await sharp(glyph).metadata();
  return sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: glyph, left: Math.round((width - meta.width) / 2), top: Math.round((height - meta.height) / 2) }])
    .png()
    .toBuffer();
}

export const SPLASH_SIZES = [
  [1170, 2532],
  [1179, 2556],
  [1284, 2778],
];

export async function buildIcons(dir = outDir) {
  const css = await readFile(join(root, "src/styles/tokens.css"), "utf8");
  const tinta = token(css, "--cn-tinta");
  const branco = token(css, "--cn-branco");
  const urucum = token(css, "--cn-urucum");
  const svg = symbolSvg(branco, urucum);
  const mono = symbolSvg(branco, branco);
  await mkdir(dir, { recursive: true });
  const files = [];
  const write = async (name, buf) => {
    await writeFile(join(dir, name), buf);
    files.push(join(dir, name));
  };
  await write("icon-192.png", await composed(192, 0.7, tinta, svg));
  await write("icon-512.png", await composed(512, 0.7, tinta, svg));
  await write("maskable-192.png", await composed(192, 0.5, tinta, svg));
  await write("maskable-512.png", await composed(512, 0.5, tinta, svg));
  await write("apple-touch-icon-180.png", await composed(180, 0.7, tinta, svg));
  await write("badge-72.png", await composed(72, 0.85, { r: 0, g: 0, b: 0, alpha: 0 }, mono));
  for (const [w, h] of SPLASH_SIZES) await write(`splash-${w}x${h}.png`, await splash(w, h, tinta, svg));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildIcons().then(
    (files) => console.log(files.map((f) => f.replace(`${root}/`, "")).join("\n")),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
