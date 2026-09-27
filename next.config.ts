import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // HSTS, Referrer-Policy, Permissions-Policy e afins em toda resposta; a CSP com nonce sai do
  // proxy (src/proxy.ts), porque muda a cada requisição (architecture §7).
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
  poweredByHeader: false,
};

export default nextConfig;
