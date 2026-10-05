"use client";

import { usePathname } from "next/navigation";
import { tabForPath } from "@/lib/nav/tab-for-path";
import { cx } from "../cx";
import { TabBar } from "../ui/TabBar";

export interface BottomNavProps {
  /** `id` do destino atual (home, explore, search, favorites, profile); sem ele, vem da rota. */
  active?: string;
  className?: string;
}

/**
 * Barra inferior fixa do portal em telas estreitas (landmark "Principal"). No desktop some e
 * a navegação principal fica no `SiteHeader`, que esconde a dele no mobile: só um landmark
 * "Principal" fica visível por vez. Sem `active`, a aba acesa vem de `tabForPath`: toda rota
 * pública acende uma (agenda e editorias → Explorar; matéria → Início; entrar → Perfil).
 */
export function BottomNav({ active, className }: BottomNavProps) {
  const pathname = usePathname();
  return (
    <TabBar
      active={active ?? tabForPath(pathname ?? "/")}
      className={cx("fixed inset-x-0 bottom-0 z-sticky lg:hidden", className)}
    />
  );
}
