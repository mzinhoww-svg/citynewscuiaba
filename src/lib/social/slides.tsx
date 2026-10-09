import "server-only";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement } from "react";
import satori from "satori";
import sharp from "sharp";
import { SOCIAL_AGENDA as S } from "@/content/pt-BR/social-agenda";
import { err, ok, type Result } from "@/lib/result";
import { socialFonts, type SocialFonts } from "./fonts";
import type { PackageItem } from "./items";
import { fitText, type FitOptions } from "./text-fit";

/**
 * Slides do carrossel "Agenda da semana" (ARD-T6, spec §7): JSX simples → SVG (satori) → PNG
 * 1080×1350 (resvg). Módulo de render do servidor, fora de `src/components`: as cores são as da
 * marca @citycuiabaa do Radar, fixas aqui e em nenhum outro lugar.
 */
export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const INK = "#111111";
const WHITE = "#FFFFFF";
const YELLOW = "#F2C94C";
const ORANGE = "#F58220";
const GRAY = "#969696";
/** Véu sobre a foto: o mesmo #111111 com 62% de opacidade (o texto branco fica legível). */
const VEIL = "rgba(17, 17, 17, 0.62)";

const PAD = 80;
const TEXT_WIDTH = SLIDE_WIDTH - 2 * PAD;
const CREDIT_BAR = 96;

/** Título do evento: desce de 96 a 52 px; até 5 linhas. */
export const TITLE_FIT: FitOptions = {
  maxWidth: TEXT_WIDTH,
  maxLines: 5,
  sizes: [96, 88, 80, 72, 64, 58, 52],
};
const VENUE_FIT: FitOptions = { maxWidth: TEXT_WIDTH, maxLines: 3, sizes: [44, 40, 36, 32] };
const CREDIT_FIT: FitOptions = { maxWidth: TEXT_WIDTH, maxLines: 2, sizes: [28, 26, 24, 22] };
const DAY_FIT: FitOptions = { maxWidth: TEXT_WIDTH, maxLines: 2, sizes: [44, 40, 36] };

interface Background {
  uri: string;
  width: number;
  height: number;
}

/**
 * Foto inteira dentro do slide (sem recorte: o crédito gravado na imagem nunca some), em JPEG.
 * Arquivo ilegível → `null` (fundo liso).
 */
async function background(bytes: Uint8Array): Promise<Background | null> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, fit: "inside" })
      .flatten({ background: INK })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return {
      uri: `data:image/jpeg;base64,${data.toString("base64")}`,
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

/** Linhas já quebradas pelo `fitText`, uma `div` por linha (o satori não quebra de novo). */
function Lines({
  lines,
  size,
  family,
  weight,
  color,
  leading,
}: {
  lines: string[];
  size: number;
  family: "Sans" | "Serif";
  weight: 400 | 700;
  color: string;
  leading: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            fontFamily: family,
            fontWeight: weight,
            fontSize: size,
            lineHeight: leading,
            color,
            whiteSpace: "nowrap",
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function Frame({ children, bg = INK }: { children: ReactElement | ReactElement[]; bg?: string }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        backgroundColor: bg,
      }}
    >
      {children}
    </div>
  );
}

const Bar = ({ color = ORANGE }: { color?: string }) => (
  <div style={{ display: "flex", width: 120, height: 12, backgroundColor: color }} />
);

function Cover({
  rangeLabel,
  count,
  fonts,
}: {
  rangeLabel: string;
  count: number;
  fonts: SocialFonts;
}) {
  const range = fitText(rangeLabel, fonts.sansBold.metrics, {
    maxWidth: TEXT_WIDTH,
    maxLines: 2,
    sizes: [60, 52, 44],
  });
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: PAD,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Sans",
            fontWeight: 700,
            fontSize: 32,
            color: GRAY,
          }}
        >
          {S.brand}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <Bar />
          <Lines
            lines={[...S.coverTitleLines]}
            size={150}
            family="Serif"
            weight={700}
            color={WHITE}
            leading={1.02}
          />
          <Lines
            lines={range.lines}
            size={range.size}
            family="Sans"
            weight={700}
            color={YELLOW}
            leading={1.15}
          />
          <div style={{ display: "flex", fontFamily: "Sans", fontSize: 40, color: WHITE }}>
            {S.coverKicker}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontFamily: "Sans", fontSize: 32, color: GRAY }}>
            {S.coverCount(count)}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Sans",
              fontWeight: 700,
              fontSize: 40,
              color: YELLOW,
            }}
          >
            {S.handle}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function EventSlide({
  item,
  index,
  total,
  bg,
  fonts,
}: {
  item: PackageItem;
  index: number;
  total: number;
  bg: Background | null;
  fonts: SocialFonts;
}) {
  const title = fitText(item.title, fonts.serifBold.metrics, TITLE_FIT);
  const venue = fitText(item.venue, fonts.sans.metrics, VENUE_FIT);
  const day = fitText(`${item.dayLabel} · ${item.time}`, fonts.sansBold.metrics, DAY_FIT);
  const credit =
    bg && item.image
      ? fitText(S.photoCredit(item.image.credit), fonts.sans.metrics, CREDIT_FIT)
      : null;
  const price = item.price ?? S.unknownPrice;
  return (
    <Frame>
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori desenha <img>; não é página
        <img
          src={bg.uri}
          width={bg.width}
          height={bg.height}
          alt=""
          style={{
            position: "absolute",
            left: Math.round((SLIDE_WIDTH - bg.width) / 2),
            top: Math.round((SLIDE_HEIGHT - bg.height) / 2),
          }}
        />
      ) : (
        <div style={{ display: "flex" }} />
      )}
      {bg ? (
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            top: 0,
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            backgroundColor: VEIL,
          }}
        />
      ) : (
        <div style={{ display: "flex" }} />
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT - CREDIT_BAR,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: PAD,
          paddingBottom: 48,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Sans",
              fontWeight: 700,
              fontSize: 30,
              color: YELLOW,
            }}
          >
            {S.coverTitle}
          </div>
          <div style={{ display: "flex", fontFamily: "Sans", fontSize: 30, color: WHITE }}>
            {S.slideIndex(index, total)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <Bar />
          <Lines
            lines={day.lines}
            size={day.size}
            family="Sans"
            weight={700}
            color={YELLOW}
            leading={1.2}
          />
          <Lines
            lines={title.lines}
            size={title.size}
            family="Serif"
            weight={700}
            color={WHITE}
            leading={1.08}
          />
          <Lines
            lines={venue.lines}
            size={venue.size}
            family="Sans"
            weight={400}
            color={WHITE}
            leading={1.2}
          />
          <div
            style={{
              display: "flex",
              fontFamily: "Sans",
              fontWeight: 700,
              fontSize: 44,
              color: ORANGE,
            }}
          >
            {price}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          bottom: 0,
          width: SLIDE_WIDTH,
          height: CREDIT_BAR,
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: PAD,
          paddingRight: PAD,
          backgroundColor: INK,
        }}
      >
        {credit ? (
          <Lines
            lines={credit.lines}
            size={credit.size}
            family="Sans"
            weight={400}
            color={GRAY}
            leading={1.15}
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontFamily: "Sans",
              fontWeight: 700,
              fontSize: 28,
              color: GRAY,
            }}
          >
            {S.handle}
          </div>
        )}
      </div>
    </Frame>
  );
}

