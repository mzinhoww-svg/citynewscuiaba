import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert } from "@/components";
import { NEWSLETTER_LISTS, NEWSLETTER_PREFS as T } from "@/content/pt-BR/newsletter";
import { confirmNewsletter, getNewsletterPrefs } from "@/lib/db/writes";
import { verifyNewsletterToken } from "@/lib/newsletter/token";
import { PrefsForm } from "./PrefsForm";

/** Centro de preferências por link assinado (P19): sem conta e fora do índice. */
export const metadata: Metadata = {
  title: T.metaTitle,
  robots: { index: false, follow: false },
};

const CONTAINER = "mx-auto w-full max-w-read px-gutter";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PrefsRoute({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const v = verifyNewsletterToken(token);
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
  const confirming = sp.confirmar === "1";
  const confirmed = confirming ? await confirmNewsletter(email, lists) : null;
  const prefs = await getNewsletterPrefs(email);
  if (!prefs.ok || (confirmed && !confirmed.ok)) {
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
  return (
    <div className={`${CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <h1 className="type-display text-strong">{T.title}</h1>
      {confirming && (
        <InlineAlert tone="success" role="none">
          <p>{T.confirmed}</p>
        </InlineAlert>
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
