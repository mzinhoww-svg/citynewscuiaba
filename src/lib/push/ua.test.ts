import { describe, expect, it } from "vitest";
import { browserFamily, deviceClass, platformOf } from "./ua";

export const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";
export const SAMSUNG_UA =
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
export const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
export const CRIOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1";
export const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
export const FIREFOX_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";
export const MAC_SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
export const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("ua", () => {
  it("família do navegador", () => {
    expect(browserFamily(EDGE_UA)).toBe("edge");
    expect(browserFamily(SAMSUNG_UA)).toBe("samsung");
    expect(browserFamily(IOS_SAFARI_UA)).toBe("safari");
    expect(browserFamily(MAC_SAFARI_UA)).toBe("safari");
    expect(browserFamily(CRIOS_UA)).toBe("chrome");
    expect(browserFamily(ANDROID_CHROME_UA)).toBe("chrome");
    expect(browserFamily(FIREFOX_UA)).toBe("firefox");
    expect(browserFamily("curl/8")).toBe("other");
    expect(browserFamily("")).toBe("other");
  });
  it("classe de aparelho e plataforma", () => {
    expect(deviceClass(IOS_SAFARI_UA)).toBe("mobile");
    expect(deviceClass(ANDROID_CHROME_UA)).toBe("mobile");
    expect(deviceClass(IPAD_UA)).toBe("tablet");
    expect(deviceClass(EDGE_UA)).toBe("desktop");
    expect(platformOf(IOS_SAFARI_UA)).toBe("ios");
    expect(platformOf(ANDROID_CHROME_UA)).toBe("android");
    expect(platformOf(EDGE_UA)).toBe("windows");
    expect(platformOf(MAC_SAFARI_UA)).toBe("macos");
    expect(platformOf(FIREFOX_UA)).toBe("linux");
    expect(platformOf("")).toBe("other");
  });
});
