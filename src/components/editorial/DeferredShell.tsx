"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { INVITE_EVENT } from "@/lib/anon/invite";
import { QUALIFIED_READ_EVENT, qualifiedReadsThisSession } from "@/lib/anon/invite-storage";

/*
 * Partes da moldura que só valem depois de um gatilho (B-018, orçamento de 170 kB de JS na
 * home): cada uma carrega sob demanda, no gatilho e não no primeiro carregamento. Sem o gatilho,
 * nenhum byte delas vai à página. O comportamento depois de carregar é o mesmo de antes.
 */

// `React.lazy` em vez de `next/dynamic`: o carregador do Next custava ~5 kB gz a mais em toda página.
const AlertWatcher = lazy(() =>
  import("./AlertWatcher").then((m) => ({ default: m.AlertWatcher })),
);
const PushSync = lazy(() => import("./PushSync").then((m) => ({ default: m.PushSync })));
const FirstVisitInvite = lazy(() =>
  import("./FirstVisitInvite").then((m) => ({ default: m.FirstVisitInvite })),
);

const onServer = () => false;

/** Permissão de notificações já decidida (concedida ou negada): só então há o que sincronizar. */
function notificationsAsked(): boolean {
  return typeof Notification !== "undefined" && Notification.permission !== "default";
}

function subscribeNotificationPermission(onChange: () => void): () => void {
  let status: PermissionStatus | null = null;
  let closed = false;
  try {
    void navigator.permissions
      ?.query({ name: "notifications" })
      .then((s) => {
        if (closed) return;
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => undefined);
  } catch {
    // Sem a Permissions API: vale a leitura feita ao montar.
  }
  return () => {
    closed = true;
    status?.removeEventListener("change", onChange);
  };
}

/**
 * Alertas de navegador e sincronização do push: sem permissão de notificações decidida não há
 * alerta a entregar nem inscrição a sincronizar, então o código nem é baixado.
 */
export function NotificationWatchers() {
  const asked = useSyncExternalStore(subscribeNotificationPermission, notificationsAsked, onServer);
  if (!asked) return null;
  return (
    <Suspense fallback={null}>
      <AlertWatcher />
      <PushSync />
    </Suspense>
  );
}

function subscribeReads(onChange: () => void): () => void {
  window.addEventListener(QUALIFIED_READ_EVENT, onChange);
  return () => window.removeEventListener(QUALIFIED_READ_EVENT, onChange);
}

const hasReads = () => qualifiedReadsThisSession() > 0;

/** Painel da primeira visita: só depois da primeira leitura qualificada da sessão. */
export function FirstVisitGate() {
  const started = useSyncExternalStore(subscribeReads, hasReads, onServer);
  return started ? (
    <Suspense fallback={null}>
      <FirstVisitInvite />
    </Suspense>
  ) : null;
}

/**
 * Convite de login: baixa o componente no primeiro pedido (`requestLoginInvite`) e repete o
 * pedido depois de montado, porque o evento original passou antes de existir ouvinte.
 */
export function LoginInviteGate() {
  const [Comp, setComp] = useState<ComponentType | null>(null);
  const pending = useRef<CustomEvent | null>(null);

  useEffect(() => {
    if (Comp) return;
    const onRequest = (e: Event) => {
      pending.current = e as CustomEvent;
      void import("./LoginInvite").then((m) => setComp(() => m.LoginInvite));
    };
    window.addEventListener(INVITE_EVENT, onRequest, { once: true });
    return () => window.removeEventListener(INVITE_EVENT, onRequest);
  }, [Comp]);

  useEffect(() => {
    // Efeito do pai roda depois do dos filhos: o ouvinte do convite já existe.
    if (!Comp || !pending.current) return;
    const detail = pending.current.detail;
    pending.current = null;
    window.dispatchEvent(new CustomEvent(INVITE_EVENT, { detail }));
  }, [Comp]);

  return Comp ? <Comp /> : null;
}
