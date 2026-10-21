import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const execute = promisify(execFile);

export async function buildStorage(directory) {
  if (process.platform !== "darwin") throw new Error("Native project storage is not yet available on this platform.");
  const target = join(directory, "timeline-studio-storage");
  await execute("/usr/bin/clang", ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
    fileURLToPath(new URL("../native/macos/storage.c", import.meta.url)), "-framework", "Security", "-framework", "CoreFoundation", "-o", target], { timeout: 60_000 });
  return target;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const directory = fileURLToPath(new URL("../.cache/local-host/", import.meta.url));
  await mkdir(directory, { recursive: true });
  console.info(await buildStorage(directory));
}
