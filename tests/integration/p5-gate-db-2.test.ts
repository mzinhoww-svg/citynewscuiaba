// @vitest-environment node
// Gate do P5 (docs/reports/P5-gate-review.md), achados de banco, parte 2: 0048_p5_gate_fixes.sql.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Json } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { clientOf, SEED_USERS, service } from "./studio";

const run = Date.now() % 1_000_000;
const PASSWORD = "senha-de-teste-123";
const RULES_BODY = DEFAULT_RULES as unknown as NonNullable<Json>;
const createdUsers: string[] = [];
const weightsVersions: string[] = [];
const auditMarkers: string[] = [];

afterAll(async () => {
  await service
    .from("rules")
    .delete()
    .eq("version", 6_900_000 + (run % 1000));
  if (weightsVersions.length)
    await service.from("rec_weights").delete().in("version", weightsVersions);
  for (const id of createdUsers) {
    await service.from("staff_invites").delete().eq("user_id", id);
    await service.from("user_roles").delete().eq("user_id", id);
    await service.from("profiles").delete().eq("id", id);
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
  await service.from("articles").delete().like("slug", `gate-merge-${run}%`);
  await service.from("app_settings").update({ value: 90 }).eq("key", "security.retention_days");
});

async function newUser(label: string) {
  const email = `gate-${label}-${randomUUID().slice(0, 8)}@exemplo.com`;
  const u = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (u.error) throw u.error;
  const id = u.data.user.id;
  createdUsers.push(id);
  const p = await service
    .from("profiles")
    .upsert({ id, display_name: label }, { onConflict: "id" });
  if (p.error) throw p.error;
  return { id, email };
}

function anon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

describe("achado 7 · Segurança nas regras (A4: a v3 do dono libera a proposta)", () => {
  it("versão nova com `seguranca` em auto é aceita como proposta inativa (ativação segue com duas pessoas)", async () => {
    const body = {
      ...DEFAULT_RULES,
      categories: {
        ...DEFAULT_RULES.categories,
        seguranca: { ...DEFAULT_RULES.categories.seguranca!, mode: "auto" },
      },
    } as unknown as NonNullable<Json>;
    const version = 6_900_000 + (run % 1000);
    const s = await service
      .from("rules")
      .insert({ version, body, force_review: true, proposed_by: SEED_USERS.marina.id });
    expect(s.error).toBeNull();
    const active = await service
      .from("rules")
      .update({ active: true, approved_by: SEED_USERS.marina.id })
      .eq("version", version);
    expect(active.error).not.toBeNull();
  });
});

describe("achado 8 · mesclar tag de tema sensível", () => {
  it("recusa tirar `crime` do conjunto sensível; mescla tag comum e sensível em sensível", async () => {
    const marina = await clientOf("marina");
    const bad = await marina.rpc("taxonomy_merge_tags", { p_from: "crime", p_into: "cidade" });
    expect(bad.error?.message).toMatch(/sens/);
    const bad2 = await marina.rpc("taxonomy_merge_tags", {
      p_from: "Crimes",
      p_into: "noticias-gerais",
    });
    expect(bad2.error?.message).toMatch(/sens/);
    const okSensitive = await marina.rpc("taxonomy_merge_tags", {
      p_from: `crime-gate-${run}`,
      p_into: "violencia",
    });
    expect(okSensitive.error).toBeNull();
    const okPlain = await marina.rpc("taxonomy_merge_tags", {
      p_from: `parque-gate-${run}`,
      p_into: "parques",
    });
    expect(okPlain.error).toBeNull();
  });
});

describe("achado 10 · máscara de IP e hash no banco", () => {
  it("leitura e editor_chefe não leem a tabela; a view mascara IP e oculta o hash; admin vê tudo", async () => {
    const marker = `gate-audit-${run}`;
    auditMarkers.push(marker);
    const ins = await service.from("audit_log").insert({
      actor: "system",
      action: "settings.update",
      object_ref: marker,
      details: {
        ip: "203.0.113.45",
        nested: { addr: "2001:db8:aa:bb::1", texto: "de 10.20.30.40 para casa" },
      },
      ip_hash: "hash-secreto",
    });
    expect(ins.error).toBeNull();
    const paulo = await clientOf("paulo"); // leitura
    expect(
      (await paulo.from("audit_log").select("id").eq("object_ref", marker)).data ?? [],
    ).toEqual([]);
    const marina = await clientOf("marina");
    expect(
      (await marina.from("audit_log").select("id").eq("object_ref", marker)).data ?? [],
    ).toEqual([]);

    for (const who of ["paulo", "marina", "diego"] as const) {
      const c = await clientOf(who);
      const v = await c.from("audit_log_view").select("details, ip_hash").eq("object_ref", marker);
      expect(v.error).toBeNull();
      expect(v.data).toHaveLength(1);
      expect(v.data![0]!.ip_hash).toBeNull();
      const text = JSON.stringify(v.data![0]!.details);
      expect(text).toContain("203.0.x.x");
      expect(text).toContain("10.20.x.x");
      expect(text).toContain("2001:db8:x:x");
      expect(text).not.toContain("203.0.113.45");
      expect(text).not.toContain("2001:db8:aa:bb::1");
    }

    const helena = await clientOf("helena");
    const full = await helena
      .from("audit_log_view")
      .select("details, ip_hash")
      .eq("object_ref", marker);
    expect(full.data![0]!.ip_hash).toBe("hash-secreto");
    expect(JSON.stringify(full.data![0]!.details)).toContain("203.0.113.45");
    const table = await helena.from("audit_log").select("ip_hash").eq("object_ref", marker);
    expect(table.data).toHaveLength(1);
  });

  it("quem não tem papel de auditoria não lê a view", async () => {
    const outsider = await newUser("sem-papel");
    const c = anon();
    await c.auth.signInWithPassword({ email: outsider.email, password: PASSWORD });
    const v = await c.from("audit_log_view").select("id").limit(1);
    expect(v.data ?? []).toEqual([]);
  });
});

describe("achado 14 · convite com aceite e prazo", () => {
  it("o primeiro acesso marca accepted_at; convite vencido perde o papel", async () => {
    const accepted = await newUser("aceita");
    await service
      .from("user_roles")
      .insert({ user_id: accepted.id, role: "leitura", sections: [] });
    await service.from("staff_invites").insert({
      user_id: accepted.id,
      email: accepted.email,
      role: "leitura",
      invited_by: SEED_USERS.helena.id,
    });
    const s = await anon().auth.signInWithPassword({ email: accepted.email, password: PASSWORD });
    expect(s.error).toBeNull();
    const row = await service
      .from("staff_invites")
      .select("accepted_at")
      .eq("user_id", accepted.id)
      .single();
    expect(row.data?.accepted_at).not.toBeNull();

    const ignored = await newUser("ignora");
    await service.from("user_roles").insert({ user_id: ignored.id, role: "leitura", sections: [] });
    await service.from("staff_invites").insert({
      user_id: ignored.id,
      email: ignored.email,
      role: "leitura",
      invited_by: SEED_USERS.helena.id,
      expires_at: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const sweep = await service.rpc("staff_invites_sweep");
    expect(sweep.error).toBeNull();
    expect(sweep.data).toBeGreaterThanOrEqual(1);
    expect(
      (await service.from("user_roles").select("role").eq("user_id", ignored.id)).data,
    ).toEqual([]);
    const inv = await service
      .from("staff_invites")
      .select("revoked_at, accepted_at")
      .eq("user_id", ignored.id)
      .single();
    expect(inv.data?.revoked_at).not.toBeNull();
    expect(inv.data?.accepted_at).toBeNull();
    expect(
      (await service.from("user_roles").select("role").eq("user_id", accepted.id)).data,
    ).toHaveLength(1);
  });
});

describe("achado 21 · CHECK dos pesos de recomendação", () => {
  const w = {
    popularity: 0.35,
    individual: 0.25,
    recency: 0.15,
    engagement: 0.1,
    operational: 0.1,
    diversity: 0.05,
  };
  const insert = async (version: string, weights: NonNullable<Json>, cap = 0.25) => {
    weightsVersions.push(version);
    const c = await clientOf("diego");
    return c
      .from("rec_weights")
      .insert({ version, weights, cap, proposed_by: SEED_USERS.diego.id });
  };
  it("recusa soma diferente de 1, chave desconhecida, negativo e teto acima de 25 %", async () => {
    expect((await insert(`gate-${run}-soma`, { ...w, diversity: 0.04 })).error).not.toBeNull();
    expect(
      (await insert(`gate-${run}-x`, { ...w, popularity: 0.3, extra: 0.05 })).error,
    ).not.toBeNull();
    expect(
      (await insert(`gate-${run}-neg`, { ...w, popularity: 0.7, individual: -0.1 })).error,
    ).not.toBeNull();
    expect((await insert(`gate-${run}-cap`, w, 0.5)).error).not.toBeNull();
    expect((await insert(`gate-${run}-ok`, w, 0.25)).error).toBeNull();
    expect((await insert(`gate-${run}-tol`, { ...w, diversity: 0.0505 })).error).toBeNull();
  });
});

describe("achado 13 · publicidade em subeditoria proibida", () => {
  it("campanha em subeditoria de Política é recusada", async () => {
    const slug = `politica-gate-${run}`;
    await service.from("sections").insert({
      slug,
      name: "Política gate",
      parent_slug: "politica",
      autonomy_category: "politica",
    });
    try {
      const helena = await clientOf("helena");
      const base = {
        advertiser: "Anunciante Fictício",
        starts_on: "2026-10-01",
        ends_on: "2026-10-31",
        creative: { headline: "x", href: "https://exemplo.com" },
      };
      const r = await helena
        .from("sponsored_campaigns")
        .insert({ ...base, allowed_sections: [slug] });
      expect(r.error?.message).toMatch(/patrocinado/);
      const ok = await helena
        .from("sponsored_campaigns")
        .insert({ ...base, allowed_sections: ["cidade"] })
        .select("id")
        .single();
      expect(ok.error).toBeNull();
      await service.from("sponsored_campaigns").delete().eq("id", ok.data!.id);
    } finally {
      await service.from("sections").delete().eq("slug", slug);
    }
  });
});

describe("achado 2 · políticas de segurança aplicadas", () => {
  it("retenção tem teto de 90 dias e alimenta o cron; 2FA não pode ser ligado ainda", async () => {
    const helena = await clientOf("helena");
    const tooLong = await helena.rpc("app_setting_set", {
      p_key: "security.retention_days",
      p_value: 365,
    });
    expect(tooLong.error?.message).toMatch(/90/);
    const short = await helena.rpc("app_setting_set", {
      p_key: "security.retention_days",
      p_value: 45,
    });
    expect(short.error).toBeNull();
    expect((await service.rpc("security_retention_days")).data).toBe(45);
    const back = await helena.rpc("app_setting_set", {
      p_key: "security.retention_days",
      p_value: 90,
    });
    expect(back.error).toBeNull();
    const tfa = await helena.rpc("app_setting_set", {
      p_key: "security.require_2fa",
      p_value: true,
    });
    expect(tfa.error?.message).toMatch(/ainda não aplicado/);
    const cron = execFileSync(
      "psql",
      [
        process.env.SUPABASE_DB_URL!,
        "-At",
        "-c",
        "select command from cron.job where jobname = 'events-retention'",
      ],
      { encoding: "utf8" },
    );
    expect(cron).toContain("security_retention_days");
  });

  it("a duração da sessão é lida do banco (padrão 12 h)", async () => {
    const helena = await clientOf("helena");
    const r = await helena.rpc("security_session_hours");
    expect(r.error).toBeNull();
    expect(r.data).toBeGreaterThanOrEqual(1);
  });
});
