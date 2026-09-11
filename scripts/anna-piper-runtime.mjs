import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";

const ASSET_MODULE = "virtual:timeline-studio-anna-piper-assets";
const RESOLVED_ASSET_MODULE = `\0${ASSET_MODULE}`;
const PHONEMIZER_HASHES = {
  "piper_phonemize.wasm": "b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6",
  "piper_phonemize.data": "29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c",
};

function readPinnedPackage(path, name, version) {
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  if (metadata.name !== name || metadata.version !== version) {
    throw new Error(`Anna Piper adapter requires ${name}@${version}; review it before changing this runtime`);
  }
  return metadata;
}

function replaceOnce(code, original, replacement) {
  if (code.split(original).length !== 2) {
    throw new Error("Anna Piper runtime source changed; review the same-origin/single-thread adapter");
  }
  return code.replace(original, replacement);
}

/** Register only in the Anna Vite profile; ordinary builds use the upstream module. */
export function annaPiperRuntimePlugin() {
  const require = createRequire(new URL("../package.json", import.meta.url));
  const vitsEntry = fileURLToPath(import.meta.resolve("@diffusionstudio/vits-web"));
  const vitsRoot = resolve(dirname(vitsEntry), "..");
  const ortEntry = createRequire(vitsEntry).resolve("onnxruntime-web");
  const ortDist = dirname(ortEntry);
  const piperPackagePath = require.resolve("@diffusionstudio/piper-wasm/package.json");
  const piperRoot = dirname(piperPackagePath);
  const packages = [
    readPinnedPackage(resolve(vitsRoot, "package.json"), "@diffusionstudio/vits-web", "1.0.3"),
    readPinnedPackage(resolve(ortDist, "../package.json"), "onnxruntime-web", "1.18.0"),
    readPinnedPackage(piperPackagePath, "@diffusionstudio/piper-wasm", "1.0.0"),
  ];
  const paths = {
    simd: resolve(ortDist, "ort-wasm-simd.wasm"),
    plain: resolve(ortDist, "ort-wasm.wasm"),
    phonemizeWasm: resolve(piperRoot, "build/piper_phonemize.wasm"),
    phonemizeData: resolve(piperRoot, "build/piper_phonemize.data"),
  };
  for (const [filename, expected] of Object.entries(PHONEMIZER_HASHES)) {
    const digest = createHash("sha256").update(readFileSync(resolve(piperRoot, "build", filename))).digest("hex");
    if (digest !== expected) throw new Error(`Anna Piper runtime integrity mismatch: ${filename}`);
  }
  const expectedEntry = normalizePath(realpathSync(vitsEntry));

  return {
    name: "timeline-studio-anna-piper-runtime",
    enforce: "pre",
    config: () => ({ optimizeDeps: { exclude: ["@diffusionstudio/vits-web"] } }),
    resolveId(id) {
      if (id === ASSET_MODULE) return RESOLVED_ASSET_MODULE;
    },
    load(id) {
      if (id !== RESOLVED_ASSET_MODULE) return;
      const imports = Object.entries(paths).map(([name, path]) =>
        `import ${name} from ${JSON.stringify(`${normalizePath(path)}?url`)};`,
      ).join("\n");
      return `${imports}
export const ortWasmPaths = { "ort-wasm-simd.wasm": simd, "ort-wasm.wasm": plain };
export { phonemizeWasm, phonemizeData };
`;
    },
    transform(code, id) {
      if (normalizePath(id.split("?")[0]) !== expectedEntry) return;
      let adapted = replaceOnce(code,
        "_.env.wasm.numThreads = navigator.hardwareConcurrency",
        "_.env.wasm.numThreads = 1",
      );
      adapted = replaceOnce(adapted,
        "_.env.wasm.wasmPaths = B",
        "_.env.wasm.wasmPaths = __annaPiperOrtWasmPaths",
      );
      adapted = replaceOnce(adapted,
        'locateFile: (l) => l.endsWith(".wasm") ? `${x}.wasm` : l.endsWith(".data") ? `${x}.data` : l',
        'locateFile: (l) => l.endsWith(".wasm") ? __annaPiperPhonemizeWasm : l.endsWith(".data") ? __annaPiperPhonemizeData : l',
      );
      return {
        code: `import { ortWasmPaths as __annaPiperOrtWasmPaths, phonemizeWasm as __annaPiperPhonemizeWasm, phonemizeData as __annaPiperPhonemizeData } from ${JSON.stringify(ASSET_MODULE)};\n${adapted}`,
        map: null,
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset", fileName: "licenses/anna-piper-runtime/NOTICE.md",
        source: readFileSync(new URL("../docs/anna-piper-runtime.md", import.meta.url), "utf8"),
      });
      this.emitFile({
        type: "asset", fileName: "licenses/anna-piper-runtime/piper-wasm-1.0.0-source.md",
        source: readFileSync(resolve(piperRoot, "README.md"), "utf8"),
      });
      this.emitFile({
        type: "asset", fileName: "licenses/anna-piper-runtime/package-metadata.json",
        source: JSON.stringify(packages.map(({ name, version, license, repository, author }) =>
          ({ name, version, license, repository, author })), null, 2),
      });
    },
  };
}
