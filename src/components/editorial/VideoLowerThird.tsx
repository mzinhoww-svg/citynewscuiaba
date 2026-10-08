import type { CSSProperties } from "react";
import { cx } from "../cx";
import { LiveIndicator } from "./LiveIndicator";

export interface VideoLowerThirdProps {
  kicker?: string;
  headline: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Tarja de vídeo (Reels, Stories, YouTube): placa Tinta, chapéu com o ponto ao vivo e manchete
 * de uma linha.
 *
 * ```tsx
 * <VideoLowerThird headline="Chuva forte alaga trecho da Av. Miguel Sutil" />
 * ```
 */
export function VideoLowerThird({
  kicker = "Agora · CityNews Cuiabá",
  headline,
  className,
  style,
}: VideoLowerThirdProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-2.5 plate-edge rounded-xs border bg-tinta px-5 py-4.5",
        className,
      )}
      style={style}
    >
      <LiveIndicator label={kicker} inverse pulse={false} />
      <p className="text-20 font-bold leading-tight tracking-display text-branco">{headline}</p>
    </div>
  );
}
