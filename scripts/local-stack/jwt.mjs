// Gera as chaves anon e service_role (HS256) da pilha local. Só para desenvolvimento.
import { createHmac } from "node:crypto";

const secret = process.argv[2];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};
const exp = 1983812996; // 2032
console.log(`ANON_KEY=${sign({ iss: "supabase-demo", role: "anon", exp })}`);
console.log(`SERVICE_ROLE_KEY=${sign({ iss: "supabase-demo", role: "service_role", exp })}`);
