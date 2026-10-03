import { Fragment } from "react";
import { ARTICLE } from "@/content/pt-BR/portal-article";

export interface CreditLineProps {
  /** Texto simples ("Com informações de A e B"), usado quando não há links. */
  text: string;
  sources: { name: string; url: string }[];
}

/**
 * Linha final da matéria: "Com informações de {fonte}", cada fonte com link para o original em
 * nova aba. Sem links (corpo editado à mão), mostra o texto simples.
 *
 * ```tsx
 * <CreditLine text="Com informações de MT Agora" sources={[{ name: "MT Agora", url }]} />
 * ```
 */
export function CreditLine({ text, sources }: CreditLineProps) {
  const links = sources.filter((s) => /^https?:\/\//i.test(s.url));
  if (links.length === 0) return <p className="type-meta text-meta">{text}</p>;
  return (
    <p className="type-meta text-meta">
      {ARTICLE.creditPrefix}{" "}
      {links.map((s, i) => (
        <Fragment key={s.url}>
          {i > 0 && (i === links.length - 1 ? " e " : ", ")}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-link underline underline-offset-4 hover:text-strong"
          >
            {s.name}
          </a>
        </Fragment>
      ))}
    </p>
  );
}
