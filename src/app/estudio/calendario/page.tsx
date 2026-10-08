import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, Icon, type IconName } from "@/components";
import { StudioScreen } from "@/components/estudio";
import { ARTICLE_STATUS_LABEL, CALENDAR_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { requireRole } from "@/lib/auth/require-role";
import { calendarItems, type CalendarItem } from "@/lib/db/queries/studio-corrections";
import {
  addDays,
  dayStart,
  formatDayMonth,
  formatHour,
  formatLongDate,
  localDateKey,
} from "@/lib/format/date";

export const metadata: Metadata = { title: "Calendário editorial · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

/** Tipo do item como ícone + texto (item 44): sem faixa lateral, e a cor nunca fala sozinha. */
const KIND_MARK: Record<CalendarItem["kind"], { icon: IconName; tone: string }> = {
  scheduled: { icon: "clock", tone: "text-meta" },
  due: { icon: "triangle-alert", tone: "text-warn" },
  published: { icon: "check", tone: "text-service" },
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("article.edit", undefined, { next: "/estudio/calendario" });
  const sp = await searchParams;
  const raw = Array.isArray(sp.semana) ? sp.semana[0] : sp.semana;
  const today = localDateKey(new Date());
  // Sete dias a partir de hoje (ou do dia pedido): amanhã sempre aparece, mesmo no domingo.
  const start = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const from = dayStart(start);
  const to = dayStart(addDays(start, 7));

  let items: CalendarItem[] | null = null;
  try {
    items = await calendarItems(from, to);
  } catch {
    items = null;
  }
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items ?? []) {
    const k = localDateKey(it.at);
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }

  return (
    <StudioScreen title={T.title} intro={T.intro}>
      <nav aria-label={T.nav} className="flex flex-wrap items-center gap-2">
        <Button
          href={`/estudio/calendario?semana=${addDays(start, -7)}`}
          size="sm"
          variant="outline"
          icon="chevron-left"
        >
          {T.prev}
        </Button>
        <Button href="/estudio/calendario" size="sm" variant="text">
          {T.today}
        </Button>
        <Button
          href={`/estudio/calendario?semana=${addDays(start, 7)}`}
          size="sm"
          variant="outline"
          iconRight="chevron-right"
        >
          {T.next}
        </Button>
        <p className="type-meta text-meta" aria-live="polite">
          {T.weekOf(
            formatDayMonth(from.toISOString()),
            formatDayMonth(dayStart(days[6]!).toISOString()),
          )}
        </p>
      </nav>
      {items === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/calendario" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : (
        <>
          {items.length === 0 && (
            <EmptyState title={T.title} icon="calendar">
              {T.emptyWeek}
            </EmptyState>
          )}
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const isToday = d === today;
              return (
                <li
                  key={d}
                  aria-labelledby={`dia-${d}`}
                  aria-current={isToday ? "date" : undefined}
                  className={
                    isToday
                      ? "flex flex-col gap-2 rounded-lg border-2 border-line-strong bg-card-white p-3"
                      : "flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-3"
                  }
                >
                  <h2
                    id={`dia-${d}`}
                    className={
                      isToday ? "flex flex-col type-label text-eyebrow" : "type-label text-strong"
                    }
                  >
                    {isToday && (
                      <span className="type-meta font-semibold uppercase">{T.todayLabel}</span>
                    )}
                    {formatLongDate(dayStart(d).toISOString())}
                  </h2>
                  {list.length === 0 ? (
                    <p className="type-meta text-meta">{T.empty}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {list.map((it) => (
                        <li key={`${it.kind}:${it.id}`} className="flex flex-col">
                          <p className="flex items-center gap-1.5 type-meta text-meta">
                            <Icon
                              name={KIND_MARK[it.kind].icon}
                              size={16}
                              className={`shrink-0 ${KIND_MARK[it.kind].tone}`}
                            />
                            <span>
                              {T.kind[it.kind]} · {formatHour(it.at)}
                            </span>
                          </p>
                          <Link
                            href={it.href}
                            className="type-body font-semibold text-strong underline-offset-4 hover:underline"
                          >
                            {it.title}
                          </Link>
                          <p className="type-meta text-meta">
                            {ARTICLE_STATUS_LABEL[it.status as keyof typeof ARTICLE_STATUS_LABEL] ??
                              it.status}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </StudioScreen>
  );
}
