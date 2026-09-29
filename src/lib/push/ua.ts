/**
 * Família de navegador, classe de aparelho e plataforma a partir do `User-Agent` (spec §9.1,
 * §11.1). Só a família é guardada; o UA nunca é gravado.
 */
import type { BrowserFamily, DeviceClass, Platform } from "./types";

export function browserFamily(ua: string): BrowserFamily {
  const u = ua || "";
  if (/\bEdgA?\/|\bEdg\//.test(u)) return "edge";
  if (/SamsungBrowser\//.test(u)) return "samsung";
  if (/\bFirefox\/|\bFxiOS\//.test(u)) return "firefox";
  if (/\bCriOS\//.test(u) || /\bChrome\/|\bChromium\//.test(u)) return "chrome";
  if (/\bSafari\//.test(u) && /\bVersion\//.test(u)) return "safari";
  if (/\bAppleWebKit\//.test(u) && /iPhone|iPad|Macintosh/.test(u) && !/Chrome|CriOS|FxiOS/.test(u))
    return "safari";
  return "other";
}

export function deviceClass(ua: string): DeviceClass {
  const u = ua || "";
  if (/iPad|Tablet|PlayBook|Silk/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)))
    return "tablet";
  if (/Macintosh/.test(u) && /Mobile\//.test(u)) return "tablet"; // iPadOS em modo desktop
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(u)) return "mobile";
  return "desktop";
}

export function platformOf(ua: string): Platform {
  const u = ua || "";
  if (/Android/.test(u)) return "android";
  if (/iPhone|iPad|iPod/.test(u)) return "ios";
  if (/Windows/.test(u)) return "windows";
  if (/Macintosh|Mac OS X/.test(u)) return "macos";
  if (/Linux|X11|CrOS/.test(u)) return "linux";
  return "other";
}
