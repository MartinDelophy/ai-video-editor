const DATABASE_NAME = "timeline-studio-anna-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const CURRENT_DRAFT_KEY = "current";
const RECOVERY_KEY = "recovery";
const PREVIOUS_RECOVERY_KEY = "recovery-previous";
const RECOVERY_KEYS = [RECOVERY_KEY, PREVIOUS_RECOVERY_KEY];

function draftError(code, cause) {
  return Object.assign(new Error(`Anna draft storage: ${code}`), { draftCode: code, cause });
}

export function getAnnaDraftErrorCode(error, fallback = "read") {
  if (error?.draftCode) return error.draftCode;
  if (error?.name === "QuotaExceededError") return "quota";
  if (["SecurityError", "NotSupportedError", "InvalidStateError"].includes(error?.name)) return "unsupported";
  return fallback;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    let request;
    let blocked = false;
    try {
      if (!globalThis.indexedDB) return reject(draftError("unsupported"));
      request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(draftError(getAnnaDraftErrorCode(error, "unsupported"), error));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onblocked = () => {
      blocked = true;
      reject(draftError("blocked"));
    };
    request.onerror = () => reject(request.error || draftError("read"));
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let requestError;
    const fail = (error) => {
      database.close();
      reject(requestError || error || draftError(mode === "readwrite" ? "write" : "read"));
    };
    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => fail(transaction.error);
      transaction.onerror = (event) => { requestError ||= event.target?.error || transaction.error; };
      const request = operation(transaction.objectStore(STORE_NAME), (error) => {
        requestError = error;
        transaction.abort();
      });
      request?.addEventListener("success", () => { result = request.result; });
    } catch (error) {
      transaction?.abort();
      fail(error);
    }
  });
}

function assertArchive(archive) {
  if (!(archive instanceof Blob) || !archive.size) throw draftError("invalid");
}

function metadata(record) {
  return { savedAt: record.savedAt, bytes: record.archive.size };
}

function readRecord(record) {
  if (!record) return null;
  assertArchive(record.archive);
  if (record.format !== "timeline" || typeof record.savedAt !== "string") throw draftError("invalid");
  return { id: record.id, ...metadata(record), archive: record.archive };
}

function recoveryKey(id = RECOVERY_KEY) {
  if (!RECOVERY_KEYS.includes(id)) throw draftError("invalid");
  return id;
}

export async function readAnnaDraft() {
  const record = await transact("readonly", (store) => store.get(CURRENT_DRAFT_KEY));
  return readRecord(record);
}

export async function readAnnaDraftMetadata() {
  const draft = await readAnnaDraft();
  return draft ? { savedAt: draft.savedAt, bytes: draft.bytes } : null;
}

export async function saveAnnaDraft(archive) {
  assertArchive(archive);
  const record = { id: CURRENT_DRAFT_KEY, format: "timeline", savedAt: new Date().toISOString(), archive };
  // Resolve only after the write transaction commits. A failed replacement
  // leaves the previous .timeline archive intact.
  await transact("readwrite", (store) => store.put(record));
  return metadata(record);
}

export async function clearAnnaDraft() {
  await transact("readwrite", (store) => store.delete(CURRENT_DRAFT_KEY));
  return true;
}

export async function readAnnaRecovery(id = RECOVERY_KEY) {
  const key = recoveryKey(id);
  return readRecord(await transact("readonly", (store) => store.get(key)));
}

export async function readAnnaRecoveryMetadata() {
  const records = await transact("readonly", (store) => store.getAll());
  return RECOVERY_KEYS.flatMap((id) => {
    const record = readRecord(records.find((item) => item.id === id));
    return record ? [{ id, savedAt: record.savedAt, bytes: record.bytes }] : [];
  });
}

/** Keep at most two pre-restore archives, separately from the explicit checkpoint. */
export async function saveAnnaRecovery(archive, { preserveId = RECOVERY_KEY } = {}) {
  assertArchive(archive);
  const preservedKey = recoveryKey(preserveId);
  const record = { id: RECOVERY_KEY, format: "timeline", savedAt: new Date().toISOString(), archive };
  await transact("readwrite", (store, abort) => {
    const request = store.get(preservedKey);
    request.addEventListener("success", () => {
      try {
        const previous = request.result;
        if (previous) store.put({ ...previous, id: PREVIOUS_RECOVERY_KEY });
        store.put(record);
      } catch (error) { abort(error); }
    });
    return request;
  });
  // Both rotations commit together. A quota failure preserves the old pair;
  // an import failure afterwards still leaves its target and current project.
  return { id: RECOVERY_KEY, ...metadata(record) };
}

export async function clearAnnaRecovery() {
  await transact("readwrite", (store) => {
    store.delete(PREVIOUS_RECOVERY_KEY);
    return store.delete(RECOVERY_KEY);
  });
  return true;
}
