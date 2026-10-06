"use client";

import { CONSENT_TEXT } from "@/content/pt-BR/privacy-consent";
import type { ConsentChoice } from "@/lib/consent";
import { cx } from "../cx";
import { Toggle } from "../ui/Toggle";

export interface ConsentChoicesProps {
  value: ConsentChoice;
  onChange: (next: ConsentChoice) => void;
  className?: string;
}

const T = CONSENT_TEXT.categories;

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line-subtle py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="type-label text-strong">{title}</span>
        <span className="type-meta text-meta">{description}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * As três categorias de consentimento (spec §5.2) com interruptores: Necessários fica sempre
 * ativo; Métricas agregadas e Personalização começam como o leitor escolheu (ou desligadas).
 * Usada no painel "Escolher" do banner e nas preferências de `/privacidade`.
 */
export function ConsentChoices({ value, onChange, className }: ConsentChoicesProps) {
  return (
    <ul className={cx("flex flex-col", className)}>
      <Row title={T.necessary.title} description={T.necessary.description}>
        <span className="shrink-0 type-meta text-meta">{CONSENT_TEXT.alwaysOn}</span>
      </Row>
      <Row title={T.metrics.title} description={T.metrics.description}>
        <Toggle
          label={T.metrics.title}
          checked={value.metrics}
          onChange={(metrics) => onChange({ ...value, metrics })}
        />
      </Row>
      <Row title={T.personalization.title} description={T.personalization.description}>
        <Toggle
          label={T.personalization.title}
          checked={value.personalization}
          onChange={(personalization) => onChange({ ...value, personalization })}
        />
      </Row>
    </ul>
  );
}
