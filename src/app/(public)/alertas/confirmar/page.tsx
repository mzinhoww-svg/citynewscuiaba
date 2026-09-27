import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { ALERTS_TEXT as T } from "@/content/pt-BR/alerts";
import { confirmEmailAlerts } from "@/lib/db/writes";
import { verifyNewsletterToken } from "@/lib/newsletter/token";

/** Confirmação de alerta por e-mail (P18): link assinado, sem conta e fora do índice. */
export const metadata: Metadata = {
  title: T.confirmTitle,
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConfirmAlertRoute({ searchParams }: Props) {
  const sp = await searchParams;
  const v = verifyNewsletterToken(typeof sp.token === "string" ? sp.token : "");
  let title: string = T.confirmTitle;
  let text: string = T.confirmText;
  let tone: "empty" | "error" = "empty";
  if (!v.ok) {
    title = v.error === "expired" ? T.confirmExpired : T.confirmInvalid;
    text = v.error === "expired" ? T.confirmExpiredText : T.confirmInvalidText;
    tone = "error";
  } else {
    const ids = v.value.lists.flatMap((l) =>
      l.startsWith("alert:") && UUID.test(l.slice(6)) ? [l.slice(6)] : [],
    );
    const r = ids.length ? await confirmEmailAlerts(v.value.email, ids) : null;
    if (!r?.ok || r.value === 0) {
      title = r?.ok === false ? T.confirmError : T.confirmInvalid;
      text = r?.ok === false ? T.confirmErrorText : T.confirmInvalidText;
      tone = "error";
    }
  }
  return (
    <div className="mx-auto w-full max-w-read px-gutter py-10">
      <EmptyState
        as="h1"
        tone={tone}
        icon={tone === "empty" ? "check" : undefined}
        title={title}
        actions={
          <Button href="/alertas" size="md" variant="outline">
            {T.backToAlerts}
          </Button>
        }
      >
        {text && <p>{text}</p>}
      </EmptyState>
    </div>
  );
}
