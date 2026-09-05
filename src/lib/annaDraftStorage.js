const DATABASE_NAME = "timeline-studio-anna-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const CURRENT_DRAFT_KEY = "current";

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
    const fail = (error) => {
      database.close();
      reject(error || draftError(mode === "readwrite" ? "write" : "read"));
    };
    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => fail(transaction.error);
      transaction.onerror = () => fail(transaction.error);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => { result = request.result; };
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

export async function readAnnaDraft() {
  const record = await transact("readonly", (store) => store.get(CURRENT_DRAFT_KEY));
  if (!record) return null;
  assertArchive(record.archive);
  if (record.format !== "timeline" || typeof record.savedAt !== "string") throw draftError("invalid");
  return { ...metadata(record), archive: record.archive };
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
