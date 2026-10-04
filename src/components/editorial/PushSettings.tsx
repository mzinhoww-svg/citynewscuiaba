"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { NOTIF_TEXT as T, TARGET_LABEL } from "@/content/pt-BR/notifications";
import { isIosSafari } from "@/lib/app/install";
import { browserFamily } from "@/lib/push/ua";
import {
  disablePush,
  enablePush,
  pushSupport,
  updatePushPrefs,
  usePushState,
  type PushPrefs,
  type PushSupport,
} from "@/lib/push/client";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { Toggle } from "../ui/Toggle";
import { IosInstallSteps } from "./IosInstallSteps";

const QUIET_START = [18, 19, 20, 21, 22];
const QUIET_END = [7, 8, 9, 10];
const LIMITS = [1, 2, 3] as const;

let bump = 0;
const bumpSubs = new Set<() => void>();
const subscribeSupport = (cb: () => void) => {
  bumpSubs.add(cb);
  return () => {
    bumpSubs.delete(cb);
  };
};
/** "Já reativei": reconsulta `Notification.permission`. */
function recheckSupport() {
  bump++;
  for (const s of bumpSubs) s();
}

export interface PushSettingsProps {
  /** Só nos testes: força um estado de suporte. */
  support?: PushSupport;
}

/**
 * P18 · "Avisos no celular e no computador" (spec §7.5): estados sem suporte, iPhone fora do
 * app, desligado, negado (instruções por navegador), ativo (tipos, silêncio só para mais,
 * limite 1–3, alvos enviados, desativar), carregando, erro ao salvar e inscrição perdida.
 */
