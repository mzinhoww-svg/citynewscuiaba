import Link from "next/link";
import type { Label } from "@/lib/labels";
import { cx } from "../cx";
import { OriginLabel } from "../editorial/OriginLabel";
import { MediaThumb } from "./MediaThumb";

export interface MediaGridItem {
  id: string;
  href: string;
  previewSrc: string;
  credit: string;
  label: Label;
  status: string;
  risk: string;
  licenseNote: string | null;
  licenseWarn: boolean;
}

export interface MediaGridProps {
  items: MediaGridItem[];
  className?: string;
}

/**
 * Grade da biblioteca de mídia (E09): prévia, rótulo de origem da imagem, crédito, estado, risco
 * e vigência da licença. O card inteiro é um link para a aprovação (título dentro do `<a>`).
 */
export function MediaGrid({ items, className }: MediaGridProps) {
  return (
    <ul
      className={cx(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((m) => (
        <li
          key={m.id}
          className="relative flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-3 hover:border-line-control"
        >
          <MediaThumb src={m.previewSrc} alt={m.credit} />
          <OriginLabel label={m.label} />
          <Link
            href={m.href}
            className="type-body font-semibold text-strong underline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {m.credit}
          </Link>
          <p className="type-meta text-meta">
            {m.status} · {m.risk}
          </p>
          {m.licenseNote && (
            <p className={cx("type-meta", m.licenseWarn ? "font-semibold text-warn" : "text-meta")}>
              {m.licenseNote}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
