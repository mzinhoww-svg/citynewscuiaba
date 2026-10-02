import { describe, expect, it } from "vitest";
import { invitePending } from "./invites";

const NOW = new Date("2026-09-30T12:00:00Z");
const base = {
  accepted_at: null,
  revoked_at: null,
  expires_at: "2026-10-05T12:00:00Z",
};

describe("convite pendente (A01 e A02)", () => {
  it("vale só sem aceite, sem revogação e dentro do prazo", () => {
    expect(invitePending(base, NOW)).toBe(true);
    expect(invitePending({ ...base, accepted_at: "2026-09-29T10:00:00Z" }, NOW)).toBe(false);
    expect(invitePending({ ...base, revoked_at: "2026-09-30T00:00:00Z" }, NOW)).toBe(false);
    expect(invitePending({ ...base, expires_at: "2026-09-30T11:59:59Z" }, NOW)).toBe(false);
  });
});
