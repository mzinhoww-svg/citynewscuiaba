import { TOPIC } from "@/content/pt-BR/portal";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface ConvergenceBlockProps {
  agreements: string[];
  disagreements: string[];
  unconfirmed: string[];
  className?: string;
}

const GROUPS: {
  key: keyof Omit<ConvergenceBlockProps, "className">;
  title: string;
  icon: IconName;
  tone: string;
}[] = [
  { key: "agreements", title: TOPIC.agree, icon: "check", tone: "text-service" },
  { key: "disagreements", title: TOPIC.diverge, icon: "scale", tone: "text-warn" },
  { key: "unconfirmed", title: TOPIC.unconfirmed, icon: "circle-help", tone: "text-meta" },
];

/**
 * Concordam / Divergem / Ainda não confirmado (P05): fato, divergência e lacuna separados
 * (CLAUDE.md regra 5). Cada grupo tem título, ícone e texto; a cor só reforça.
 *
 * ```tsx
 * <ConvergenceBlock agreements={t.agreements} disagreements={t.disagreements} unconfirmed={t.unconfirmed} />
 * ```
 */
export function ConvergenceBlock(props: ConvergenceBlockProps) {
  return (
    <div className={cx("grid grid-cols-1 gap-6 md:grid-cols-3", props.className)}>
      {GROUPS.map((g) => {
        const items = props[g.key];
        return (
          <section
            key={g.key}
            aria-labelledby={`conv-${g.key}`}
            className="flex flex-col gap-3 border-t-2 border-line-strong pt-4"
          >
            <h2 id={`conv-${g.key}`} className="flex items-center gap-2 type-section text-strong">
              <Icon name={g.icon} size={20} className={g.tone} />
              {g.title}
            </h2>
            {items.length === 0 ? (
              <p className="type-body text-meta">{TOPIC.nothing}</p>
            ) : (
              <ul className="flex list-disc flex-col gap-2 pl-5 type-body text-body">
                {items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
