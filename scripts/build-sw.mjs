// Empacota o service worker e a página "Sem conexão" (spec 2026-09-28 D-P10, G13, G14):
//   src/sw/index.ts           → public/sw.js
//   src/offline-page/index.ts → public/offline.js
//   tokens.css + offline.css  → public/offline.css
// Saída determinística (sem data, sem hash): o CI roda `pnpm sw:build && git diff --exit-code`.
// Uso: node scripts/build-sw.mjs [--out <pasta>]  (a pasta serve ao teste de determinismo)
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : join(root, "public");

const BANNER = "/* CityNews · gerado por scripts/build-sw.mjs a partir de src/sw e src/offline-page. Não edite. */";

const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: false,
  legalComments: "none",
  sourcemap: false,
  logLevel: "silent",
  tsconfig: join(root, "src/sw/tsconfig.json"),
  banner: { js: BANNER },
  define: { "process.env.NODE_ENV": '"production"' },
};

export async function buildSw(dir = outDir) {
  await mkdir(dir, { recursive: true });
  await build({ ...common, entryPoints: [join(root, "src/sw/index.ts")], outfile: join(dir, "sw.js") });
  await build({ ...common, entryPoints: [join(root, "src/offline-page/index.ts")], outfile: join(dir, "offline.js") });
  const tokens = await readFile(join(root, "src/styles/tokens.css"), "utf8");
  const page = await readFile(join(root, "src/offline-page/offline.css"), "utf8");
  await writeFile(join(dir, "offline.css"), `${BANNER}\n${tokens.trimEnd()}\n\n${page}`);
  return ["sw.js", "offline.js", "offline.css"].map((f) => join(dir, f));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSw().then(
    (files) => console.log(files.map((f) => f.replace(`${root}/`, "")).join("\n")),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
