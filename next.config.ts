import type { NextConfig } from "next";
import { SECURITY_HEADERS, STATIC_ASSET_HEADERS } from "./src/lib/security/headers";

/** Origem do Supabase (URL assinada do bucket privado `media`, ADR-009). */
function supabaseStoragePattern(): {
  protocol: "https" | "http";
  hostname: string;
  pathname: string;
}[] {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return [
      {
        protocol: u.protocol === "http:" ? "http" : "https",
        hostname: u.hostname,
        pathname: "/storage/v1/object/sign/media/**",
      },
    ];
  } catch {
    return [];
  }
}

/** Arquivos lidos do disco pelo render do pacote do Instagram (ARD-T6). */
const SOCIAL_RENDER_FILES = [
  "./src/lib/social/fonts/**/*",
  "./node_modules/.pnpm/harfbuzzjs@*/node_modules/harfbuzzjs/hb.wasm",
];

const nextConfig: NextConfig = {
  // Imagens aprovadas só pela rota própria /api/media/[id] (valida aprovação e flag de reprodução
  // e redireciona para URL assinada curta do bucket privado); nada de URL pública do bucket.
  images: {
    localPatterns: [
      { pathname: "/api/media/**", search: "" },
      // Prévia do Estúdio (qualquer estado, só com sessão da equipe).
      { pathname: "/api/estudio/midia/**", search: "" },
    ],
    remotePatterns: supabaseStoragePattern(),
  },
  // HSTS, Referrer-Policy, Permissions-Policy e afins em toda resposta; a CSP com nonce sai do
  // proxy (src/proxy.ts), porque muda a cada requisição (architecture §7).
  async headers() {
    return [
      // Tudo, menos os arquivos imutáveis do build.
      { source: "/((?!_next/static/).*)", headers: [...SECURITY_HEADERS] },
      { source: "/_next/static/:path*", headers: [...STATIC_ASSET_HEADERS] },
    ];
  },
  poweredByHeader: false,
  // Pacote do Instagram (ARD-T6): o resvg é binário nativo e o satori carrega o `hb.wasm` do
  // harfbuzzjs pelo `__dirname` (empacotados, os dois quebram), então ficam fora do bundle. As
  // fontes Liberation e o `hb.wasm` são lidos do disco em tempo de execução e vão junto só para
  // as funções que montam o pacote (o job e o "Regerar" do Estúdio).
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
  outputFileTracingIncludes: {
    "/api/jobs/social-agenda": SOCIAL_RENDER_FILES,
    "/estudio/agenda/instagram": SOCIAL_RENDER_FILES,
  },
};

export default nextConfig;
