// Servidor de push falso para o e2e (spec 2026-09-28 §16; G15/G16): HTTP em 127.0.0.1 numa porta
// fixa (base + 2), conhecida pelo `webServer` via PUSH_ENDPOINT_TEST_HOSTS. Responde 201 a tudo e
// guarda o que recebeu em memória; os specs consultam por `GET /__received`.
import { createServer, type IncomingMessage, type Server } from "node:http";

export function fakePushPort(base: number): number {
  return base + 2;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

let server: Server | null = null;

export default async function globalSetup() {
  const port = Number(process.env.CN_FAKE_PUSH_PORT ?? 0);
  if (!port) return;
  const received: {
    path: string;
    headers: Record<string, string | string[] | undefined>;
    bytes: number;
    at: string;
  }[] = [];
  server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/__received") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(received));
      return;
    }
    if (req.method === "DELETE" && req.url === "/__received") {
      received.length = 0;
      res.writeHead(204);
      res.end();
      return;
    }
    const body = await readBody(req);
    received.push({
      path: req.url ?? "/",
      headers: req.headers,
      bytes: body.length,
      at: new Date().toISOString(),
    });
    res.writeHead(201);
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", resolve);
  });
  return async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  };
}
