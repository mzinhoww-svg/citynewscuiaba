import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeAd } from "@/lib/ads/native";
import { SponsoredCard } from "./SponsoredCard";

const ad: NativeAd = {
  campaignId: "11111111-2222-4333-8444-555555555555",
  advertiser: "Padaria do Porto",
  label: "Patrocinado",
  title: "Pão quente às 6h",
  href: "/api/ads/click/11111111-2222-4333-8444-555555555555?s=cidade",
  imageUrl: "https://img.example/pao.png",
  imageAlt: "Pães na vitrine",
  sectionSlug: "cidade",
};

type IOCallback = (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void;
const observers: IOCallback[] = [];
const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

beforeEach(() => {
  sessionStorage.clear();
  observers.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IOCallback) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SponsoredCard (B-022)", () => {
  it("mostra Patrocinado em texto, o anunciante e o título como link pela rota de clique", () => {
    render(<SponsoredCard ad={ad} />);
    expect(screen.getByText("Patrocinado")).toBeVisible();
    expect(screen.getByText("Padaria do Porto")).toBeVisible();
    const link = screen.getByRole("link", { name: "Pão quente às 6h" });
    expect(link).toHaveAttribute("href", ad.href);
    expect(link.getAttribute("rel")).toContain("sponsored");
    expect(screen.getByRole("img", { name: "Pães na vitrine" })).toHaveAttribute(
      "src",
      ad.imageUrl,
    );
    // Nunca o vocabulário proibido nem plaqueta de origem.
    expect(document.body.textContent).not.toMatch(/PATROCINADO|ORIGINAL CITYNEWS|IA\b/);
  });

  it("sem imagem: só texto, sem img", () => {
    render(<SponsoredCard ad={{ ...ad, imageUrl: undefined, imageAlt: undefined }} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Patrocinado")).toBeVisible();
  });

  it("conta impressão e visualização pela rota de anúncio, uma vez por sessão", () => {
    render(<SponsoredCard ad={ad} />);
    act(() => observers[0]!([{ isIntersecting: true, intersectionRatio: 0.6 }]));
    act(() => vi.advanceTimersByTime(1000));
    const bodies = fetchMock.mock.calls.map((c) => {
      const [url, init] = c as unknown as [string, RequestInit];
      return { url, body: JSON.parse(String(init.body)) };
    });
    expect(bodies).toEqual([
      {
        url: "/api/ads/view",
        body: { placement: ad.campaignId, section: "cidade", event: "impression" },
      },
      {
        url: "/api/ads/view",
        body: { placement: ad.campaignId, section: "cidade", event: "view" },
      },
    ]);
    act(() => observers[0]!([{ isIntersecting: true, intersectionRatio: 0.6 }]));
    act(() => vi.advanceTimersByTime(1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
