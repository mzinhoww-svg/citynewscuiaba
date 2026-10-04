import type { ReactNode } from "react";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import type { MarketingAction } from "./types";

export interface CtaProps {
  id: string;
  title: string;
  text?: string;
  /** Link de ação; o texto é o nome acessível. */
  action?: MarketingAction;
  /** Conteúdo próprio (lista de contatos, formulário), antes da ação. */
  children?: ReactNode;
  className?: string;
}

/**
 * Faixa de chamada para ação (UI-T11, adaptada do CTA do TripleD): fundo Névoa chapado, h2,
 * texto curto e uma ação. Fundo sempre liso; um único CTA principal por bloco.
 *
 * ```tsx
 * <Cta id="comercial" title="Contato comercial" action={{ label: "Escrever", href: "mailto:…" }} />
 * ```
 */
export function Cta({ id, title, text, action, children, className }: CtaProps) {
  return (
    <section
      aria-labelledby={id}
      className={cx("flex flex-col gap-4 rounded-lg bg-section p-6 lg:p-8", className)}
    >
      <div className="flex max-w-read flex-col gap-2">
        <h2 id={id} className="type-section text-strong">
          {title}
        </h2>
        {text && <p className="type-body text-pretty text-body">{text}</p>}
      </div>
      {children}
      {action && (
        <div>
          <Button href={action.href} icon={action.icon}>
            {action.label}
          </Button>
        </div>
      )}
    </section>
  );
}
