import { googleCalendarUrl, toIcs } from "./ics";

const base = {
  uid: "e1",
  title: "Noite do Rasqueado",
  startsAt: "2026-10-04T00:00:00Z",
  endsAt: "2026-10-04T03:30:00Z",
  venue: "Orla do Porto",
  url: "https://x",
};

it("ics no fuso de Cuiabá atravessando meia-noite", () => {
  const ics = toIcs(base);
  expect(ics).toContain("DTSTART;TZID=America/Cuiaba:20261003T200000");
  expect(ics).toContain("DTEND;TZID=America/Cuiaba:20261003T233000");
});

it("é um VCALENDAR válido com fuso declarado e CRLF", () => {
  const ics = toIcs(base, new Date("2026-09-27T18:00:00Z"));
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/Cuiaba");
  expect(ics).toContain("UID:e1@citynews");
  expect(ics).toContain("DTSTAMP:20260927T180000Z");
  expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
});

it("evento que termina depois da meia-noite local mantém o dia seguinte", () => {
  const ics = toIcs({ ...base, startsAt: "2026-10-17T02:00:00Z", endsAt: "2026-10-17T05:00:00Z" });
  expect(ics).toContain("DTSTART;TZID=America/Cuiaba:20261016T220000");
  expect(ics).toContain("DTEND;TZID=America/Cuiaba:20261017T010000");
});

it("sem fim, dura 2 horas; texto escapado", () => {
  const ics = toIcs({ ...base, endsAt: undefined, title: "Show; rock, blues\nnovo" });
  expect(ics).toContain("DTEND;TZID=America/Cuiaba:20261003T220000");
  expect(ics).toContain("SUMMARY:Show\; rock\\, blues\\nnovo");
});

it("link do Google Agenda com horário UTC", () => {
  const url = new URL(googleCalendarUrl(base));
  expect(url.hostname).toBe("calendar.google.com");
  expect(url.searchParams.get("dates")).toBe("20261004T000000Z/20261004T033000Z");
  expect(url.searchParams.get("ctz")).toBe("America/Cuiaba");
});
