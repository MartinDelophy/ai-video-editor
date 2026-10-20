import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { HostError } from "../sessions.ts";
import { jianyingTargetProfile } from "./jianying-profile.ts";

export async function jianyingDraftRoot(outputDir?: string, platform: string = process.platform, home = homedir()) {
  if (platform !== "darwin") throw new HostError("COMPONENT_NOT_READY", 503, "Jianying export currently requires macOS managed project storage.");
  if (outputDir && (!isAbsolute(outputDir) || outputDir.includes("\0"))) {
    throw new HostError("INVALID_ARGUMENT", 400, "outputDir must be an absolute directory path.");
  }
  const candidates = outputDir ? [outputDir] : jianyingTargetProfile.defaultDraftRoots.map(path => join(home, path));
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate), stat = await lstat(resolved);
      if (stat.isDirectory()) return resolved;
    } catch { /* Try the next documented root; never create a guessed application directory. */ }
  }
  throw new HostError("JIANYING_DRAFT_ROOT_NOT_FOUND", 400,
    "No readable Jianying draft root found. Supply an existing outputDir.");
}

export function validateDraftName(name: string) {
  if (!name.trim() || name === "." || name === ".." || name.includes("/") || name.includes("\\") ||
      [...name].some(char => char.charCodeAt(0) < 32) || Buffer.byteLength(name) > 200) {
    throw new HostError("INVALID_ARGUMENT", 400, "draftName must be a nonempty filename of at most 200 UTF-8 bytes.");
  }
  return name;
}
