import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdPlacement } from "@/lib/ads/select";
import { AdSlotClient } from "./AdSlotClient";

const place = (id: string, w: number, h: number): AdPlacement => ({
  id,
  slot: "TOP",
  creative: {
    kind: "display",
    slot: "TOP",
    width: w,
    height: h,
    imageUrl: `https://img.example/${id}.png`,
    alt: `Peça ${id}`,
    href: "https://padaria.example",
    weight: 1,
  },
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  allowedSections: [],
  weight: 1,
  maxImpressionsPerDay: null,
  impressionsToday: 0,
  isHouse: false,
});

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

const sent = () =>
  fetchMock.mock.calls.map(
    (c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).event,
  );

describe("AdSlotClient (ADS-T1)", () => {
  it("mostra o rótulo Publicidade e o link patrocinado com alt, pela rota de clique", () => {
    render(<AdSlotClient code="TOP" sectionSlug="cidade" candidates={[place("d", 970, 250)]} />);
    expect(screen.getAllByText("Publicidade").length).toBeGreaterThan(0);
    const img = screen.getByAltText("Peça d");
    const link = img.closest("a")!;
    expect(link.getAttribute("href")).toBe("/api/ads/click/d?s=cidade");
    expect(link.getAttribute("rel")).toBe("sponsored noopener");
  });

  it("reserva a altura de cada formato (desktop e celular) antes da peça", () => {
    const { container } = render(
      <AdSlotClient
        code="TOP"
        sectionSlug={null}
        candidates={[place("d", 970, 250), place("m", 320, 100)]}
      />,
    );
    const boxes = [...container.querySelectorAll<HTMLElement>("[data-ad-box]")];
    expect(boxes.map((b) => b.style.aspectRatio)).toEqual(["970 / 250", "320 / 100"]);
  });

  it("conta impressão ao aparecer e visualização só após 1 s com 50%, uma vez por sessão", async () => {
    render(<AdSlotClient code="TOP" sectionSlug="cidade" candidates={[place("d", 970, 250)]} />);
    const fire = (ratio: number) =>
      act(() =>
        observers.forEach((cb) => cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }])),
      );
    fire(0.3);
    expect(sent()).toEqual(["impression"]);
    fire(0.6);
    await act(async () => vi.advanceTimersByTime(900));
    fire(0.2); // saiu antes de 1 s: não conta
    await act(async () => vi.advanceTimersByTime(500));
    expect(sent()).toEqual(["impression"]);
    fire(0.6);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(sent()).toEqual(["impression", "view"]);
    fire(0.6);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(sent()).toEqual(["impression", "view"]);
  });

  it("sem candidata para nenhum aparelho não desenha nada", () => {
    const { container } = render(<AdSlotClient code="TOP" sectionSlug={null} candidates={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
