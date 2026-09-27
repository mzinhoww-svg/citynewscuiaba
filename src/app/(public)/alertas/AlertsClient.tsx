"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, EmptyState, InlineAlert, Select, Skeleton, TextField } from "@/components";
import { ALERTS_TEXT as T } from "@/content/pt-BR/alerts";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { requestLoginInvite } from "@/lib/anon/invite";
import type { AlertChannel, AlertFrequency, AlertKind, LocalAlert } from "@/lib/anon/types";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { showNotification } from "@/lib/offline/sw";

type Option = { value: string; label: string };

export interface AlertsClientProps {
  targets: { bairro: Option[]; tema: Option[]; assunto: Option[] };
}

const KINDS: AlertKind[] = ["bairro", "tema", "assunto", "urgentes", "agenda"];
const FREQS: AlertFrequency[] = ["immediate", "daily", "weekly"];
const CHANNELS: AlertChannel[] = ["browser", "email"];

type Feedback = { tone: "success" | "warn" | "error"; text: string } | null;

/** Permissão de notificação: pede só no clique em "Criar alerta" (nunca na carga da página). */
async function askPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  // Com permissão negada, o navegador responde "denied" na hora, sem perguntar de novo.
  try {
    return (await Notification.requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function AlertsClient({ targets }: AlertsClientProps) {
  const id = useId();
  const { profile, degraded, ready, act } = useAnonProfile();
  const [kind, setKind] = useState<AlertKind>("bairro");
  const [target, setTarget] = useState("");
  const [frequency, setFrequency] = useState<AlertFrequency>("immediate");
  const [channel, setChannel] = useState<AlertChannel>("browser");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const options = kind === "bairro" || kind === "tema" || kind === "assunto" ? targets[kind] : [];
  const chosen = options.find((o) => o.value === target) ?? options[0];
  const resolved =
    kind === "urgentes"
      ? { value: "todos", label: T.allUrgent }
      : kind === "agenda"
        ? { value: "todos", label: T.allAgenda }
        : chosen;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolved || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const base = { kind, target: resolved.value, label: resolved.label, frequency, channel };
      if (channel === "browser") {
        const p = await askPermission();
        if (p !== "granted") {
          setFeedback({ tone: "warn", text: p === "unsupported" ? T.unsupported : T.denied });
          return;
        }
        await act((s) => s.addAlert(base));
        void showNotification(T.testTitle, { body: T.testBody, href: "/alertas", tag: "cn-teste" });
        setFeedback({ tone: "success", text: T.created });
      } else {
        const res = await fetch("/api/alertas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...base, email }),
        }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as {
          status?: string;
          email?: string;
        } | null;
        if (body?.status === "pending" && body.email) {
          const confirmed = body.email;
          await act((s) => s.addAlert({ ...base, status: "pending_email", email: confirmed }));
          setFeedback({ tone: "success", text: T.createdEmail });
          setEmail("");
        } else
          setFeedback({
            tone: "error",
            text:
              body?.status === "invalid"
                ? T.invalidEmail
                : body?.status === "rate_limited"
                  ? T.rateLimited
                  : T.error,
          });
      }
      requestLoginInvite("alert");
    } finally {
      setBusy(false);
    }
  };

  const remove = (a: LocalAlert) => void act((s) => s.removeAlert(a.id));

  return (
    <div
      data-ready={ready ? "true" : undefined}
      className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-14"
    >
      <section aria-labelledby={`${id}-ativos`} className="flex min-w-0 flex-col gap-4">
        <h2 id={`${id}-ativos`} className="type-section text-strong">
          {T.activeTitle}
        </h2>
        {degraded && (
          <InlineAlert tone="warn" title={ANON_TEXT.degraded}>
            <p>{ANON_TEXT.degradedDetail}</p>
          </InlineAlert>
        )}
        {!profile ? (
          <div aria-busy="true">
            <p className="sr-only">{T.loading}</p>
            <Skeleton lines={2} />
          </div>
        ) : profile.alerts.length === 0 ? (
          <EmptyState title={T.activeEmpty} icon="bell">
            <p>{T.activeEmptyText}</p>
          </EmptyState>
        ) : (
          <ul className="flex flex-col">
            {profile.alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle py-3 last:border-b"
              >
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                  <p className="type-body font-semibold text-strong">
                    {T.kinds[a.kind]}: {a.label}
                  </p>
                  <p className="type-meta text-meta">
                    {T.frequencies[a.frequency]} · {T.channels[a.channel]} ·{" "}
                    {a.status === "pending_email" && a.email ? (
                      <span className="text-warn">{T.statusPending(a.email)}</span>
                    ) : (
                      T.statusActive
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon="trash-2"
                  aria-label={T.removeLabel(a.label)}
                  onClick={() => remove(a)}
                >
                  {T.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="type-meta text-meta">{T.whileOpen}</p>
      </section>

      <section
        aria-labelledby={`${id}-criar`}
        className="flex flex-col gap-4 self-start border border-line-strong bg-card-white p-5"
      >
        <h2 id={`${id}-criar`} className="type-section text-strong">
          {T.createTitle}
        </h2>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Select
            id={`${id}-tipo`}
            name="kind"
            label={T.kind}
            value={kind}
            onChange={(v) => {
              const k = KINDS.find((x) => x === v);
              if (k) {
                setKind(k);
                setTarget("");
              }
            }}
            options={KINDS.map((k) => ({ value: k, label: T.kinds[k] }))}
          />
          {options.length > 0 && (
            <Select
              id={`${id}-alvo`}
              name="target"
              label={T.target}
              value={chosen?.value ?? ""}
              onChange={setTarget}
              options={options}
            />
          )}
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 type-label text-16 text-strong">{T.frequency}</legend>
            {FREQS.map((f) => (
              <label
                key={f}
                className="flex min-h-tap cursor-pointer items-center gap-3 type-body text-strong"
              >
                <input
                  type="radio"
                  name="frequency"
                  value={f}
                  checked={frequency === f}
                  onChange={() => setFrequency(f)}
                  className="size-5 accent-(--action-primary)"
                />
                {T.frequencies[f]}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 type-label text-16 text-strong">{T.channel}</legend>
            {CHANNELS.map((c) => (
              <label
                key={c}
                className="flex min-h-tap cursor-pointer items-center gap-3 type-body text-strong"
              >
                <input
                  type="radio"
                  name="channel"
                  value={c}
                  checked={channel === c}
                  onChange={() => setChannel(c)}
                  className="size-5 accent-(--action-primary)"
                />
                {T.channels[c]}
              </label>
            ))}
          </fieldset>
          {channel === "email" && (
            <TextField
              id={`${id}-email`}
              name="email"
              type="email"
              icon="mail"
              label={T.email}
              placeholder={T.emailPlaceholder}
              hint={T.emailHint}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          <Button type="submit" icon="bell" disabled={busy || !resolved}>
            {busy ? T.creating : T.create}
          </Button>
          <div role="status" aria-live="polite">
            {feedback && (
              <InlineAlert tone={feedback.tone} role="none">
                <p>{feedback.text}</p>
              </InlineAlert>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
