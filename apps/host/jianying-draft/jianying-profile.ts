import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HostError } from "../sessions.ts";
import type { DraftTargetProfile } from "./draft-types.ts";

const execFileAsync = promisify(execFile);

export const jianyingTargetProfile: DraftTargetProfile = Object.freeze({
  id: "jianying-11.6.0-macos",
  product: "jianying",
  appVersion: "11.6.0",
  platform: "macOS",
  bundleId: "com.lemon.lvpro",
  applicationPath: "/Applications/VideoFusion-macOS.app",
  executableName: "VideoFusion-macOS",
  defaultDraftRoots: ["Movies/JianyingPro/User Data/Projects/com.lveditor.draft"],
  mainTimelineFile: "draft_info.json",
  synchronizedTimelineFiles: [],
  template: { product: "jianying", appVersion: "5.9.0", format: "plaintext-bootstrap" },
} satisfies DraftTargetProfile);

export const transitionCatalog: Record<string, {
  name: string; resourceId: string; effectId: string; overlap: boolean;
  evidence: "legacy-jianying-bootstrap" | "jianying-11.6.0-visual-oracle";
}> = {
  fade: { name: "叠化", resourceId: "6724845717472416269", effectId: "322577", overlap: true, evidence: "jianying-11.6.0-visual-oracle" },
  zoom: { name: "推近", resourceId: "6724226861666144779", effectId: "359359", overlap: false, evidence: "legacy-jianying-bootstrap" },
  flash: { name: "闪白", resourceId: "6724845376098013708", effectId: "322575", overlap: false, evidence: "legacy-jianying-bootstrap" },
  "wipe-left": { name: "向左擦除", resourceId: "6724849999336706573", effectId: "2917283", overlap: true, evidence: "legacy-jianying-bootstrap" },
  "wipe-up": { name: "向上擦除", resourceId: "6724849456891564557", effectId: "2917281", overlap: true, evidence: "legacy-jianying-bootstrap" },
  blur: { name: "模糊", resourceId: "6911569618171597320", effectId: "4212596", overlap: true, evidence: "legacy-jianying-bootstrap" },
  split: { name: "分割", resourceId: "6968372308419285540", effectId: "4211683", overlap: true, evidence: "legacy-jianying-bootstrap" },
  glitch: { name: "故障", resourceId: "6725771847444468236", effectId: "2918080", overlap: false, evidence: "legacy-jianying-bootstrap" },
};

async function plistValue(key: string) {
  const plist = `${jianyingTargetProfile.applicationPath}/Contents/Info.plist`;
  const { stdout } = await execFileAsync("/usr/bin/plutil", ["-extract", key, "raw", plist], { encoding: "utf8" });
  return stdout.trim();
}

export async function requireJianyingTarget(platform: string = process.platform) {
  if (platform !== "darwin") {
    throw new HostError("COMPONENT_NOT_READY", 503, "Jianying 11.6 editable-draft export requires macOS.");
  }
  let bundleId: string;
  let appVersion: string;
  let executableName: string;
  try {
    [bundleId, appVersion, executableName] = await Promise.all([
      plistValue("CFBundleIdentifier"),
      plistValue("CFBundleShortVersionString"),
      plistValue("CFBundleExecutable"),
    ]);
  } catch {
    throw new HostError("COMPONENT_NOT_READY", 503,
      `Jianying Pro ${jianyingTargetProfile.appVersion} was not found at ${jianyingTargetProfile.applicationPath}.`);
  }
  if (bundleId !== jianyingTargetProfile.bundleId || appVersion !== jianyingTargetProfile.appVersion ||
      executableName !== jianyingTargetProfile.executableName) {
    throw new HostError("COMPONENT_NOT_READY", 503,
      `This export profile requires ${jianyingTargetProfile.bundleId} ${jianyingTargetProfile.appVersion}; found ${bundleId} ${appVersion}.`);
  }
  try {
    const { stdout } = await execFileAsync("/usr/bin/pgrep", ["-x", jianyingTargetProfile.executableName], { encoding: "utf8" });
    if (stdout.trim()) {
      throw new HostError("RESOURCE_BUSY", 409, "Quit Jianying Pro before exporting a draft so its draft store cannot change concurrently.");
    }
  } catch (error) {
    if (error instanceof HostError) throw error;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== 1 && code !== "1") {
      throw new HostError("COMPONENT_NOT_READY", 503, "Could not verify that Jianying Pro is closed.");
    }
  }
  return jianyingTargetProfile;
}
