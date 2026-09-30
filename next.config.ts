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
};

export default nextConfig;
