/**
 * Script da página "Sem conexão" (P25; `public/offline.js`, gerado por `pnpm sw:build`). Pede a
 * lista ao service worker por `MessageChannel` e monta as três listas no DOM sem `innerHTML`.
 * Sem SW ou sem resposta, mostra a frase de vazio. Sem script inline: a CSP continua estrita.
 */
import { OFFLINE_TEXT } from "@/content/pt-BR/offline";
import type { OfflineItem, OfflineListing } from "@/sw/contract";

const TIMEOUT_MS = 1500;

function applyTheme(): void {
  try {
    let t = localStorage.getItem("cn_theme");
    if (t !== "light" && t !== "dark")
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch {
    /* sem armazenamento */
  }
}

export function askListing(): Promise<OfflineListing | null> {
  return new Promise((resolve) => {
    try {
      const sw = navigator.serviceWorker?.controller;
      if (!sw) return resolve(null);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      channel.port1.onmessage = (e) => {
        clearTimeout(timer);
        resolve((e.data as OfflineListing) ?? null);
      };
      sw.postMessage({ type: "list-offline" }, [channel.port2]);
    } catch {
      resolve(null);
    }
  });
}

function fillList(section: HTMLElement, items: OfflineItem[]): boolean {
  const ul = section.querySelector("ul");
  if (!ul) return false;
  while (ul.firstChild) ul.removeChild(ul.firstChild);
  for (const it of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = it.url;
    a.textContent = it.title;
    const small = document.createElement("small");
    small.textContent = it.label;
    li.append(a, " ", small);
    ul.appendChild(li);
  }
  section.hidden = items.length === 0;
  return items.length > 0;
}

export function render(listing: OfflineListing | null, root: Document = document): void {
  const l = listing ?? { paginas: [], salvas: [], lidas: [] };
  const any = [
    ["paginas", l.paginas],
    ["salvas", l.salvas],
    ["lidas", l.lidas],
  ].reduce((acc, [id, items]) => {
    const section = root.getElementById(id as string);
    return section ? fillList(section, items as OfflineItem[]) || acc : acc;
  }, false);
  const intro = root.getElementById("intro");
  const empty = root.getElementById("empty");
  if (intro) intro.hidden = !any;
  if (empty) empty.hidden = any;
}

export function wire(root: Document = document): void {
  root.getElementById("retry")?.addEventListener("click", () => location.reload());
  const status = root.getElementById("online");
  window.addEventListener("online", () => {
    if (!status) return;
    while (status.firstChild) status.removeChild(status.firstChild);
    status.append(`${OFFLINE_TEXT.backOnline} `);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = OFFLINE_TEXT.refresh;
    btn.addEventListener("click", () => location.reload());
    status.appendChild(btn);
    status.hidden = false;
  });
}

export async function boot(): Promise<void> {
  applyTheme();
  wire();
  render(await askListing());
}

if (typeof document !== "undefined" && document.getElementById("offline-page")) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => void boot());
  else void boot();
}
