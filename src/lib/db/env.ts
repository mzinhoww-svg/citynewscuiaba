/**
 * Leitura preguiçosa das variáveis do Supabase. Nada aqui lança no import: o build de produção
 * sem variáveis precisa passar (P0 Review Focus 5). O erro só aparece ao criar um cliente.
 * `NEXT_PUBLIC_*` é lido por nome literal para o Next embutir o valor no bundle do navegador.
 */
export class SupabaseEnvError extends Error {
  constructor(missing: string[]) {
    super(`Supabase não configurado: defina ${missing.join(", ")} (veja .env.example).`);
    this.name = "SupabaseEnvError";
  }
}

export function publicSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter((name): name is string => typeof name === "string");
  if (!url || !anonKey) throw new SupabaseEnvError(missing);
  return { url, anonKey };
}

export function serviceSupabaseEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((name): name is string => typeof name === "string");
  if (!url || !serviceRoleKey) throw new SupabaseEnvError(missing);
  return { url, serviceRoleKey };
}