function Closing() {
  const notice = fitText(S.captionClosing, socialFonts().sans.metrics, {
    maxWidth: TEXT_WIDTH,
    maxLines: 3,
    sizes: [40, 36],
  });
  return (
    <Frame bg={YELLOW}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: PAD,
        }}
      >
        <div
          style={{ display: "flex", fontFamily: "Sans", fontWeight: 700, fontSize: 32, color: INK }}
        >
          {S.brand}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <Bar color={ORANGE} />
          <div
            style={{
              display: "flex",
              fontFamily: "Serif",
              fontWeight: 700,
              fontSize: 150,
              lineHeight: 1.02,
              color: INK,
            }}
          >
            {S.closingTitle}
          </div>
          <div style={{ display: "flex", fontFamily: "Sans", fontSize: 44, color: INK }}>
            {S.closingHint}
          </div>
          <Lines
            lines={notice.lines}
            size={notice.size}
            family="Sans"
            weight={400}
            color={INK}
            leading={1.25}
          />
        </div>
        <div
          style={{ display: "flex", fontFamily: "Sans", fontWeight: 700, fontSize: 56, color: INK }}
        >
          {S.handle}
        </div>
      </div>
    </Frame>
  );
}

async function toPng(node: ReactElement, fonts: SocialFonts): Promise<Uint8Array> {
  const svg = await satori(node, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts: [fonts.sans, fonts.sansBold, fonts.serifBold].map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight,
      style: "normal" as const,
    })),
  });
  const png = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
  return new Uint8Array(png);
}

export interface SlidesInput {
  rangeLabel: string;
  items: readonly PackageItem[];
  /** Bytes da foto de cada evento (por `eventId`), lidos do Storage privado. */
  images: ReadonlyMap<string, Uint8Array>;
}

export interface SlidesOutput {
  /** Capa, um por evento e o final, nessa ordem. */
  pngs: Uint8Array[];
  /** Eventos que saíram com a foto de fundo (os outros, com fundo liso). */
  withImage: string[];
  /** Eventos cujo título não coube nem no corpo mínimo (linhas cortadas; a legenda tem tudo). */
  clamped: string[];
}

/** Monta os PNGs. Falha de fonte ou de render → `err` com o motivo (o pacote fica `draft`). */
export async function renderSlides(input: SlidesInput): Promise<Result<SlidesOutput, string>> {
  try {
    const fonts = socialFonts();
    const withImage: string[] = [];
    const clamped: string[] = [];
    const pngs: Uint8Array[] = [];
    pngs.push(
      await toPng(
        <Cover rangeLabel={input.rangeLabel} count={input.items.length} fonts={fonts} />,
        fonts,
      ),
    );
    let i = 0;
    for (const item of input.items) {
      i += 1;
      const bytes = item.image ? input.images.get(item.eventId) : undefined;
      const bg = bytes ? await background(bytes) : null;
      if (bg) withImage.push(item.eventId);
      if (fitText(item.title, fonts.serifBold.metrics, TITLE_FIT).clamped)
        clamped.push(item.eventId);
      pngs.push(
        await toPng(
          <EventSlide item={item} index={i} total={input.items.length} bg={bg} fonts={fonts} />,
          fonts,
        ),
      );
    }
    pngs.push(await toPng(<Closing />, fonts));
    return ok({ pngs, withImage, clamped });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
