// Caixa de saída local do Auth (pilha sem Docker, A-017): SMTP mínimo que aceita tudo e grava
// cada mensagem em .local/mail/<data>-<n>.eml. Faz o papel do Inbucket/Mailpit do `supabase
// start`: link mágico, recuperação de senha e confirmação funcionam sem provedor de e-mail
// (B-005). Nada sai da máquina.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 2500);
const dir = process.argv[3] ?? join(process.cwd(), ".local", "mail");
mkdirSync(dir, { recursive: true });
let n = 0;

createServer((sock) => {
  let buf = "";
  let data = false;
  let body = [];
  let rcpt = [];
  const say = (line) => sock.write(`${line}\r\n`);
  say("220 citynews-local ESMTP");
  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") {
          data = false;
          const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${++n}.eml`;
          writeFileSync(join(dir, name), `X-Rcpt: ${rcpt.join(", ")}\r\n${body.join("\r\n")}\r\n`);
          body = [];
          rcpt = [];
          say("250 OK");
        } else body.push(line.startsWith("..") ? line.slice(1) : line);
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") {
        sock.write("250-citynews-local\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n");
      } else if (cmd === "HELO") say("250 citynews-local");
      else if (cmd === "RCPT") {
        rcpt.push(line.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, ""));
        say("250 OK");
      } else if (cmd === "DATA") {
        data = true;
        say("354 fim com <CRLF>.<CRLF>");
      } else if (cmd === "QUIT") {
        say("221 tchau");
        sock.end();
      } else say("250 OK");
    }
  });
  sock.on("error", () => {});
}).listen(port, "127.0.0.1", () => console.log(`smtp-sink em 127.0.0.1:${port} → ${dir}`));
