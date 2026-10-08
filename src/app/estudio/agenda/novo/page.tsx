import type { Metadata } from "next";
import { EventForm, StudioScreen } from "@/components/estudio";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { requireRole } from "@/lib/auth/require-role";
import { AGENDA_CATEGORIES } from "@/lib/filters/agenda";
import { saveEventAction } from "../actions";

export const metadata: Metadata = { title: `${T.form.newTitle} · ${T.metaTitle}` };
export const dynamic = "force-dynamic";

const BASE = "/estudio/agenda";

/** Novo evento da redação (AGM-T7): `origin = 'newsroom'`, no ar na hora. */
export default async function NewEventPage() {
  await requireRole("article.publish", { section: "agenda" }, { next: `${BASE}/novo` });
  return (
    <StudioScreen
      title={T.form.newTitle}
      intro={<p className="type-body text-meta">{T.form.newIntro}</p>}
      breadcrumbs={[
        { href: BASE, label: T.form.breadcrumbs.agenda },
        { href: `${BASE}/novo`, label: T.form.breadcrumbs.new },
      ]}
    >
      <EventForm
        action={saveEventAction}
        cancelHref={BASE}
        categories={AGENDA_CATEGORIES.map((c) => ({ value: c, label: AGENDA.categories[c] ?? c }))}
      />
    </StudioScreen>
  );
}
