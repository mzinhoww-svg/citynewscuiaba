"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A rota é uma das listadas ou fica abaixo dela (`/perfil` cobre `/perfil/excluir`). */
export function hiddenOn(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Some com o conteúdo em rotas onde ele só atrapalha (ex.: o letreiro "Última hora" nas telas
 * de conta). O conteúdo vem pronto do servidor; aqui só se decide se aparece.
 */
export function HideOnRoutes({
  prefixes,
  children,
}: {
  prefixes: readonly string[];
  children: ReactNode;
}) {
  const path = usePathname() ?? "";
  return hiddenOn(path, prefixes) ? null : <>{children}</>;
}
