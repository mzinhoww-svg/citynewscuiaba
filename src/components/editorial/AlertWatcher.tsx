"use client";

import { useEffect } from "react";
import {
  dueNotifications,
  EMPTY_STATE,
  type AlertItem,
  type NotifyState,
} from "@/lib/alerts/match";
import { getAnonStore } from "@/lib/anon/store";
import { showNotification } from "@/lib/offline/sw";

const STATE_KEY = "cn:alertas:estado";
const CHECK_MS = 15 * 60_000;

function readState(): NotifyState {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const v = JSON.parse(raw) as Partial<NotifyState>;
    return {
      seen: Array.isArray(v.seen) ? v.seen.filter((x) => typeof x === "string") : [],
      sentAt: Array.isArray(v.sentAt) ? v.sentAt.filter((x) => typeof x === "string") : [],
      digestAt: v.digestAt && typeof v.digestAt === "object" ? v.digestAt : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(s: NotifyState) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    // Sem armazenamento: pode repetir um aviso; o `tag` evita duplicar na central.
  }
}

async function check() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const profile = await getAnonStore().get();
  const alerts = profile.alerts.filter((a) => a.channel === "browser" && a.status === "active");
  if (alerts.length === 0) return;
  const since = alerts.map((a) => a.at).sort()[0]!;
  const res = await fetch(`/api/alertas/novidades?desde=${encodeURIComponent(since)}`, {
    cache: "no-store",
  });
  if (!res.ok) return;
  const body = (await res.json()) as { items?: AlertItem[] };
  const { notifications, state } = dueNotifications(
    alerts,
    body.items ?? [],
    readState(),
    new Date(),
  );
  writeState(state);
  for (const n of notifications) await showNotification(n.title, n);
}

/**
 * Entrega dos alertas de navegador sem conta (P18): com uma página do CityNews aberta, pergunta
 * as novidades a cada 15 min e avisa o que casa com os alertas deste aparelho (máx. 3 por dia,
 * silêncio 22h–7h). Não renderiza nada; sem alerta ou sem permissão, não faz nenhuma chamada.
 */
export function AlertWatcher() {
  useEffect(() => {
    const run = () => void check().catch(() => undefined);
    run();
    const t = window.setInterval(run, CHECK_MS);
    return () => window.clearInterval(t);
  }, []);
  return null;
}
