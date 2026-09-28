import { CHECKLIST_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface ChecklistPanelItem {
  key: string;
  ok: boolean;
  label: string;
  reason?: string;
}

export interface ChecklistPanelProps {
  items: ChecklistPanelItem[];
  complete: boolean;
  className?: string;
}

/**
 * Checklist de publicação (E02/E06): cada item com ícone e texto ("ok"/"pendente") e o motivo
 * quando falta algo. Nada depende só de cor.
 */
export function ChecklistPanel({ items, complete, className }: ChecklistPanelProps) {
  const pending = items.filter((i) => !i.ok).length;
  return (
    <section
      aria-labelledby="checklist-titulo"
      className={cx("rounded-lg border border-line-subtle bg-card-white p-4", className)}
    >
      <h2 id="checklist-titulo" className="type-section text-strong">
        {T.title}
      </h2>
      <p className={cx("mt-1 type-meta", complete ? "text-service" : "text-warn")}>
        {complete ? T.complete : T.pending(pending)}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-2 type-body">
            <Icon
              name={it.ok ? "check" : "circle-alert"}
              size={20}
              className={cx("mt-0.5 shrink-0", it.ok ? "text-service" : "text-warn")}
            />
            <span className="flex flex-col">
              <span className="text-strong">
                {it.label}
                <span className="sr-only">: {it.ok ? T.ok : T.missing}</span>
              </span>
              {!it.ok && it.reason && <span className="type-meta text-meta">{it.reason}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
