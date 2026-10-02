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
 * "Principal" fica visível por vez.
 */
export function BottomNav({ active, className }: BottomNavProps) {
  return (
    <TabBar
      active={active}
      className={cx("fixed inset-x-0 bottom-0 z-sticky lg:hidden", className)}
    />
  );
}
