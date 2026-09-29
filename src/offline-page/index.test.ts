// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_TEXT } from "@/content/pt-BR/offline";
import type { OfflineListing } from "@/sw/contract";
import { askListing, render, wire } from "./index";

const html = readFileSync("public/offline.html", "utf8");
const body = /<body>([\s\S]*)<\/body>/.exec(html)![1]!;

function mockSw(reply: OfflineListing | null) {
  const controller = {
    postMessage: (msg: unknown, ports: MessagePort[]) => {
      expect(msg).toEqual({ type: "list-offline" });
      if (reply) ports[0]!.postMessage(reply);
    },
  };
  Object.defineProperty(navigator, "serviceWorker", { value: { controller }, configurable: true });
}

describe("página Sem conexão", () => {
  beforeEach(() => {
    document.body.innerHTML = body;
  });

  it("o HTML estático usa os textos de offline.ts, sem script inline nem style", () => {
    for (const t of [
      OFFLINE_TEXT.title,
      OFFLINE_TEXT.intro,
      OFFLINE_TEXT.pages,
      OFFLINE_TEXT.saved,
      OFFLINE_TEXT.read,
      OFFLINE_TEXT.empty,
      OFFLINE_TEXT.retry,
    ])
      expect(html).toContain(t);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script src="/offline.js"></script>');
    expect(html).not.toMatch(/style=/);
  });

  it("lista páginas, salvas e lidas", async () => {
    const item = (url: string, title: string) => ({
      url,
      title,
      cachedAt: "2026-09-28T18:32:00Z",
      label: "Salva às 14h32",
    });
    mockSw({
      paginas: [item("/", "Início")],
      salvas: [item("/materia/s", "Salva")],
      lidas: [item("/materia/a", "Lida A"), item("/materia/b", "Lida B")],
    });
    render(await askListing());
    const lidas = document.getElementById("lidas")!;
    expect(lidas.hidden).toBe(false);
    expect([...lidas.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Lida A Salva às 14h32",
      "Lida B Salva às 14h32",
    ]);
    expect(lidas.querySelector("a")!.getAttribute("href")).toBe("/materia/a");
    expect(document.getElementById("empty")!.hidden).toBe(true);
    expect(document.getElementById("intro")!.hidden).toBe(false);
  });

  it("tudo vazio mostra a frase de vazio; sem SW também", async () => {
    mockSw({ paginas: [], salvas: [], lidas: [] });
    render(await askListing());
    expect(document.getElementById("empty")!.hidden).toBe(false);
    expect(document.getElementById("intro")!.hidden).toBe(true);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { controller: null },
      configurable: true,
    });
    expect(await askListing()).toBeNull();
  });

  it("Conexão de volta mostra Atualizar", () => {
    wire();
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, configurable: true });
    window.dispatchEvent(new Event("online"));
    const status = document.getElementById("online")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain(OFFLINE_TEXT.backOnline);
    status.querySelector("button")!.click();
    expect(reload).toHaveBeenCalled();
  });
});
