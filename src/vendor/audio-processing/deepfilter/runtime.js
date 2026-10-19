// pkg/df.js
var DFState = class {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DFStateFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_dfstate_free(ptr, 0);
  }
};
if (Symbol.dispose) DFState.prototype[Symbol.dispose] = DFState.prototype.free;
function df_create(model_bytes, atten_lim) {
  const ptr0 = passArray8ToWasm0(model_bytes, wasm.__wbindgen_malloc_command_export);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.df_create(ptr0, len0, atten_lim);
  return ret >>> 0;
}
function df_create_default(atten_lim) {
  const ret = wasm.df_create_default(atten_lim);
  return ret >>> 0;
}
function df_free(st) {
  wasm.df_free(st);
}
function df_get_frame_length(st) {
  const ret = wasm.df_get_frame_length(st);
  return ret >>> 0;
}
function df_process_frame(st, input) {
  const ptr0 = passArrayF32ToWasm0(input, wasm.__wbindgen_malloc_command_export);
  const len0 = WASM_VECTOR_LEN;
  const ret = wasm.df_process_frame(st, ptr0, len0);
  return ret;
}
function df_set_atten_lim(st, lim_db) {
  wasm.df_set_atten_lim(st, lim_db);
}
function df_set_post_filter_beta(st, beta) {
  wasm.df_set_post_filter_beta(st, beta);
}
function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg___wbindgen_throw_6b64449b9b9ed33c: function(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    },
    __wbg_getRandomValues_cc7f052a444bb2ce: function() {
      return handleError(function(arg0, arg1) {
        globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
      }, arguments);
    },
    __wbg_new_from_slice_b6858b485924da4e: function(arg0, arg1) {
      const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
      return ret;
    },
    __wbindgen_init_externref_table: function() {
      const table = wasm.__wbindgen_externrefs;
      const offset = table.grow(4);
      table.set(0, void 0);
      table.set(offset + 0, void 0);
      table.set(offset + 1, null);
      table.set(offset + 2, true);
      table.set(offset + 3, false);
    }
  };
  return {
    __proto__: null,
    "./df_bg.js": import0
  };
}
var DFStateFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_dfstate_free(ptr >>> 0, 1));
function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc_command_export();
  wasm.__wbindgen_externrefs.set(idx, obj);
  return idx;
}
function getArrayF32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
var cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
  if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
    cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32ArrayMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}
var cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    const idx = addToExternrefTable0(e);
    wasm.__wbindgen_exn_store_command_export(idx);
  }
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function passArrayF32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getFloat32ArrayMemory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
var MAX_SAFARI_DECODE_BYTES = 2146435072;
var numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
var WASM_VECTOR_LEN = 0;
var wasmModule;
var wasm;
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  wasmModule = module;
  cachedFloat32ArrayMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  wasm.__wbindgen_start();
  return wasm;
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && expectedResponseType(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
  function expectedResponseType(type) {
    switch (type) {
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0) return wasm;
  if (module_or_path !== void 0) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (module_or_path === void 0) {
    module_or_path = new URL("df_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}

// src/DeepFilter.ts
var SAMPLE_RATE = 48e3;
var DeepFilter = class _DeepFilter {
  frameLength;
  sampleRate = SAMPLE_RATE;
  #handle;
  constructor(handle) {
    this.#handle = handle;
    this.frameLength = df_get_frame_length(handle);
  }
  static async create(options = {}) {
    const wasmUrl = options.wasmUrl ?? new URL("./df_bg.wasm", import.meta.url).href;
    await __wbg_init(wasmUrl);
    const atten = options.attenuationLimit ?? 100;
    const handle = options.model ? df_create(options.model, atten) : df_create_default(atten);
    return new _DeepFilter(handle);
  }
  process(frame) {
    if (frame.length !== this.frameLength) {
      throw new Error(`DeepFilter expects ${this.frameLength} samples, got ${frame.length}`);
    }
    return df_process_frame(this.#handle, frame);
  }
  setAttenuationLimit(db) {
    df_set_atten_lim(this.#handle, db);
  }
  setPostFilterBeta(beta) {
    df_set_post_filter_beta(this.#handle, beta);
  }
  destroy() {
    df_free(this.#handle);
    this.#handle = 0;
  }
};

// src/stream.ts
async function workletModuleUrl() {
  const url = new URL("./worklet.js", import.meta.url);
  return url.href;
}
async function denoiseStream(input, options = {}) {
  const wasmUrl = options.wasmUrl ?? new URL("./df_bg.wasm", import.meta.url).href;
  const wasmBytes = await fetch(wasmUrl).then((response) => {
    if (!response.ok) throw new Error(`Failed to fetch DeepFilterNet wasm (${response.status})`);
    return response.arrayBuffer();
  });
  const wasmModule2 = await WebAssembly.compile(wasmBytes);
  const context = options.context ?? new AudioContext({ sampleRate: SAMPLE_RATE });
  await context.audioWorklet.addModule(await workletModuleUrl());
  const source = context.createMediaStreamSource(input);
  const node = new AudioWorkletNode(context, "deepfilternet-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    processorOptions: {
      wasmModule: wasmModule2,
      attenuationLimit: options.attenuationLimit ?? 100
    }
  });
  const destination = context.createMediaStreamDestination();
  source.connect(node);
  node.connect(destination);
  return {
    stream: destination.stream,
    context,
    setAttenuationLimit: (db) => {
      node.port.postMessage({ type: "setAttenuationLimit", value: db });
    },
    setEnabled: (enabled) => {
      node.port.postMessage({ type: "setEnabled", value: enabled });
    },
    destroy: () => {
      source.disconnect();
      node.disconnect();
      destination.disconnect();
    }
  };
}
export {
  DeepFilter,
  SAMPLE_RATE,
  denoiseStream
};
