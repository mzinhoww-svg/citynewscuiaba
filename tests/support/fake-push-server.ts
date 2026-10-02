// Servidor de push falso (spec §16): HTTP em 127.0.0.1 numa porta livre, responde por sufixo
// de caminho (201 padrão; 404/410/429/500/403/413 conforme `respond`) e decifra aes128gcm com o
// par ECDH gerado pelo teste. Nunca sai para a rede; nada aqui existe em produção.
import { createECDH, type ECDH } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// http_ece é dependência do web-push (aes128gcm).
const ece = require("http_ece") as {
  decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer;
};

export interface Received {
  path: string;
  headers: Record<string, string>;
  body: Buffer;
}

export interface FakePushServer {
  origin: string;
  /** `127.0.0.1:<porta>` para PUSH_ENDPOINT_TEST_HOSTS. */
  host: string;
  received: Received[];
  respond(pathSuffix: string, status: number, headers?: Record<string, string>): void;
  decrypt(body: Buffer, keys: { privateKey: ECDH; auth: Buffer }): Promise<unknown>;
  close(): Promise<void>;
}

/** Par de chaves de um "navegador": p256dh e auth em base64url como o PushManager devolve. */
export function browserKeys(): { privateKey: ECDH; auth: Buffer; p256dh: string; authB64: string } {
  const privateKey = createECDH("prime256v1");
  privateKey.generateKeys();
  const auth = Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
  return {
    privateKey,
    auth,
    p256dh: privateKey.getPublicKey().toString("base64url"),
    authB64: auth.toString("base64url"),
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function startFakePushServer(): Promise<FakePushServer> {
  const rules = new Map<string, { status: number; headers: Record<string, string> }>();
  const received: Received[] = [];
  const server: Server = createServer(async (req, res) => {
    const body = await readBody(req);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers))
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : (v ?? "");
    const path = req.url ?? "/";
    received.push({ path, headers, body });
    let rule: { status: number; headers: Record<string, string> } | undefined;
    for (const [suffix, r] of rules) if (path.endsWith(suffix)) rule = r;
    res.writeHead(rule?.status ?? 201, rule?.headers ?? {});
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    host: `127.0.0.1:${port}`,
    received,
    respond(suffix, status, headers = {}) {
      rules.set(suffix, { status, headers });
    },
    async decrypt(body, keys) {
      const plain = ece.decrypt(body, {
        version: "aes128gcm",
        privateKey: keys.privateKey,
        authSecret: keys.auth.toString("base64url"),
      });
      return JSON.parse(plain.toString("utf8"));
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
