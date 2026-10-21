import { spawn } from "node:child_process";
import { HostError } from "./sessions.ts";
import { encodeId } from "./storage/records.ts";

export function createPlanningCredentials(executable: string) {
  const run = async (operation: "put" | "get" | "status", identity: string, secret?: string) => {
    if (process.platform !== "darwin") throw new HostError("CREDENTIAL_STORE_UNAVAILABLE", 503, "Protected credential storage is unavailable on this platform.");
    if (secret !== undefined && (!secret.length || Buffer.byteLength(secret) > 16384 || secret.includes("\0") || secret.includes("\r") || secret.includes("\n"))) {
      throw new HostError("INVALID_ARGUMENT", 400, "The API key must be a nonempty single line of at most 16384 bytes.");
    }
    return new Promise<string>((resolve, reject) => {
      const child = spawn(executable, [`credential-${operation}`, encodeId(identity)], { stdio: ["pipe", "pipe", "pipe"] });
      const chunks: Buffer[] = []; let size = 0;
      const failure = () => new HostError("CREDENTIAL_STORE_UNAVAILABLE", 503, "The protected credential operation was not confirmed. Check Keychain access and retry.");
      const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
      child.once("error", () => { clearTimeout(timer); reject(failure()); });
      child.stderr.resume();
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 16384) child.kill("SIGKILL"); else chunks.push(chunk);
      });
      child.stdin.on("error", () => {});
      child.once("close", code => {
        clearTimeout(timer);
        if (code !== 0 || size > 16384) { reject(failure()); return; }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      child.stdin.end(secret ?? "");
    });
  };
  return {
    put: async (identity: string, key: string) => { await run("put", identity, key); },
    get: (identity: string) => run("get", identity),
    configured: async (identity: string) => (await run("status", identity)).trim() === "true",
  };
}
