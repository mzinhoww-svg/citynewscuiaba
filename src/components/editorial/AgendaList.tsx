import type { CSSProperties } from "react";
import { cx } from "../cx";

export interface AgendaItem {
  when: string;
  title: string;
  place?: string;
}

export interface AgendaListProps {
  items: AgendaItem[];
  /** time = horário empilhado (lateral "Agenda de hoje") · day = linha por dia (guia do fim de semana) */
  variant?: "time" | "day";
  title?: string;
  /** Nível do título (padrão h2). */
  titleAs?: "h2" | "h3";
  /** nevoa = bloco Névoa (R1, era Papel) · none = sem fundo */
  surface?: "nevoa" | "none";
  className?: string;
  style?: CSSProperties;
}

/**
 * Lista de eventos do brand kit: "Agenda de hoje" na lateral (horário em Cerrado) ou linhas
 * de "O que fazer em Cuiabá".
 *
 * ```tsx
 * <AgendaList title="Agenda de hoje" items={[{ when: "19h", title: "Show no Sesc Arsenal", place: "Centro" }]} />
 * <AgendaList variant="day" surface="none" items={[{ when: "Sex", title: "Feira da Praça 8 de Abril" }]} />
 * ```
 * - Horários "19h" e "20h30", com números tabulares.
 */
export function AgendaList({
  items,
  variant = "time",
  title,
  titleAs: Title = "h2",
  surface = "nevoa",
  className,
  style,
}: AgendaListProps) {
  return (
    <div className={cx(surface === "nevoa" && "bg-section p-5", className)} style={style}>
      {title && (
        <Title className="border-b border-line-section pb-3 type-eyebrow text-strong">
          {title}
        </Title>
      )}
      <ul>
        {items.map((it, i) =>
          variant === "time" ? (
            <li
              key={`${it.when}-${it.title}`}
              className={cx("py-3", i < items.length - 1 && "border-b border-line-section")}
            >
              <p className="text-13 font-bold leading-tight tabular-nums text-service">{it.when}</p>
              <p className="mt-0.5 text-16 font-semibold leading-snug text-strong">{it.title}</p>
              {it.place && <p className="mt-0.5 type-meta text-meta">{it.place}</p>}
            </li>
          ) : (
            <li
              key={`${it.when}-${it.title}`}
              className="grid grid-cols-[var(--sp-64)_1fr] items-baseline border-t border-line-section py-3.5"
            >
              <span className="text-13 font-bold uppercase leading-none text-strong">
                {it.when}
              </span>
              <span className="text-16 leading-snug text-strong">
                {it.title}
                {it.place ? ` · ${it.place}` : ""}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
