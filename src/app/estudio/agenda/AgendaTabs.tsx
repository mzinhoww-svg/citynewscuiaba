import { LinkTabs } from "@/components";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";

/** Abas da área Agenda do Estúdio (AGM-T7, ARD-T6): Eventos | Sugestões (fila E13) | Instagram. */
export function AgendaTabs({ current }: { current: "events" | "submissions" | "instagram" }) {
  return (
    <LinkTabs
      label={T.tabsLabel}
      items={[
        { href: "/estudio/agenda", label: T.tabs.events, current: current === "events" },
        {
          href: "/estudio/agenda/sugestoes",
          label: T.tabs.submissions,
          current: current === "submissions",
        },
        {
          href: "/estudio/agenda/instagram",
          label: T.tabs.instagram,
          current: current === "instagram",
        },
      ]}
    />
  );
}
