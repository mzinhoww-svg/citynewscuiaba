import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell, MigrateLocal } from "@/components";
import { MIGRATE_TEXT as T } from "@/content/pt-BR/account";
import { safeNext } from "@/lib/auth/account";
import { getReader } from "@/lib/auth/reader";
import { pageMetadata } from "@/lib/seo/metadata";
import { migrateAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.intro,
  path: "/entrar/migrar",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const METHODS = ["email", "magic_link", "google"] as const;

/**
 * Migrar dados locais (C06): toda entrada passa por aqui. Sem nada neste navegador (ou já
 * levado para esta conta), segue direto para o destino.
 */
export default async function MigratePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const next = safeNext(one(sp.next));
  const reader = await getReader();
  if (!reader) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  const method = METHODS.find((m) => m === one(sp.metodo)) ?? "email";
  return (
    <AccountShell title={T.title} intro={T.intro} skipHref={null}>
      <MigrateLocal action={migrateAction} next={next} method={method} userId={reader.user.id} />
    </AccountShell>
  );
}
