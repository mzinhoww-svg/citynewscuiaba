import Link from "next/link";
import { cx } from "../cx";

export interface SourceAvatarProps {
  name: string;
  /** Logotipo licenciado; sem ele, monograma de 2 letras. */
  image?: string;
  initials?: string;
  /** Código curto da fonte (monograma de 2 letras); sinônimo de `initials`. */
  code?: string;
  /** 40 (listas), 56 (grade), 64 (fileira mobile), 72 (fileira desktop), "rail" (64 → 72 no desktop). */
  size?: 40 | 56 | 64 | 72 | "rail";
  href?: string;
  onClick?: () => void;
  /** Só o círculo, escondido de leitores de tela (o nome já está ao lado, em cards e linhas). */
  decorative?: boolean;
  className?: string;
}

const SIZE = {
  40: { box: "size-10", text: "text-14", width: "w-14" },
  56: { box: "size-14", text: "text-16", width: "w-18" },
  64: { box: "size-16", text: "text-18", width: "w-20" },
  72: { box: "size-18", text: "text-20", width: "w-22" },
  rail: { box: "size-16 lg:size-18", text: "text-18 lg:text-20", width: "w-20 lg:w-22" },
} as const;

const AVATAR_BG = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
] as const;

/** Cor estável por nome (todas ≥ 4,5:1 com branco, DESIGN.md §6). */
function avatarBg(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length] ?? "bg-avatar-1";
}

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁ-Ú]/.test(w))
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/**
 * Avatar redondo + legenda para fileiras de colunistas e fontes ("Mais acessadas em Cuiabá").
 *
 * ```tsx
 * <SourceAvatar name="Ana Lima" href="/autores/ana-lima" />
 * <SourceAvatar name="Guia CityNews" image={logo} size={72} href="/fontes/guia" />
 * ```
 * - Sem logotipo licenciado: monograma de 2 letras sobre `--cn-avatar-1..6`.
 * - Nome em até 2 linhas. É link (ou botão) com o nome da fonte como nome acessível; sem ação,
 *   vira imagem com o nome (`code` define o monograma: `<SourceAvatar name="Folha do Cerrado" code="FC" />`).
 */
export function SourceAvatar({
  name,
  image,
  initials,
  code,
  size = 56,
  href,
  onClick,
  decorative = false,
  className,
}: SourceAvatarProps) {
  const s = SIZE[size];
  const circle = (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center rounded-pill bg-cover bg-center font-bold text-branco",
        s.box,
        s.text,
        !image && avatarBg(name),
        decorative && className,
      )}
      style={image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined}
    >
      {!image && (code ?? initials ?? monogram(name))}
    </span>
  );
  if (decorative) return circle;
  const classes = cx(
    "flex shrink-0 flex-col items-center gap-2 rounded-md text-center no-underline",
    s.width,
    (href || onClick) && "cursor-pointer",
    className,
  );
  const content = (
    <>
      {circle}
      <span className="line-clamp-2 text-13 font-medium leading-snug text-strong">{name}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  // Sem ação: figura com o nome da fonte como nome acessível (o monograma é só visual).
  return (
    <div role="img" aria-label={name} className={classes}>
      {content}
    </div>
  );
}
