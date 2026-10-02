import { describe, expect, it } from "vitest";
import type { AnonProfile, LocalAlert } from "@/lib/anon/types";
import { targetsFromProfile } from "./targets";

const f = (kind: AnonProfile["follows"][number]["kind"], id: string) => ({
  kind,
  id,
  at: "2026-09-28T00:00:00Z",
});
const alert = (
  kind: LocalAlert["kind"],
  target: string,
  channel: LocalAlert["channel"],
  status: LocalAlert["status"] = "active",
): LocalAlert => ({
  id: `${kind}:${target}`,
  kind,
  target,
  label: target,
  frequency: "immediate",
  channel,
  status,
  at: "2026-09-28T00:00:00Z",
});

describe("targetsFromProfile", () => {
  it("alvos só de escolhas explícitas", () => {
    expect(
      targetsFromProfile({
        follows: [
          f("source", "mt-agora"),
          f("collection", "c1"),
          f("section", "cidade"),
          f("topic", "seca"),
        ],
        alerts: [
          alert("bairro", "cpa", "browser"),
          alert("tema", "esportes", "email"),
          alert("urgentes", "", "browser"),
          alert("agenda", "x", "browser"),
          alert("assunto", "chuva", "browser"),
          alert("bairro", "porto", "browser", "pending_email"),
        ],
      }),
    ).toEqual(["source:mt-agora", "section:cidade", "topic:seca", "bairro:cpa", "topic:chuva"]);
  });
  it("sem repetição, sem slug inválido, no máximo 200", () => {
    const many = Array.from({ length: 250 }, (_, i) => f("topic", `t${i}`));
    expect(
      targetsFromProfile({
        follows: [...many, f("topic", "t1"), f("source", "Maiúscula")],
        alerts: [],
      }),
    ).toHaveLength(200);
  });
});
