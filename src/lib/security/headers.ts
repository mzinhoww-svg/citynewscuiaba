/**
 * Cabeçalhos de segurança (architecture §7). A CSP leva nonce por requisição (src/proxy.ts):
 * o Next aplica o nonce aos próprios scripts e o layout raiz o aplica ao script de tema.
 * `style-src` aceita 'unsafe-inline' porque os componentes usam atributos `style` (tokens em
 * variáveis CSS), que nonce não cobre; scripts continuam estritos.
 */
export interface CspInput {
  nonce: string;
  dev: boolean;
  /** Só em HTTPS pedimos upgrade (em localhost HTTP quebraria os recursos). */
  https: boolean;
  supabaseUrl?: string;
}

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, dev, https, supabaseUrl }: CspInput): string {
  const supa = origin(supabaseUrl);
  const extra = supa ? ` ${supa}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra}`,
    "font-src 'self'",
    `connect-src 'self'${extra}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

/** Cabeçalhos fixos para todas as respostas (next.config.ts). */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
