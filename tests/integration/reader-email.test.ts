// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { createEmailAlert } from "@/lib/alerts/email";
import { createServiceClient } from "@/lib/db/client";
import { listAlertItems } from "@/lib/db/queries";
import {
  confirmEmailAlerts,
  confirmNewsletter,
  getNewsletterPrefs,
  queueReaderEmail,
  saveEmailAlert,
  saveNewsletterLists,
  setNewsletterPrefs,
} from "@/lib/db/writes";
import { signedLink } from "@/lib/newsletter/server";
import { subscribeNewsletter } from "@/lib/newsletter/subscribe";
import { verifyNewsletterToken } from "@/lib/newsletter/token";
import { ok } from "@/lib/result";

/* Newsletter, fila de e-mails para leitores (0012_reader_email) e alertas por e-mail (P2-T9). */
const db = createServiceClient();
const tag = `it-${Date.now()}`;
const email = `${tag}@exemplo.com`;
const ALL = ["diaria", "agenda-fds", "politica-semana"] as const;

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

afterAll(async () => {
  await db.from("newsletter_subscriptions").delete().eq("email", email);
  await db.from("reader_emails").delete().eq("to_email", email);
  await db.from("alerts").delete().eq("owner_ref", `email:${email}`);
});

describe("newsletter sem conta", () => {
  it("inscreve pendente, confirma pelo link, muda e sai", async () => {
    expect(value(await saveNewsletterLists(email, ["diaria", "agenda-fds"]))).toEqual({
      alreadyActive: [],
    });
    expect(value(await getNewsletterPrefs(email)).every((p) => p.state === "pending")).toBe(true);
    value(await confirmNewsletter(email, ["diaria", "agenda-fds"]));
    expect(value(await saveNewsletterLists(email, ["diaria"]))).toEqual({
      alreadyActive: ["diaria"],
    });
    value(await setNewsletterPrefs(email, ["politica-semana"], ALL));
    const prefs = new Map(value(await getNewsletterPrefs(email)).map((p) => [p.list, p.state]));
    expect(prefs.get("politica-semana")).toBe("active");
    expect(prefs.get("diaria")).toBe("off");
    // Quem saiu e se inscreve de novo volta a ficar pendente (confirmação dupla de novo).
    value(await saveNewsletterLists(email, ["diaria"]));
    const again = new Map(value(await getNewsletterPrefs(email)).map((p) => [p.list, p.state]));
    expect(again.get("diaria")).toBe("pending");
  });

  it("fila de e-mails: grava queued e não repete em 10 min", async () => {
    const mail = {
      kind: "newsletter_confirm" as const,
      to: email,
      subject: "s",
      body: "b",
      ref: "lists:diaria",
    };
    value(await queueReaderEmail(mail));
    value(await queueReaderEmail(mail));
    const { data } = await db.from("reader_emails").select("status").eq("to_email", email);
    expect(data).toEqual([{ status: "queued" }]);
  });

  it("anon não lê a fila de e-mails nem as inscrições", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const r = await anon.from("reader_emails").select("id").limit(1);
    expect(r.data ?? []).toEqual([]);
  });
});

describe("alerta por e-mail", () => {
  it("nasce inativo e só o link do mesmo e-mail ativa", async () => {
    const { id } = value(
      await saveEmailAlert({ email, targetKind: "bairro", targetId: "cpa", frequency: "daily" }),
    );
    expect(value(await confirmEmailAlerts("outra@exemplo.com", [id]))).toBe(0);
    expect(value(await confirmEmailAlerts(email, [id]))).toBe(1);
    const { data } = await db.from("alerts").select("active, channel").eq("id", id).single();
    expect(data).toEqual({ active: true, channel: "email" });
  });
});

describe("dedupe por alvo (gate P2, I4)", () => {
  const two = `${tag}-dois@exemplo.com`;
  afterAll(async () => {
    await db.from("reader_emails").delete().eq("to_email", two);
    await db.from("alerts").delete().eq("owner_ref", `email:${two}`);
    await db.from("newsletter_subscriptions").delete().eq("email", two);
  });
  const token = (body: string) => decodeURIComponent(/token=([^&\s]+)/.exec(body)?.[1] ?? "");

  it("dois alertas em 10 min: cada um recebe o próprio link e os dois são confirmados", async () => {
    const deps = {
      allow: async () => ok(true),
      save: saveEmailAlert,
      queue: queueReaderEmail,
      link: (e: string, id: string) =>
        signedLink("alert", "/alertas/confirmar", e, [`alert:${id}`]),
      resolveLabel: async (kind: string) => (kind === "bairro" ? "CPA" : "Todas as urgentes"),
    };
    for (const a of [
      { kind: "bairro", target: "cpa" },
      { kind: "urgentes", target: "todos" },
    ])
      expect((await createEmailAlert({ ...a, email: two, frequency: "daily" }, deps)).status).toBe(
        "pending",
      );
    const { data: mails } = await db
      .from("reader_emails")
      .select("body")
      .eq("to_email", two)
      .eq("kind", "alert_confirm");
    expect(mails).toHaveLength(2);
    let confirmed = 0;
    for (const m of mails ?? []) {
      const v = verifyNewsletterToken(token(m.body), "alert");
      if (!v.ok) throw new Error(v.error);
      const ids = v.value.lists.map((l) => l.slice("alert:".length));
      confirmed += value(await confirmEmailAlerts(v.value.email, ids));
    }
    expect(confirmed).toBe(2);
    const { data: alerts } = await db
      .from("alerts")
      .select("active")
      .eq("owner_ref", `email:${two}`);
    expect(alerts?.every((a) => a.active)).toBe(true);
  });

  it("duas listas em 10 min: cada uma recebe a própria confirmação", async () => {
    const deps = {
      allow: async () => ok(true),
      save: saveNewsletterLists,
      queue: queueReaderEmail,
      link: (e: string, lists: string[]) =>
        signedLink("newsletter", "/newsletter/preferencias", e, lists, "&confirmar=1"),
    };
    for (const list of ["diaria", "agenda-fds"]) {
      const f = new FormData();
      f.set("email", two);
      f.append("lists", list);
      expect((await subscribeNewsletter(f, deps)).status).toBe("success");
    }
    const { data } = await db
      .from("reader_emails")
      .select("id")
      .eq("to_email", two)
      .eq("kind", "newsletter_confirm");
    expect(data).toHaveLength(2);
  });
});

describe("novidades para alertas de navegador", () => {
  it("traz matérias públicas com bairros e assunto público, nunca assunto interno", async () => {
    const items = value(await listAlertItems(new Date(0), new Date("2026-09-28T12:00:00Z")));
    for (const i of items) {
      expect(i.href).toMatch(/^\/(materia|agenda)\//);
      expect(i.topicSlug ?? "").not.toMatch(/^apuracao-/);
    }
  });
});
