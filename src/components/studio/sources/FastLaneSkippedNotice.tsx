import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface FastLaneSkippedNoticeProps {
  /** Nomes das fontes rápidas puladas por `fast_lane_full` nos últimos 30 min. */
  names: string[];
  className?: string;
}

const joinNames = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

/**
 * Aviso de fontes rápidas puladas por falta de vaga (spec §8, cabeçalho O03). Nunca depende só de
 * cor: ícone decorativo + texto, com um link para abrir as Configurações da coleta.
 *
 * ```tsx
 * <FastLaneSkippedNotice names={["MT Agora", "Folha do Cerrado"]} />
 * ```
 */
export function FastLaneSkippedNotice({ names, className }: FastLaneSkippedNoticeProps) {
  if (names.length === 0) return null;
  const title =
    names.length === 1
      ? T.fastLaneSkipped.titleOne(names[0]!)
      : T.fastLaneSkipped.title(joinNames(names));
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-lg border border-atencao bg-atencao-soft px-4 py-3",
        className,
      )}
    >
      <Icon name="circle-alert" size={20} className="text-warn" />
      <p className="type-body text-strong">{title}</p>
      <a
        href="#config-coleta-trigger"
        className="ml-auto type-body font-semibold text-link underline-offset-4 hover:underline"
      >
        {T.fastLaneSkipped.settingsLink}
      </a>
    </div>
  );
}
