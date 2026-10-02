import type { Metadata } from "next";
import { AccountShell, Button, InlineAlert, NewPasswordForm } from "@/components";
import { RECOVER_TEXT as T } from "@/content/pt-BR/account";
import { getReader } from "@/lib/auth/reader";
import { pageMetadata } from "@/lib/seo/metadata";
import { newPasswordAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.resetTitle,
  documentTitle: T.resetMetaTitle,
  description: T.resetIntro,
  path: "/redefinir-senha",
  noindex: true,
});

/**
 * Redefinir senha (C04): chega pelo link de recuperação (sessão aberta em /auth/callback). Sem
 * sessão, o link venceu: explica e oferece pedir outro.
 */
export default async function ResetPage() {
  const reader = await getReader();
  return (
    <AccountShell title={T.resetTitle} intro={reader ? T.resetIntro : undefined}>
      {reader ? (
        <NewPasswordForm action={newPasswordAction} />
      ) : (
        <div className="flex flex-col gap-5">
          <InlineAlert tone="warn" title={T.resetExpired} role="alert">
            <p>{T.resetExpiredDetail}</p>
          </InlineAlert>
          <Button href="/recuperar-senha" fullWidth>
            {T.askAgain}
          </Button>
        </div>
      )}
    </AccountShell>
  );
}
