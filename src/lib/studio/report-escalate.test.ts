import {
  ESCALATION_THRESHOLD,
  ESCALATION_WINDOW_HOURS,
  escalationStep,
  type EscalationReport,
} from "./report-escalate";

const NOW = new Date("2026-10-03T15:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const report = (over: Partial<EscalationReport> = {}): EscalationReport => ({
  kind: "wrong_info",
  status: "open",
  createdAt: hoursAgo(1),
  ...over,
});
const fresh = { hasOpen: false, lastResolvedAt: null };

describe("escalationStep (espelha report_escalate no banco)", () => {
  it("o limite é 3 denúncias em 24 h", () => {
    expect(ESCALATION_THRESHOLD).toBe(3);
    expect(ESCALATION_WINDOW_HOURS).toBe(24);
  });

  it("2 denúncias não escalam", () => {
    expect(escalationStep([report(), report()], NOW, fresh)).toBe("below");
  });

  it("a 3ª escala (urgência e banner)", () => {
    expect(escalationStep([report(), report(), report()], NOW, fresh)).toBe("escalate");
  });

  it("a 4ª não duplica: já há item aberto", () => {
    expect(
      escalationStep([report(), report(), report(), report()], NOW, {
        hasOpen: true,
        lastResolvedAt: null,
      }),
    ).toBe("already_open");
  });

  it("denúncia fora das 24 h, respondida ou de direito de resposta não conta", () => {
    const reports = [
      report({ createdAt: hoursAgo(25) }),
      report({ status: "answered" }),
      report({ kind: "right_of_reply" }),
      report(),
    ];
    expect(escalationStep(reports, NOW, fresh)).toBe("below");
  });

  it("depois da resolução humana só denúncias novas contam", () => {
    const reports = [
      report({ createdAt: hoursAgo(5) }),
      report({ createdAt: hoursAgo(4) }),
      report(),
    ];
    expect(escalationStep(reports, NOW, { hasOpen: false, lastResolvedAt: hoursAgo(3) })).toBe(
      "below",
    );
    expect(escalationStep(reports, NOW, { hasOpen: false, lastResolvedAt: hoursAgo(6) })).toBe(
      "escalate",
    );
  });
});
