import type { ReactNode } from "react";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import type { MarketingAction } from "./types";

export interface HeroProps {
  /** Id do título; a seção é rotulada por ele. */
  id: string;
  title: string;
  intro: string;
  /** Linha curta acima do título (sobretítulo), opcional. */
  eyebrow?: string;
  /** 1 quando é o título da página (padrão); 2 quando o hero abre um bloco interno. */
  level?: 1 | 2;
  /** Ação principal (link). Para botões com estado, passe `children`. */
  action?: MarketingAction;
  /** Ações próprias (por exemplo, o botão de instalar do app). */
  children?: ReactNode;
  className?: string;
}

/**
 * Bloco de abertura das páginas de marketing e institucionais (UI-T11, adaptado do hero do
 * TripleD): título, introdução e uma ação. Superfície branca com régua Tinta; sem fundo
 * decorativo. A entrada suave só acontece com `motion-safe`; o conteúdo já nasce visível.
 *
 * ```tsx
 * <Hero id="nl" title="Newsletters" intro="…" action={{ label: "Escolher", href: "#inscrever" }} />
 * ```
 */
export function Hero({
  id,
  title,
  intro,
  eyebrow,
  level = 1,
  action,
  children,
  className,
}: HeroProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section
      aria-labelledby={id}
      className={cx("border-b-2 border-line-strong pb-8 lg:pb-10", className)}
    >
      <div className="flex max-w-read flex-col gap-4 motion-safe:animate-fade-in">
        {eyebrow && <p className="type-eyebrow text-eyebrow">{eyebrow}</p>}
        <Heading id={id} className="type-display text-balance text-strong">
          {title}
        </Heading>
        <p className="type-body-read text-pretty text-body">{intro}</p>
        {(action || children) && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {action && (
              <Button href={action.href} iconRight={action.icon}>
                {action.label}
              </Button>
            )}
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
