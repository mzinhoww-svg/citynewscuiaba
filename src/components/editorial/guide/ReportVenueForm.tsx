"use client";

import { useId, useState } from "react";
import { GUIDE } from "@/content/pt-BR/guide";
import { Button } from "../../ui/Button";
import { TextArea } from "../../ui/TextArea";
import { TextField } from "../../ui/TextField";

type State = "idle" | "sending" | "done" | "invalid" | "rate_limited" | "error";

const T = GUIDE.venue.report;

/**
 * "Informar um problema" do lugar: endereço errado, lugar fechado, dado desatualizado. O aviso
 * suspende as listas que citam o lugar até a equipe conferir. E-mail é opcional e serve só para
 * a equipe falar com a pessoa. Sem JavaScript o formulário não envia (a página segue legível).
 */
export function ReportVenueForm({ venueId }: { venueId: string }) {
  const uid = useId().replace(/:/g, "");
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setState("invalid");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/guia/informar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, reason: reason.trim(), contact: contact.trim() || null }),
      });
      setState(
        res.ok
          ? "done"
          : res.status === 429
            ? "rate_limited"
            : res.status === 400
              ? "invalid"
              : "error",
      );
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="max-w-read type-body text-strong">
        {T.done}
      </p>
    );
  }
  const message =
    state === "invalid"
      ? T.invalid
      : state === "rate_limited"
        ? T.rateLimited
        : state === "error"
          ? T.error
          : null;
  return (
    <details className="group border-t border-line-subtle pt-4">
      <summary className="inline-flex min-h-tap cursor-pointer items-center type-body font-medium text-link underline underline-offset-4">
        {T.title}
      </summary>
      <form onSubmit={submit} className="mt-3 flex max-w-read flex-col gap-4" noValidate>
        <p className="type-body text-body">{T.intro}</p>
        <TextArea
          id={`${uid}-motivo`}
          name="motivo"
          label={T.reason}
          value={reason}
          onChange={setReason}
          rows={4}
          maxLength={1000}
          required
        />
        <TextField
          id={`${uid}-contato`}
          label={T.contact}
          type="email"
          autoComplete="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        {message && (
          <p role="alert" className="type-body text-danger">
            {message}
          </p>
        )}
        <div>
          <Button type="submit" size="md" disabled={state === "sending"}>
            {state === "sending" ? T.sending : T.submit}
          </Button>
        </div>
      </form>
    </details>
  );
}
