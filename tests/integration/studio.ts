// Apoio dos testes de integração do Estúdio: executa Server Actions de domínio como um usuário
// de seed (JWT real, RLS valendo) e lê o que ficou no banco com o service role.
import { createClient } from "@supabase/supabase-js";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { ROLES, type Role, type RoleGrant } from "@/lib/auth/permissions";
import { runWithStudioContext, type StudioContext } from "@/lib/studio/context";

const SEED_PASSWORD = "citynews-local-123";

export const SEED_USERS = {
  helena: { id: "c1000000-0000-4000-8000-000000000001", email: "helena.costa@citynews.local" },
  marina: { id: "c1000000-0000-4000-8000-000000000002", email: "marina.arruda@citynews.local" },
  otavio: { id: "c1000000-0000-4000-8000-000000000003", email: "otavio.reis@citynews.local" },
  juliana: { id: "c1000000-0000-4000-8000-000000000004", email: "juliana.campos@citynews.local" },
  rafael: { id: "c1000000-0000-4000-8000-000000000005", email: "rafael.siqueira@citynews.local" },
  beatriz: { id: "c1000000-0000-4000-8000-000000000006", email: "beatriz.lemos@citynews.local" },
  diego: { id: "c1000000-0000-4000-8000-000000000007", email: "diego.prado@citynews.local" },
  thiago: { id: "c1000000-0000-4000-8000-000000000008", email: "thiago.moraes@citynews.local" },
  carlos: { id: "c1000000-0000-4000-8000-000000000009", email: "carlos.nunes@citynews.local" },
  paulo: { id: "c1000000-0000-4000-8000-000000000010", email: "paulo.rezende@citynews.local" },
} as const;
export type SeedUser = keyof typeof SEED_USERS;

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);
const clients = new Map<SeedUser, Promise<{ db: DbClient; roles: RoleGrant[] }>>();

function signIn(user: SeedUser) {
  const cached = clients.get(user);
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ready = (async () => {
    const r = await db.auth.signInWithPassword({
      email: SEED_USERS[user].email,
      password: SEED_PASSWORD,
    });
    if (r.error) throw r.error;
    const { data } = await db
      .from("user_roles")
      .select("role, sections")
      .eq("user_id", SEED_USERS[user].id);
    const roles = (data ?? [])
      .filter((row) => isRole(row.role))
      .map((row) => ({ role: row.role, sections: row.sections }));
    return { db, roles };
  })();
  clients.set(user, ready);
  return ready;
}

export interface AsUserOptions {
  revalidate?: StudioContext["revalidate"];
  now?: () => Date;
  mediaStore?: StudioContext["mediaStore"];
}

/** Cliente PostgREST com a sessão de um usuário de seed (chamada direta, sem Server Action). */
export async function clientOf(user: SeedUser): Promise<DbClient> {
  return (await signIn(user)).db;
}

/** Roda `fn` com a sessão de um usuário de seed no contexto do Estúdio. */
export async function asUser<T>(
  user: SeedUser,
  fn: () => Promise<T>,
  options: AsUserOptions = {},
): Promise<T> {
  const { db, roles } = await signIn(user);
  return runWithStudioContext(
    {
      session: { userId: SEED_USERS[user].id, email: SEED_USERS[user].email, roles },
      db,
      revalidate: options.revalidate ?? (async () => {}),
      now: options.now ?? (() => new Date()),
      ...(options.mediaStore ? { mediaStore: options.mediaStore } : {}),
    },
    fn,
  );
}

export const service = createServiceClient();

/** Última linha do audit_log (opcionalmente de um ator). */
export async function lastAudit(actor?: string) {
  let q = service.from("audit_log").select("*").order("id", { ascending: false }).limit(1);
  if (actor) q = q.eq("actor", actor);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0] ?? null;
}
