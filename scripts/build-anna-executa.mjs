const notFlag = arg => !arg.startsWith("--");
import { build } from "esbuild";
import { mkdir, writeFile, readFile, copyFile, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";
const output=resolve(process.argv.slice(2).find(arg => notFlag(arg)) || "anna/executas/timeline-project-tools/bundle");
await mkdir(join(output,"scripts"),{recursive:true});
await build({entryPoints:["scripts/timeline-command.mjs"],outfile:join(output,"scripts/timeline-command.mjs"),bundle:true,platform:"node",format:"esm",target:"node20"});
await build({entryPoints:["skills/edit-timeline-studio/anna/plugin.mjs"],outfile:join(output,"plugin.mjs"),bundle:true,platform:"node",format:"esm",target:"node20",banner:{js:'import { dirname as bundleDirname } from "node:path"; import { fileURLToPath as bundleFilePath } from "node:url"; process.env.TIMELINE_STUDIO_ROOT ||= bundleDirname(bundleFilePath(import.meta.url));'}});
await writeFile(join(output,"package.json"),JSON.stringify({name:"timeline-studio-anna-executa",version:JSON.parse(await readFile("anna/executas/timeline-project-tools/manifest.json","utf8")).version,type:"module",private:true},null,2)+"\n");
await copyFile("LICENSE",join(output,"LICENSE"));
await writeFile(join(output,"THIRD-PARTY-NOTICES.txt"),(await Promise.all(["fflate","zod"].map(async name => name+"\n"+await readFile(`node_modules/${name}/LICENSE`,"utf8")))).join("\n\n"));
console.log(`Self-contained Node.js Executa ready: ${output}`);

if (process.argv.includes("--native")) {
  if (process.platform !== "darwin" || process.arch !== "arm64" || process.version !== "v22.14.0") throw new Error("The initial verified native distribution requires macOS arm64 Node v22.14.0. Other platforms are not advertised.");
  await mkdir(join(output,"runtime"),{recursive:true});
  await copyFile(process.execPath,join(output,"runtime/node"));
  await copyFile("licenses/node-v22.14.0-LICENSE.txt",join(output,"runtime/LICENSE"));
  await writeFile(join(output,"timeline-project-tools"),'#!/bin/sh\nTASK_EXECUTA_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$TASK_EXECUTA_DIR/runtime/node" "$TASK_EXECUTA_DIR/plugin.mjs" "$@"\n');
  await chmod(join(output,"timeline-project-tools"),0o755);
  const protocol = JSON.parse(await readFile("anna/executas/timeline-project-tools/manifest.json","utf8"));
  protocol.runtime = {binary:{entrypoint:"timeline-project-tools",permissions:{"timeline-project-tools":"0o755","runtime/node":"0o755"}}};
  await writeFile(join(output,"manifest.json"),JSON.stringify(protocol,null,2)+"\n");
}
