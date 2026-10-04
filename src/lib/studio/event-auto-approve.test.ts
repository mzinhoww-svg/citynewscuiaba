import type { EventSubmission } from "@/lib/agenda/submission";
import {
  autoApproveReasons,
  canAutoApproveEvent,
  DAILY_SUBMISSION_LIMIT,
  type AutoApproveContext,
} from "./event-auto-approve";

const NOW = new Date("2026-10-03T15:00:00.000Z");
const submission = (over: Partial<EventSubmission> = {}): EventSubmission => ({
  title: "Sarau de outubro",
  startsAt: "2026-10-10T23:00:00.000Z",
  endsAt: null,
  venue: "Teatro Zulmira Canavarros",
  neighborhood: null,
  priceCents: null,
  ageRating: "livre",
  link: null,
  description: "Poesia e música ao vivo.",
  contactEmail: "leitor@example.com",
  ...over,
});
const ctx = (over: Partial<AutoApproveContext> = {}): AutoApproveContext => ({
  knownVenues: ["Teatro Zulmira Canavarros", "Arena Pantanal"],
  submittedTodayByUser: 0,
  now: NOW,
  ...over,
});

describe("canAutoApproveEvent (A14)", () => {
  it("data futura, local conhecido, sem link nem palavrão e dentro do limite: aprova", () => {
    expect(canAutoApproveEvent(submission(), ctx())).toBe(true);
  });

  it("data passada vai para humano", () => {
    expect(autoApproveReasons(submission({ startsAt: "2026-10-01T10:00:00Z" }), ctx())).toEqual([
      "past_date",
    ]);
    expect(canAutoApproveEvent(submission({ startsAt: NOW.toISOString() }), ctx())).toBe(false);
  });

  it("local desconhecido vai para humano; compara sem acento nem caixa", () => {
    expect(autoApproveReasons(submission({ venue: "Bar do Zé" }), ctx())).toEqual([
      "unknown_venue",
    ]);
    expect(canAutoApproveEvent(submission({ venue: "arena  PANTANAL" }), ctx())).toBe(true);
    expect(canAutoApproveEvent(submission({ venue: "teatro zulmira canavarros" }), ctx())).toBe(
      true,
    );
  });

  it("link vai para humano: campo preenchido ou endereço no texto", () => {
    expect(autoApproveReasons(submission({ link: "https://x.example/e" }), ctx())).toEqual([
      "has_link",
    ]);
    expect(
      canAutoApproveEvent(submission({ description: "Ingressos em www.ingresso.com.br" }), ctx()),
    ).toBe(false);
    expect(canAutoApproveEvent(submission({ description: "Veja em bit.ly/abc123" }), ctx())).toBe(
      false,
    );
    expect(canAutoApproveEvent(submission({ title: "Show em sympla.com" }), ctx())).toBe(false);
  });

  it("palavrão vai para humano", () => {
    expect(
      autoApproveReasons(submission({ description: "Festa do caralho com muita música" }), ctx()),
    ).toEqual(["profanity"]);
    expect(canAutoApproveEvent(submission({ title: "Baile da PUTARIA" }), ctx())).toBe(false);
  });

  it("limite diário: a partir da 4ª sugestão do mesmo leitor vai para humano", () => {
    expect(DAILY_SUBMISSION_LIMIT).toBe(3);
    expect(canAutoApproveEvent(submission(), ctx({ submittedTodayByUser: 2 }))).toBe(true);
    expect(autoApproveReasons(submission(), ctx({ submittedTodayByUser: 3 }))).toEqual([
      "daily_limit",
    ]);
  });

  it("junta todos os motivos", () => {
    expect(
      autoApproveReasons(
        submission({ startsAt: "2026-09-01T10:00:00Z", venue: "Local novo", link: "https://a.b" }),
        ctx({ submittedTodayByUser: 5 }),
      ),
    ).toEqual(["past_date", "unknown_venue", "has_link", "daily_limit"]);
  });

  it("sem local conhecido na agenda, nada entra sozinho", () => {
    expect(canAutoApproveEvent(submission(), ctx({ knownVenues: [] }))).toBe(false);
  });
});
