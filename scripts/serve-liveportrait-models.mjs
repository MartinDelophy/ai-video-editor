import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.argv[2] ?? "/private/tmp";
const port = Number(process.argv[3] ?? 8788);

const server = http.createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname).replace(/^\/+/, "");
  if (!/^[a-z0-9_.-]+\.(onnx|png|bin|json)$/i.test(name)) {
    response.writeHead(404, { "Access-Control-Allow-Origin": "*" });
    response.end("Not found");
    return;
  }
  const file = path.join(root, name.startsWith("joyvasa-") ? name : `liveportrait-${name}`);
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { "Access-Control-Allow-Origin": "*" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": stat.size,
      "Content-Type": name.endsWith(".png")
        ? "image/png"
        : name.endsWith(".json") ? "application/json" : "application/octet-stream",
    });
    fs.createReadStream(file).pipe(response);
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`LivePortrait model server: http://127.0.0.1:${port}/\n`);
});
