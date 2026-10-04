import { describe, expect, it } from "vitest";
import { createFakeSender } from "@/lib/push/fake-sender";
import { dispatchStaffUrgent, staffPayload, type StaffPushPort, type UrgentDue } from "./push";

const ID = "11111111-2222-4333-8444-555555555555";
const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, p256dh: "p", auth: "a" });

function port(due: UrgentDue[]) {
  const calls = { sweep: 0, done: [] as string[][] };
  const p: StaffPushPort = {
    async sweep() {
      calls.sweep++;
    },
    async due() {
      return due;
    },
    async done(ids) {
      calls.done.push(ids);
    },
  };
  return { p, calls };
}

describe("push de urgências da equipe", () => {
  it("payload leva título, texto, caminho interno e a tag da notificação", () => {
    const pl = staffPayload({
      id: ID,
      title: "Disjuntor aberto",
      body: "Veja",
      href: "/estudio/control",
    });
    expect(pl).toMatchObject({ v: 1, t: "Disjuntor aberto", u: "/estudio/control", s: ID });
    expect(pl?.g).toHaveLength(32);
  });

  it("href fora do Estúdio vira a central (nunca URL externa)", () => {
    expect(staffPayload({ id: ID, title: "x", body: "", href: "https://evil.test" })?.u).toBe(
      "/estudio/notificacoes",
    );
  });

  it("envia a cada inscrição, marca como tratado e roda a varredura", async () => {
    const sender = createFakeSender();
    const { p, calls } = port([
      {
        id: ID,
        title: "Urgente",
        body: "corpo",
        href: "/estudio/denuncias",
        subs: [sub(1), sub(2)],
      },
    ]);
    const r = await dispatchStaffUrgent(p, sender, new Date());
    expect(r).toEqual({ notifications: 1, attempted: 2, accepted: 2 });
    expect(sender.sent.map((s) => s.endpoint)).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(sender.sent[0]!.headers).toMatchObject({ Urgency: "high" });
    expect(calls.sweep).toBe(1);
    expect(calls.done).toEqual([[ID]]);
  });

  it("sem ninguém que optou, não envia nada mas marca como tratado", async () => {
    const sender = createFakeSender();
    const { p, calls } = port([{ id: ID, title: "Urgente", body: "", href: "/estudio", subs: [] }]);
    const r = await dispatchStaffUrgent(p, sender, new Date());
    expect(r.attempted).toBe(0);
    expect(sender.sent).toHaveLength(0);
    expect(calls.done).toEqual([[ID]]);
  });

  it("falha numa inscrição não derruba as outras e o despacho nunca lança", async () => {
    const sender = createFakeSender();
    let n = 0;
    sender.send = async () => {
      if (n++ === 0) throw new Error("boom");
      return { kind: "accepted" };
    };
    const { p } = port([
      { id: ID, title: "U", body: "", href: "/estudio", subs: [sub(1), sub(2)] },
    ]);
    expect(await dispatchStaffUrgent(p, sender, new Date())).toMatchObject({ accepted: 1 });
    const broken: StaffPushPort = {
      sweep: async () => {
        throw new Error("db fora");
      },
      due: async () => [],
      done: async () => {},
    };
    await expect(dispatchStaffUrgent(broken, sender, new Date())).resolves.toMatchObject({
      notifications: 0,
    });
  });
});
