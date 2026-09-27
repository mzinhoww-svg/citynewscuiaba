// Proxy mínimo que imita o gateway do Supabase: /rest/v1 → PostgREST, /auth/v1 → Auth.
import http from "node:http";

const [port, restPort, authPort] = process.argv.slice(2).map(Number);
const routes = [
  ["/rest/v1", restPort],
  ["/auth/v1", authPort],
];
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "content-range, x-total-count",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    const url = req.url ?? "/";
    const route = routes.find(([p]) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"));
    if (!route) {
      res.writeHead(404, { "content-type": "application/json", ...cors });
      return res.end(JSON.stringify({ message: "rota não emulada na pilha local", path: url }));
    }
    const [prefix, target] = route;
    const path = url.slice(prefix.length) || "/";
    const headers = { ...req.headers, host: `127.0.0.1:${target}` };
    const upstream = http.request({ host: "127.0.0.1", port: target, method: req.method, path, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
      up.pipe(res);
    });
    upstream.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ message: `upstream indisponível: ${e.message}` }));
    });
    req.pipe(upstream);
  })
  .listen(port, "127.0.0.1", () => console.log(`proxy supabase local em :${port}`));
