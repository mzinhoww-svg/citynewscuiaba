#!/usr/bin/env node
/**
 * Cadastra as peças da casa (ADS-T3) no banco: `--emit-sql` imprime o SQL idempotente (para
 * aplicar pelo painel ou pelo conector do Supabase); `--apply` grava com a chave de serviço do
 * ambiente. O endereço do site vem de `--base` ou de `APP_URL` e precisa ser https.
 *   node scripts/ads/house-ads.mjs --emit-sql --base https://citynewscuiaba.vercel.app
 */
import { createClient } from "@supabase/supabase-js";
import { houseAdRows, houseAdsSql } from "./creatives.mjs";

const args = process.argv.slice(2);
const base = args[args.indexOf("--base") + 1] && args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : process.env.APP_URL;
if (!base) throw new Error("informe --base https://… ou APP_URL");
const today = new Date().toISOString().slice(0, 10);

if (args.includes("--emit-sql")) {
  process.stdout.write(houseAdsSql(base, today));
} else if (args.includes("--apply")) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  let created = 0;
  for (const r of houseAdRows(base)) {
    const exists = await db.from("ad_creatives").select("id").eq("name", r.name).maybeSingle();
    if (exists.data) continue;
    const c = await db
      .from("ad_creatives")
      .insert({ slot: r.slot, name: r.name, creative: r.creative, status: "active" })
      .select("id")
      .single();
    if (c.error) throw c.error;
    const p = await db.from("ad_placements").insert({
      creative_id: c.data.id,
      slot: r.slot,
      starts_on: today,
      ends_on: "2099-12-31",
      status: "active",
    });
    if (p.error) throw p.error;
    created++;
  }
  console.log(`peças da casa: ${created} novas`);
} else {
  console.error("uso: house-ads.mjs --emit-sql | --apply [--base https://…]");
  process.exit(2);
}
