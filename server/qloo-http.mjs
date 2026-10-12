import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createQlooClient, QlooError } from "./qloo-client.mjs";

export function createQlooServer({ apiKey, origin = "http://127.0.0.1:5181", fetchImpl } = {}) {
  const client = createQlooClient({ apiKey, fetchImpl });
  // Local development only. A deployed service needs its own abuse controls.
  let inFlight = 0;
  return createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: "ORIGIN_DENIED" });
    if (req.headers["sec-fetch-site"] === "cross-site") return send(403, { error: "ORIGIN_DENIED" });
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/qloo/status" && req.method === "GET") {
      return send(200, { configured: Boolean(apiKey), liveVerified: false });
    }
    if (req.method !== "POST") return send(405, { error: "METHOD_NOT_ALLOWED" });
    if (!["/api/qloo/search", "/api/qloo/insights"].includes(url.pathname)) return send(404, { error: "NOT_FOUND" });
    if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { error: "JSON_REQUIRED" });
    if (inFlight >= 2) return send(429, { error: "BUSY" });
    inFlight += 1;
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 4096) throw new QlooError("BODY_TOO_LARGE", 413);
      }
      let input;
      try { input = JSON.parse(raw); } catch { throw new QlooError("INVALID_JSON"); }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new QlooError("INVALID_INPUT");
      const result = url.pathname.endsWith("/search") ? await client.search(input.query) : await client.insights(input);
      send(200, result);
    } catch (error) {
      send(error instanceof QlooError ? error.status : 500, { error: error instanceof QlooError ? error.code : "INTERNAL_ERROR" });
    } finally { inFlight -= 1; }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createQlooServer({ apiKey: process.env.QLOO_API_KEY, origin: process.env.QLOO_ALLOWED_ORIGIN })
    .listen(5182, "127.0.0.1", () => console.log("Qloo development API: http://127.0.0.1:5182"));
}
