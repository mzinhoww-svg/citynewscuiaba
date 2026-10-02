import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Caixa de saída do Auth nos testes: `.local/mail` na pilha sem Docker (smtp-sink.mjs) ou o
 * Mailpit do `supabase start` (CI, porta 54324). Devolve o primeiro link do último e-mail para
 * o endereço, ou `null` quando não há caixa disponível (o teste pula a parte do link).
 */
const LOCAL_DIR = join(process.cwd(), ".local", "mail");
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

function decode(raw: string): string {
  const qp = raw
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return qp.replace(/&amp;/g, "&");
}

function linkIn(html: string): string | null {
  return html.match(/href="(http[^"]+verify[^"]+)"/)?.[1] ?? null;
}

export function hasMailbox(): boolean {
  return existsSync(LOCAL_DIR);
}

export async function lastLinkFor(email: string, timeoutMs = 10_000): Promise<string | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (existsSync(LOCAL_DIR)) {
      const files = readdirSync(LOCAL_DIR)
        .map((f) => join(LOCAL_DIR, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      for (const f of files.slice(0, 50)) {
        const raw = readFileSync(f, "utf8");
        if (!raw.includes(email)) continue;
        return linkIn(decode(raw));
      }
    } else {
      try {
        const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=to:${email}`)).json()) as {
          messages?: { ID: string }[];
        };
        const id = list.messages?.[0]?.ID;
        if (id) {
          const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
            HTML?: string;
          };
          return linkIn((msg.HTML ?? "").replace(/&amp;/g, "&"));
        }
      } catch {
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
