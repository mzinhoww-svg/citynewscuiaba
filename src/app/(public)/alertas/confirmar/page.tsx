import type { Metadata } from "next";
import { Button, EmptyState, PAGE_CONTAINER } from "@/components";
import { ALERTS_TEXT as T } from "@/content/pt-BR/alerts";
import { verifyNewsletterToken } from "@/lib/newsletter/token";
import { confirmAlertAction } from "./actions";

/**
 * Confirmação de alerta por e-mail (P18): link assinado, sem conta e fora do índice. Abrir o
 * link só mostra o botão; a confirmação é a Server Action (gate P2, I6).
 */
export const metadata: Metadata = {
  title: T.confirmTitle,
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const RESULTS = {
  confirmado: { title: T.confirmTitle, text: T.confirmText, tone: "empty" },
  expirado: { title: T.confirmExpired, text: T.confirmExpiredText, tone: "error" },
  invalido: { title: T.confirmInvalid, text: T.confirmInvalidText, tone: "error" },
  erro: { title: T.confirmError, text: T.confirmErrorText, tone: "error" },
} as const;

export default async function ConfirmAlertRoute({ searchParams }: Props) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const estado = typeof sp.estado === "string" ? sp.estado : "";
  const back = (
    <Button href="/alertas" size="md" variant="outline">
      {T.backToAlerts}
    </Button>
  );

  let result: (typeof RESULTS)[keyof typeof RESULTS] | null =
    estado in RESULTS ? RESULTS[estado as keyof typeof RESULTS] : null;
  let email = "";
  if (!result) {
    const v = verifyNewsletterToken(token, "alert");
    if (v.ok) email = v.value.email;
    else result = v.error === "expired" ? RESULTS.expirado : RESULTS.invalido;
  }

  return (
    <div className={`${PAGE_CONTAINER} py-8 lg:py-10`}>
      <div className="mx-auto w-full max-w-read">
        {result ? (
          <EmptyState
            as="h1"
            tone={result.tone}
            icon={result.tone === "empty" ? "check" : undefined}
            title={result.title}
            actions={back}
          >
            <p>{result.text}</p>
          </EmptyState>
        ) : (
          <form action={confirmAlertAction}>
            <input type="hidden" name="token" value={token} />
            <EmptyState
              as="h1"
              title={T.confirmAskTitle}
              actions={
                <Button type="submit" size="md">
                  {T.confirmButton}
                </Button>
              }
            >
              <p>{T.confirmAskText(email)}</p>
            </EmptyState>
          </form>
        )}
      </div>
    </div>
  );
}
