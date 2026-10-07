import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, DeleteAccountForm, Icon, PAGE_CONTAINER, PageHeader } from "@/components";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { getReader } from "@/lib/auth/reader";
import { readAccountProfile } from "@/lib/db/account";
import { pageMetadata } from "@/lib/seo/metadata";
import { requestDeletionAction, signOutAction } from "../actions";

export const metadata: Metadata = pageMetadata({
  title: T.delete.title,
  documentTitle: T.delete.metaTitle,
  description: T.delete.points[1],
  path: "/perfil/excluir",
  noindex: true,
});

const POINTS = [
  { text: T.delete.points[0], icon: "x", tone: "mt-0.5 shrink-0 text-danger" },
  { text: T.delete.points[1], icon: "clock", tone: "mt-0.5 shrink-0" },
  { text: T.delete.points[2], icon: "check", tone: "mt-0.5 shrink-0 text-service" },
] as const;

/**
 * Excluir conta (redesenho UI-PERFIL): tela própria, longe das ações do dia a dia. Diz o que é
 * apagado, o prazo, oferece a cópia e o "só sair", e pede EXCLUIR. Conta da equipe, conta com
 * exclusão já agendada ou sem conta voltam para o Perfil.
 */
export default async function DeleteAccountPage() {
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=%2Fperfil%2Fexcluir");
  const account = await readAccountProfile(reader.db, reader.user.id).catch(() => null);
  if (!account || account.staff || account.deleteRequestedAt) redirect("/perfil");

  return (
    <div className={`${PAGE_CONTAINER} py-8 lg:py-10`}>
      <div className="flex max-w-read flex-col gap-8">
        <Button href="/perfil" variant="text" size="md" icon="chevron-left" className="self-start">
          {T.back}
        </Button>
        <PageHeader title={T.delete.title} />

        <section aria-labelledby="excluir-o-que" className="flex flex-col gap-4">
          <h2 id="excluir-o-que" className="type-section text-strong">
            {T.delete.what}
          </h2>
          <ul className="flex flex-col gap-3">
            {POINTS.map((p) => (
              <li key={p.text} className="flex gap-3 type-body text-body">
                <Icon name={p.icon} size={20} className={p.tone} />
                {p.text}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="excluir-antes"
          className="flex flex-col gap-1 rounded-md bg-section px-4 py-3"
        >
          <h2 id="excluir-antes" className="type-label text-strong">
            {T.delete.before}
          </h2>
          <Button href="/perfil#perfil-dados" variant="text" size="md" className="self-start">
            {T.delete.copy}
          </Button>
          <form action={signOutAction}>
            <input type="hidden" name="scope" value="local" />
            <Button type="submit" variant="text" size="md">
              {T.delete.justLeave}
            </Button>
          </form>
        </section>

        <DeleteAccountForm action={requestDeletionAction} />
      </div>
    </div>
  );
}
