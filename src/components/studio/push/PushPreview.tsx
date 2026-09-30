import { NEW_PUSH_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { withOriginLabel } from "@/lib/push/text";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface PushPreviewProps {
  title: string;
  body: string;
  /** Rótulo de origem da matéria (D-P18), vai na frente do texto. */
  originLabel: string;
  className?: string;
}

/**
 * Prévia do aviso em Android, iPhone e computador (spec §10.2): desenho próprio em HTML com os
 * tokens, nunca captura do sistema. É texto de verdade (acessível), com o corte aproximado de
 * cada plataforma feito por `line-clamp`.
 */
export function PushPreview({ title, body, originLabel, className }: PushPreviewProps) {
  const text = withOriginLabel(originLabel, body);
  const boxes: { key: keyof typeof T.previewOf; titleLines: string; bodyLines: string }[] = [
    { key: "android", titleLines: "line-clamp-1", bodyLines: "line-clamp-2" },
    { key: "iphone", titleLines: "line-clamp-1", bodyLines: "line-clamp-4" },
    { key: "desktop", titleLines: "line-clamp-1", bodyLines: "line-clamp-3" },
  ];
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="grid gap-3 sm:grid-cols-3">
        {boxes.map((b) => (
          <figure
            key={b.key}
            aria-label={T.previewOf[b.key]}
            className={cx(
              "flex flex-col gap-2 rounded-xl border border-line-section p-3",
              b.key === "iphone" ? "bg-nevoa-2" : "bg-card-white",
            )}
          >
            <figcaption className="type-eyebrow text-meta">{T.previewOf[b.key]}</figcaption>
            <div className="flex items-center gap-2 type-meta text-meta">
              <span className="inline-flex size-5 items-center justify-center rounded-xs bg-tinta text-on-inverse">
                <Icon name="bell" size={14} />
              </span>
              <span className="truncate">{T.previewApp}</span>
              <span aria-hidden="true">·</span>
              <span>{T.previewNow}</span>
            </div>
            <p className={cx("type-body font-semibold text-strong", b.titleLines)}>
              {title || " "}
            </p>
            <p className={cx("type-meta text-body", b.bodyLines)}>{text}</p>
          </figure>
        ))}
      </div>
      <p className="type-meta text-meta">{T.previewNote}</p>
    </div>
  );
}
