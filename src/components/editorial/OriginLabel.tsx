import type { CSSProperties } from "react";
import type { Label, LabelKind } from "@/lib/labels";
import { META_SEPARATOR } from "@/content/pt-BR/labels";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface OriginLabelProps {
  label: Label;
  /** sm em cards · md no cabeçalho da matéria e em "Como esta matéria foi feita". */
  size?: "sm" | "md";
  className?: string;
}

interface Look {
  classes: string;
  icon?: IconName | "symbol";
  dashed?: boolean;
}

/* DESIGN.md §5: forma + ícone + texto; a cor só reforça. */
const LOOK: Record<LabelKind, Look> = {
  original: { classes: "plate-edge bg-tinta text-branco", icon: "symbol" },
  normalized: { classes: "border-line-strong text-strong", icon: "layers" },
  aggregated: { classes: "border-meta text-meta", icon: "external-link" },
  ai_summary: { classes: "border-ai bg-ia-soft text-ai", dashed: true },
  auto_published: { classes: "border-ai text-ai", icon: "refresh-cw" },
  human_reviewed: { classes: "border-cerrado-soft bg-cerrado-soft text-service", icon: "check" },
  image_original: { classes: "border-meta text-meta", icon: "camera" },
  image_reproduction: { classes: "border-meta text-meta", icon: "copy" },
  image_licensed: { classes: "border-meta text-meta", icon: "file-check" },
  image_illustrative: { classes: "border-warn text-warn" },
  image_ai: { classes: "border-ai bg-ia-soft text-ai", dashed: true },
  sponsored: { classes: "border-meta text-meta" },
};

const DASHED: CSSProperties = { borderStyle: "dashed" };

/** Mini-símbolo da marca (C aberto + O Ponto) para ORIGINAL CITYNEWS. */
function MiniSymbol() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="10 10 90 80" className="h-3 w-auto shrink-0">
      <path
        d="M74.5 29.4 A32 32 0 1 0 74.5 70.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={15}
      />
      <circle cx={90} cy={50} r={9} fill="var(--cn-urucum)" />
    </svg>
  );
}

/**
 * Rótulo de origem (DESIGN.md §5): plaqueta r4 em eyebrow com forma, ícone e texto.
 * Máximo de 4 por card, na ordem de `labelsFor` (texto → IA → imagem → publicação).
 *
 * ```tsx
 * <OriginLabel label={{ kind: "ai_summary", text: "RESUMO POR IA" }} />
 * <OriginLabel label={{ kind: "aggregated", text: "AGREGADO", detail: "Folha do Cerrado" }} size="md" />
 * ```
 * - IA (resumo e imagem) usa borda tracejada; nada depende só de cor.
 * - O ícone é decorativo: o texto carrega o sentido.
 */
export function OriginLabel({ label, size = "sm", className }: OriginLabelProps) {
  const look = LOOK[label.kind];
  return (
    <span
      data-testid="origin-label"
      data-kind={label.kind}
      className={cx(
        "inline-flex max-w-full items-center gap-1 rounded-xs border border-solid type-eyebrow",
        size === "sm" ? "min-h-5.5 px-1.5 py-0.5" : "min-h-6.5 px-2 py-1",
        look.classes,
        className,
      )}
      style={look.dashed ? DASHED : undefined}
    >
      {look.icon === "symbol" ? (
        <MiniSymbol />
      ) : look.icon ? (
        <Icon name={look.icon} size={14} className="shrink-0" />
      ) : null}
      <span className="min-w-0 truncate">
        <span>{label.text}</span>
        {label.detail && (
          <span>
            {META_SEPARATOR}
            {label.detail}
          </span>
        )}
      </span>
    </span>
  );
}
