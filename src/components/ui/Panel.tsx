import type { ReactNode } from "react";
import { cx } from "../cx";

export interface PanelProps {
  /** Tag do contêiner (padrão `section`). Com `aria-labelledby`, `section` vira região nomeada. */
  as?: "section" | "div" | "article";
  /** `white` = Card branco; `section` = fundo de seção. */
  tone?: "white" | "section";
  /** Respiro interno: sm = p-3, md = p-4, lg = p-6. */
  pad?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
  "aria-labelledby"?: string;
}

const TONE = { white: "bg-card-white", section: "bg-section" } as const;
const PAD = { sm: "p-3", md: "p-4", lg: "p-6" } as const;

/**
 * Painel do Estúdio e das telas de serviço (item 30, D-06): substitui a string
 * `rounded-lg border border-line-subtle bg-card-white p-4` repetida nas telas. Não aninhe painéis.
 *
 * ```tsx
 * <Panel aria-labelledby="custos-titulo">
 *   <h2 id="custos-titulo" className="type-section text-strong">Custos</h2>
 * </Panel>
 * ```
 */
export function Panel({
  as: Tag = "section",
  tone = "white",
  pad = "md",
  children,
  className,
  "aria-labelledby": labelledBy,
}: PanelProps) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cx(
        "min-w-0 rounded-lg border border-line-subtle",
        TONE[tone],
        PAD[pad],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
