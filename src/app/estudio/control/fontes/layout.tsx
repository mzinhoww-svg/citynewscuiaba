import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

/*
 * Painel de fontes (O03 e O04): só para `source.manage` (administração, editor-chefe e operador de IA).
 * Sem sessão vai para entrar; sem papel, para entrar com o motivo "sem-permissao". Aprovar mudança
 * crítica é outra permissão (`source.approve_critical`), conferida nas ações e no banco.
 */
export const dynamic = "force-dynamic";

export default async function SourcesLayout({ children }: { children: ReactNode }) {
  await requireRole("source.manage", undefined, { next: "/estudio/control/fontes" });
  return children;
}
