import { ADS_ADMIN_TEXT, SLOT_NAME } from "@/content/pt-BR/ads-admin";
import type { SlotOccupancy } from "@/lib/ads/report";
import { SLOT_FORMATS } from "@/lib/ads/slots";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { InlineAlert } from "../../ui/InlineAlert";

const T = ADS_ADMIN_TEXT.occupancy;
const STATE_TEXT = { paid: T.paid, house: T.house, empty: T.empty } as const;

/**
 * Ocupação dos 7 campos de imagem (ADS-T4): com anunciante, só peças da casa ou vazio, com o
 * aviso das veiculações pagas que terminam em até 3 dias. O estado vai em texto, nunca só na cor.
 */
export function AdOccupancyPanel({
  occupancy,
  enabled,
}: {
  occupancy: readonly SlotOccupancy[];
  enabled: boolean;
}) {
  return (
    <section aria-labelledby="ads-occ" className="flex flex-col gap-4">
      <h2 id="ads-occ" className="type-section text-strong">
        {T.title}
      </h2>
      <p className="max-w-read type-body text-meta">{T.intro}</p>
      {!enabled && <InlineAlert tone="warn">{T.off}</InlineAlert>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {occupancy.map((o) => (
          <li
            key={o.slot}
            className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <p className="type-meta text-meta">{o.slot}</p>
            <h3 className="type-headline-sm text-strong">{SLOT_NAME[o.slot]}</h3>
            <p className="type-meta text-meta">
              {SLOT_FORMATS[o.slot].map((f) => `${f.width}×${f.height}`).join(" · ")}
            </p>
            <p
              className={cx(
                "inline-flex items-center gap-2 type-body font-semibold",
                o.state === "empty" ? "text-danger" : "text-strong",
              )}
            >
              <Icon
                name={o.state === "empty" ? "circle-alert" : "check"}
                size={20}
                className="shrink-0"
              />
              {STATE_TEXT[o.state]}
            </p>
            <p className="type-meta text-body">{T.counts(o.paid, o.house)}</p>
            {o.endingSoon > 0 && (
              <p className="type-meta text-strong">{T.endingSoon(o.endingSoon)}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
