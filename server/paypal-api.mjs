import { randomUUID, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const MAX_DELIVERY_BYTES = 64 * 1024 * 1024;
const BASE = "https://api-m.sandbox.paypal.com";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const equal = (a, b) => { const x = Buffer.from(a || ""), y = Buffer.from(b || ""); return x.length === y.length && timingSafeEqual(x, y); };

// A single-process local sandbox service. Durable records preserve request IDs across retries.
export function createPayPalApi(env, { fetcher = fetch, file = resolve(".paypal-sandbox/orders.json") } = {}) {
  let queue = Promise.resolve();
  async function read() { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return {}; throw error; } }
  async function save(records) { await mkdir(dirname(file), { recursive: true, mode: 0o700 }); const temp = `${file}.tmp`; await writeFile(temp, JSON.stringify(records), { mode: 0o600 }); await rename(temp, file); }
  async function paypal(path, method = "GET", body, requestId) {
    if (!env.PAYPAL_SANDBOX_CLIENT_ID || !env.PAYPAL_SANDBOX_CLIENT_SECRET) throw new Error("notConfigured");
    const auth = await fetcher(`${BASE}/v1/oauth2/token`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${env.PAYPAL_SANDBOX_CLIENT_ID}:${env.PAYPAL_SANDBOX_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    if (!auth.ok) throw new Error("providerFailed");
    const token = (await auth.json()).access_token;
    if (typeof token !== "string" || !token) throw new Error("providerFailed");
    const response = await fetcher(`${BASE}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error("providerFailed");
    return response.json();
  }
  const publicRecord = (r) => ({ id: r.id, brief: r.brief, seconds: r.seconds, ratio: r.ratio, amount: r.amount, currency: "USD", status: r.status, orderId: r.orderId, approvalUrl: r.approvalUrl, captureId: r.captureId, delivery: r.delivery ? { name: r.delivery.name, bytes: r.delivery.bytes, mime: r.delivery.mime, sha256: r.delivery.sha256, createdAt: r.delivery.createdAt } : null });
  async function handle(request) {
    if (request.method !== "POST") return json({ error: "method" }, 405);
    if (!env.PAYPAL_ALLOWED_ORIGIN) return json({ error: "notConfigured" }, 503);
    if (request.headers.get("origin") !== env.PAYPAL_ALLOWED_ORIGIN) return json({ error: "forbidden" }, 403);
    const action = new URL(request.url).pathname.split("/").at(-1);
    if (action === "upload") {
      const records = await read(); const r = records[request.headers.get("x-commission-id")];
      if (!r || !equal(request.headers.get("authorization"), `Bearer ${r.token}`)) return json({ error: "unauthorized" }, 401);
      if (r.status !== "paid" || !r.captureId) return json({ error: "notApproved" }, 409);
      const mime = request.headers.get("content-type");
      if (!["video/mp4", "video/webm"].includes(mime)) return json({ error: "invalidVideo" }, 400);
      const bytes = Buffer.from(await request.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_DELIVERY_BYTES) return json({ error: "tooLarge" }, 413);
      const valid = mime === "video/mp4" ? bytes.subarray(4, 8).toString() === "ftyp" : bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      if (!valid) return json({ error: "invalidVideo" }, 400);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (r.delivery) return r.delivery.sha256 === sha256 ? json(publicRecord(r)) : json({ error: "alreadyDelivered" }, 409);
      let name;
      try { name = decodeURIComponent(request.headers.get("x-file-name") || "video"); } catch { return json({ error: "invalidRequest" }, 400); }
      name = name.split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160) || "video";
      const storageId = `${randomUUID()}.${mime === "video/mp4" ? "mp4" : "webm"}`;
      const directory = resolve(dirname(file), "deliveries");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(resolve(directory, storageId), bytes, { flag: "wx", mode: 0o600 });
      r.delivery = { storageId, name, bytes: bytes.length, mime, sha256, createdAt: new Date().toISOString() };
      await save(records); return json(publicRecord(r));
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "invalidRequest" }, 400);
    let data;
    try { const body = await request.text(); if (body.length > 8000) return json({ error: "invalidRequest" }, 400); data = JSON.parse(body); } catch { return json({ error: "invalidRequest" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "invalidRequest" }, 400);
    const records = await read();
    if (action === "quote") {
      if (typeof data.brief !== "string" || !data.brief.trim() || data.brief.length > 2000 || !Number.isInteger(data.seconds) || data.seconds < 5 || data.seconds > 180 || !["16:9", "9:16", "1:1", "4:5"].includes(data.ratio)) return json({ error: "invalidRequest" }, 400);
      const r = { id: randomUUID(), token: randomBytes(32).toString("hex"), brief: data.brief.trim(), seconds: data.seconds, ratio: data.ratio, amount: (10 + Math.ceil(data.seconds / 15) * 5).toFixed(2), status: "quoted", createKey: randomUUID(), captureKey: randomUUID() };
      records[r.id] = r; await save(records); return json({ ...publicRecord(r), token: r.token });
    }
    const r = records[data.id];
    if (!r || !equal(request.headers.get("authorization"), `Bearer ${r.token}`)) return json({ error: "unauthorized" }, 401);
    if (action === "download") {
      if (r.status !== "paid" || !r.delivery) return json({ error: "notDelivered" }, 409);
      if (!/^[a-f0-9-]{36}\.(mp4|webm)$/.test(r.delivery.storageId)) throw new Error("invalidStorage");
      const bytes = await readFile(resolve(dirname(file), "deliveries", r.delivery.storageId));
      if (createHash("sha256").update(bytes).digest("hex") !== r.delivery.sha256) throw new Error("invalidStorage");
      return new Response(bytes, { headers: { "Content-Type": r.delivery.mime, "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="delivery.${r.delivery.mime === "video/mp4" ? "mp4" : "webm"}"; filename*=UTF-8''${encodeURIComponent(r.delivery.name)}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (action === "status") return json(publicRecord(r));
    if (action === "create") {
      if (r.orderId) return json(publicRecord(r));
      const returnUrl = new URL("/paypal", env.PAYPAL_ALLOWED_ORIGIN).href;
      const order = await paypal("/v2/checkout/orders", "POST", { intent: "CAPTURE", purchase_units: [{ custom_id: r.id, description: "Timeline Studio video editing sandbox", amount: { currency_code: "USD", value: r.amount } }], payment_source: { paypal: { experience_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", return_url: returnUrl, cancel_url: `${returnUrl}?cancelled=1` } } } }, r.createKey);
      const link = order.links?.find((l) => ["payer-action", "approve"].includes(l.rel))?.href;
      const url = link && new URL(link);
      if (!/^[A-Z0-9]{10,32}$/.test(order.id || "") || !url || url.protocol !== "https:" || url.hostname !== "www.sandbox.paypal.com") throw new Error("providerFailed");
      r.orderId = order.id; r.approvalUrl = url.href; r.status = "awaitingApproval"; await save(records); return json(publicRecord(r));
    }
    if (action === "capture") {
      if (r.status === "paid") return json(publicRecord(r));
      if (!r.orderId) return json({ error: "invalidRequest" }, 400);
      // A redirect or browser claim never proves payment. Reconcile a previous capture before retrying.
      let order = await paypal(`/v2/checkout/orders/${r.orderId}`);
      if (order.status !== "COMPLETED") {
        if (order.status !== "APPROVED") return json({ error: "notApproved" }, 409);
        await paypal(`/v2/checkout/orders/${r.orderId}/capture`, "POST", {}, r.captureKey);
        order = await paypal(`/v2/checkout/orders/${r.orderId}`);
      }
      const units = order.purchase_units;
      const captures = units?.[0]?.payments?.captures;
      const capture = captures?.[0];
      if (order.id !== r.orderId || order.status !== "COMPLETED" || units?.length !== 1 || units[0].custom_id !== r.id || captures?.length !== 1 || capture.status !== "COMPLETED" || capture.amount?.currency_code !== "USD" || capture.amount.value !== r.amount || !capture.id) throw new Error("providerFailed");
      r.status = "paid"; r.captureId = capture.id; await save(records); return json(publicRecord(r));
    }
    return json({ error: "invalidRequest" }, 400);
  }
  return (request) => {
    const result = queue.then(() => handle(request)).catch((error) => json({ error: error.message === "notConfigured" ? "notConfigured" : "providerFailed" }, error.message === "notConfigured" ? 503 : 502));
    queue = result.then(() => undefined); return result;
  };
}

export function paypalDevPlugin(env) {
  return { name: "paypal-sandbox", configureServer(server) {
    const api = createPayPalApi({ PAYPAL_ALLOWED_ORIGIN: `http://127.0.0.1:${server.config.server.port}`, ...env });
    server.middlewares.use("/api/paypal", async (req, res) => {
      if (server.config.server.host !== "127.0.0.1" || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) { res.writeHead(403); res.end(); return; }
      const limit = req.url?.split("?")[0] === "/upload" ? MAX_DELIVERY_BYTES : 8000;
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
      const response = await api(new Request(`http://localhost/api/paypal${req.url}`, { method: req.method, headers: req.headers, ...(["GET", "HEAD"].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) }));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    });
  } };
}
