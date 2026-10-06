"use client";

import { useEffect } from "react";
import {
  dueNotifications,
  EMPTY_STATE,
  type AlertItem,
  type NotifyState,
  pollSince,
} from "@/lib/alerts/match";
import { getAnonStore } from "@/lib/anon/store";
import { fetchJson } from "@/lib/http/fetch-json";
import { showNotification } from "@/lib/offline/sw";
import { usePushState } from "@/lib/push/client";

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

function isNews(v: unknown): v is { items?: AlertItem[] } {
  if (typeof v !== "object" || v === null) return false;
  const items = (v as { items?: unknown }).items;
  return items === undefined || Array.isArray(items);
}

async function check(pushOn: boolean) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const profile = await getAnonStore().get();
  // Com push ativo, o servidor manda os imediatos (D-P20); aqui ficam só os resumos.
  const alerts = profile.alerts.filter(
    (a) =>
      a.channel === "browser" && a.status === "active" && !(pushOn && a.frequency === "immediate"),
  );
  if (alerts.length === 0) return;
  // Janela de 15 min, nunca o horário exato do alerta (não vira identificador do aparelho).
  const since = pollSince(alerts, new Date());
  // Com prazo (item 83): resposta lenta ou inválida fica para a próxima rodada.
  const r = await fetchJson(`/api/alertas/novidades?desde=${encodeURIComponent(since)}`, {
    guard: isNews,
  });
  if (!r.ok) return;
  const { notifications, state } = dueNotifications(
    alerts,
    r.value.items ?? [],
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
  const push = usePushState();
  const pushOn = push.status === "on";
  useEffect(() => {
    const run = () => void check(pushOn).catch(() => undefined);
    run();
    const t = window.setInterval(run, CHECK_MS);
    return () => window.clearInterval(t);
  }, [pushOn]);
  return null;
}
