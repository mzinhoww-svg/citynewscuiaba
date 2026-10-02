/* CityNews · gerado por scripts/build-sw.mjs a partir de src/sw e src/offline-page. Não edite. */
"use strict";
(() => {
  // src/content/pt-BR/offline.ts
  var OFFLINE_TEXT = {
    brand: "CityNews Cuiab\xE1",
    title: "Sem conex\xE3o",
    intro: "Voc\xEA est\xE1 sem internet. Estas p\xE1ginas est\xE3o guardadas neste aparelho:",
    pages: "P\xE1ginas",
    saved: "Salvas",
    read: "Lidas recentemente",
    empty: "Nada guardado ainda. Com internet, as p\xE1ginas que voc\xEA abrir ficam dispon\xEDveis aqui.",
    retry: "Tentar de novo",
    /** Rótulo de cópia antiga: `staleLabel` monta "Salva às 14h32, pode estar desatualizada." */
    staleNotice: "pode estar desatualizada.",
    savedAt: "Salva \xE0s",
    savedOn: "Salva em",
    backOnline: "Conex\xE3o de volta.",
    refresh: "Atualizar"
  };

  // src/offline-page/index.ts
  var TIMEOUT_MS = 1500;
  function applyTheme() {
    try {
      let t = localStorage.getItem("cn_theme");
      if (t !== "light" && t !== "dark")
        t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", t);
    } catch {
    }
  }
  function askListing() {
    return new Promise((resolve) => {
      try {
        const sw = navigator.serviceWorker?.controller;
        if (!sw) return resolve(null);
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
        channel.port1.onmessage = (e) => {
          clearTimeout(timer);
          resolve(e.data ?? null);
        };
        sw.postMessage({ type: "list-offline" }, [channel.port2]);
      } catch {
        resolve(null);
      }
    });
  }
  function fillList(section, items) {
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
  function render(listing, root = document) {
    const l = listing ?? { paginas: [], salvas: [], lidas: [] };
    const any = [
      ["paginas", l.paginas],
      ["salvas", l.salvas],
      ["lidas", l.lidas]
    ].reduce((acc, [id, items]) => {
      const section = root.getElementById(id);
      return section ? fillList(section, items) || acc : acc;
    }, false);
    const intro = root.getElementById("intro");
    const empty = root.getElementById("empty");
    if (intro) intro.hidden = !any;
    if (empty) empty.hidden = any;
  }
  function wire(root = document) {
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
  async function boot() {
    applyTheme();
    wire();
    render(await askListing());
  }
  if (typeof document !== "undefined" && document.getElementById("offline-page")) {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", () => void boot());
    else void boot();
  }
})();
