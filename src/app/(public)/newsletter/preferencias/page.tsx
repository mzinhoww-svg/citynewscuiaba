import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert } from "@/components";
import { NEWSLETTER_LISTS, NEWSLETTER_PREFS as T } from "@/content/pt-BR/newsletter";
import { getNewsletterPrefs } from "@/lib/db/writes";
import { verifyNewsletterToken } from "@/lib/newsletter/token";
import { confirmNewsletterAction } from "../actions";
import { PrefsForm } from "./PrefsForm";

/**
 * Centro de preferências por link assinado (P19): sem conta e fora do índice. Com `confirmar=1`
 * (link da confirmação dupla) mostra o botão "Confirmar inscrição"; abrir a página não grava
 * nada (gate P2, I6).
 */
export const metadata: Metadata = {
  title: T.metaTitle,
  robots: { index: false, follow: false },
};

const CONTAINER = "mx-auto w-full max-w-read px-gutter";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PrefsRoute({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const v = verifyNewsletterToken(token, "newsletter");
  if (!v.ok) {
    const expired = v.error === "expired";
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={expired ? T.expiredTitle : T.invalidTitle}
          actions={
            <Button href="/newsletter" size="md">
              {T.requestNew}
            </Button>
          }
        >
          <p>{expired ? T.expiredText : T.invalidText}</p>
        </EmptyState>
      </div>
    );
  }
  const { email, lists } = v.value;
  const confirmed = sp.confirmado === "1";
  const failed = sp.erro === "1";
  const prefs = await getNewsletterPrefs(email);
  if (!prefs.ok || failed) {
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={T.errorTitle}
          actions={
            <Button href={`/newsletter/preferencias?token=${encodeURIComponent(token)}`} size="md">
              {T.retry}
            </Button>
          }
        >
          <p>{T.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  const state = new Map(prefs.value.map((p) => [p.list, p.state]));
  const asking =
    !confirmed && sp.confirmar === "1" && lists.some((l) => state.get(l) === "pending");
  return (
    <div className={`${CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <h1 className="type-display text-strong">{T.title}</h1>
      {confirmed && (
        <InlineAlert tone="success" role="none">
          <p>{T.confirmed}</p>
        </InlineAlert>
      )}
      {asking && (
        <form action={confirmNewsletterAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <InlineAlert tone="info" title={T.confirmAsk} role="none">
            <p>{T.confirmAskText}</p>
          </InlineAlert>
          <Button type="submit" size="md" className="self-start">
            {T.confirmButton}
          </Button>
        </form>
      )}
      <p className="type-body text-body">{T.intro(email)}</p>
      <PrefsForm
        token={token}
        lists={NEWSLETTER_LISTS.map((l) => ({
          id: l.id,
          name: l.name,
          when: l.when,
          state: state.get(l.id) ?? "off",
        }))}
      />
    </div>
  );
}
