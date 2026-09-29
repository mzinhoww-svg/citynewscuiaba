import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

/* Sessão e papel por requisição: nunca pré-renderizar nem cachear o painel de fontes. */
export const dynamic = "force-dynamic";

/**
 * Guarda do painel de fontes (spec D-F1/D-F2, critério 1): só `source.manage` (admin, editor-chefe,
 * operador de IA). Sem sessão → `/entrar?next=/estudio/control/fontes`; sem permissão → com
 * `motivo=sem-permissao`. Cada Server Action repete a checagem (defesa em profundidade).
 */
export default async function SourcesPanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireRole("source.manage", undefined, { next: "/estudio/control/fontes" });
  return children;
}