export function PushSettings({ support: forced }: PushSettingsProps) {
  const id = useId();
  const state = usePushState();
  const live = useSyncExternalStore(
    subscribeSupport,
    () => `${bump}:${pushSupport()}`,
    () => "0:unsupported",
  );
  const support = forced ?? (live.split(":")[1] as PushSupport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: () => void } | null>(null);
  const [steps, setSteps] = useState(false);
  const [notice, setNotice] = useState("");

  const enable = async () => {
    setBusy(true);
    setError(null);
    const r = await enablePush("settings");
    setBusy(false);
    if (!r.ok) {
      if (r.error === "denied") recheckSupport();
      else
        setError({
          text: r.error === "rate_limited" ? T.invite.rateLimited : T.invite.failed,
          retry: () => void enable(),
        });
    }
  };

  const save = async (patch: Partial<PushPrefs>) => {
    setError(null);
    const r = await updatePushPrefs(patch);
    if (!r.ok && r.error === "server_failed")
      setError({ text: T.settings.saveError, retry: () => void save(patch) });
  };

  const disable = async () => {
    setBusy(true);
    const r = await disablePush();
    setBusy(false);
    setNotice(T.settings.disabled);
    if (!r.ok) setError({ text: T.settings.saveError, retry: () => void disable() });
  };

  const heading = (
    <h2 id={`${id}-push`} className="type-section text-strong">
      {T.settings.title}
    </h2>
  );
  const wrap = (children: React.ReactNode) => (
    <section
      aria-labelledby={`${id}-push`}
      className="flex flex-col gap-4 border border-line-section bg-card-white p-5"
      data-push-state={state.status}
    >
      {heading}
      {children}
      {error && (
        <InlineAlert
          tone="error"
          role="alert"
          action={
            <Button size="sm" variant="outline" onClick={error.retry}>
              {T.settings.retry}
            </Button>
          }
        >
          <p>{error.text}</p>
        </InlineAlert>
      )}
      {notice && (
        <p role="status" className="type-meta text-meta">
          {notice}
        </p>
      )}
    </section>
  );

  // Sem suporte (ou sem chave), uma linha de nota no lugar de um bloco com título: não há nada
  // para ligar aqui, e a caixa empurrava a lista e o formulário para baixo no celular.
  if (support === "unsupported" || support === "no_keys")
    return (
      <p data-push-state="unsupported" className="flex items-start gap-2 type-meta text-meta">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        {support === "unsupported" ? T.settings.unsupportedBrowser : T.settings.unavailable}
      </p>
    );
  if (support === "ios_needs_install")
    return wrap(
      <>
        <p className="type-body text-body">{T.settings.iosNeedsInstall}</p>
        <div>
          <Button size="md" variant="outline" onClick={() => setSteps(true)}>
            {T.settings.howToAdd}
          </Button>
        </div>
        <IosInstallSteps open={steps} safari={isIosSafari()} onClose={() => setSteps(false)} />
      </>,
    );
  if (support === "denied") {
    const family = browserFamily(typeof navigator === "undefined" ? "" : navigator.userAgent);
    return wrap(
      <InlineAlert
        tone="warn"
        title={T.settings.deniedTitle}
        action={
          <Button size="sm" variant="outline" onClick={recheckSupport}>
            {T.settings.reenabled}
          </Button>
        }
      >
        <p>{T.settings.deniedIntro}</p>
        <ul className="mt-2 list-disc pl-5">
          <li>{T.settings.deniedSteps[family]}</li>
        </ul>
      </InlineAlert>,
    );
  }
  if (state.status === "unknown")
    return wrap(
      <div aria-busy="true">
        <p className="sr-only">{T.settings.loading}</p>
        <Skeleton lines={3} />
      </div>,
    );
  if (state.status !== "on")
    return wrap(
      <>
        <p className="type-body text-body">
          {state.status === "lost" ? T.settings.lost : T.invite.body}
        </p>
        <div>
          <Button size="md" icon="bell" onClick={() => void enable()} disabled={busy}>
            {T.settings.enableButton}
          </Button>
        </div>
      </>,
    );

  const { prefs, targets } = state;
  const kinds: (keyof typeof T.settings.kinds)[] = ["follow", "urgent", "highlight"];
  return wrap(
    <>
      <p className="type-meta text-meta">{T.settings.activeIntro}</p>
      <ul className="flex flex-col">
        {kinds.map((k) => (
          <li
            key={k}
            className="flex items-center justify-between gap-4 border-t border-line-subtle py-2 last:border-b"
          >
            <span id={`${id}-${k}`} className="type-body text-strong">
              {T.settings.kinds[k]}
            </span>
            <Toggle
              checked={prefs[k]}
              label={T.settings.kinds[k]}
              onChange={(v) => void save({ [k]: v })}
            />
          </li>
        ))}
      </ul>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 type-label text-16 text-strong">{T.settings.quiet}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Select
            id={`${id}-qs`}
            name="quietStart"
            label={T.settings.quietStart}
            value={String(prefs.quietStart)}
            onChange={(v) => void save({ quietStart: Number(v) })}
            options={QUIET_START.map((h) => ({ value: String(h), label: T.settings.hour(h) }))}
          />
          <Select
            id={`${id}-qe`}
            name="quietEnd"
            label={T.settings.quietEnd}
            value={String(prefs.quietEnd)}
            onChange={(v) => void save({ quietEnd: Number(v) })}
            options={QUIET_END.map((h) => ({ value: String(h), label: T.settings.hour(h) }))}
          />
        </div>
        <p className="type-meta text-meta">{T.settings.quietNote}</p>
      </fieldset>
      <Select
        id={`${id}-limit`}
        name="dailyLimit"
        label={T.settings.dailyLimit}
        value={String(prefs.dailyLimit)}
        onChange={(v) => void save({ dailyLimit: Number(v) as 1 | 2 | 3 })}
        options={LIMITS.map((n) => ({ value: String(n), label: String(n) }))}
      />
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-16 text-strong">{T.settings.targetsTitle}</h3>
        {targets.length === 0 ? (
          <p className="type-meta text-meta">{T.settings.targetsEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label={T.settings.targetsTitle}>
            {targets.map((t) => {
              const [kind, slug] = t.split(":") as [keyof typeof TARGET_LABEL, string];
              return (
                <li
                  key={t}
                  className="rounded-pill border border-line-control px-3 py-1 type-meta text-strong"
                >
                  {TARGET_LABEL[kind] ?? kind}: {slug}
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/favoritos"
          className="type-meta font-semibold text-link underline underline-offset-4"
        >
          {T.settings.targetsManage}
        </Link>
      </div>
      <div>
        <Button
          size="md"
          variant="outline"
          icon="bell-off"
          onClick={() => void disable()}
          disabled={busy}
        >
          {T.settings.disable}
        </Button>
      </div>
    </>,
  );
}
