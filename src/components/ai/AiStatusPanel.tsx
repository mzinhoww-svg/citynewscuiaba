import type { ReactNode } from "react";
import { useId } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface AiStatusPanelProps {
  /** processing = passos em andamento · insufficient = recusa sem fontes · error = falha ou limite. */
  tone: "processing" | "insufficient" | "error";
  title: string;
  /** Passos visíveis enquanto a resposta é preparada. */
  steps?: readonly string[];
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const ICON: Record<AiStatusPanelProps["tone"], IconName> = {
  processing: "refresh-cw",
  insufficient: "circle-help",
  error: "circle-alert",
};

/**
 * Estado da busca com IA fora da resposta (P13): processando (passos), sem fontes suficientes
 * (`insufficient`) e falha, limite ou indisponível (`error`). Ícone, título e texto: nada
 * depende só de cor.
 *
 * ```tsx
 * <AiStatusPanel tone="insufficient" title="Não encontramos fontes para responder" />
 * ```
 */
export function AiStatusPanel({
  tone,
  title,
  steps,
  children,
  actions,
  className,
}: AiStatusPanelProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      aria-busy={tone === "processing" || undefined}
      data-tone={tone}
      className={cx(
        "flex flex-col gap-3 border-l-2 px-5 py-4",
        tone === "error" ? "border-danger bg-erro-soft" : "border-ai bg-ia-soft",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          name={ICON[tone]}
          size={20}
          className={cx(
            "mt-0.5 shrink-0",
            tone === "error" ? "text-danger" : "text-ai",
            tone === "processing" && "motion-safe:animate-spin",
          )}
        />
        <h2 id={id} className="type-section text-strong">
          {title}
        </h2>
      </div>
      {steps && (
        <ol className="flex flex-col gap-1.5 pl-7 type-body text-body">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span aria-hidden="true" className="type-meta text-meta tabular-nums">
                {i + 1}.
              </span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {children && (
        <div className="flex max-w-read flex-col gap-2 pl-7 type-body text-body">{children}</div>
      )}
      {actions && <div className="flex flex-wrap gap-2 pl-7">{actions}</div>}
    </section>
  );
}
