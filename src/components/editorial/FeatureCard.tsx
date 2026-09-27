import Link from "next/link";
import type { CSSProperties } from "react";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { CategoryTag } from "./CategoryTag";
import { Photo } from "./Photo";

export interface FeatureCardProps {
  /** Destino obrigatório: o título é o link (R7). */
  href: string;
  title: string;
  image?: string;
  imageAlt?: string;
  category?: string;
  time?: string;
  /** Largura (padrão fluida) e altura (padrão proporção 310/176). */
  width?: number | string;
  height?: number | string;
  as?: "h2" | "h3";
  className?: string;
  style?: CSSProperties;
}

/**
 * Destaque do topo do feed em carrossel horizontal (Início, "Destaques"): foto sangrada,
 * gradiente de proteção, pílula de editoria e hora no topo, manchete serifada em branco.
 *
 * ```tsx
 * <FeatureCard href="/materia/corredor" category="Cidade" time="5 h" title="Prefeitura anuncia novo corredor de ônibus na Av. Fernando Corrêa" />
 * ```
 * - Gradiente só de proteção (transparente → Tinta 88%), nunca decorativo.
 * - Sem contagem de comentários (R8).
 */
export function FeatureCard({
  href,
  title,
  image,
  imageAlt,
  category,
  time,
  width,
  height,
  as: Heading = "h3",
  className,
  style,
}: FeatureCardProps) {
  return (
    <article
      className={cx("shrink-0 [--card-radius:var(--r-lg)]", className)}
      style={{ width, height, ...style }}
    >
      <Photo
        src={image}
        alt={imageAlt}
        label=""
        radius="lg"
        ratio={height === undefined ? "310/176" : undefined}
        className="h-full w-full"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-b from-tinta/15 via-tinta/0 via-35% to-tinta/88"
        />
        {/* Contêiner do tamanho do card: base do pseudo-elemento do link (R7). */}
        <div className="absolute inset-0 flex flex-col justify-between p-3.5">
          <div className="flex items-center gap-3">
            {category && <CategoryTag variant="pill">{category}</CategoryTag>}
            {time && (
              <span className="ml-auto inline-flex items-center gap-1 text-13 font-medium text-branco">
                <Icon name="clock" size={14} />
                {time}
              </span>
            )}
          </div>
          <Heading className="line-clamp-2 font-serif text-18 font-semibold leading-snug text-branco">
            <Link href={href} className="card-link no-underline">
              {title}
            </Link>
          </Heading>
        </div>
      </Photo>
    </article>
  );
}
