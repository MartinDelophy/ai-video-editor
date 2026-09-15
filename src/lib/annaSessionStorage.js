const DATABASE_NAME = "timeline-studio-anna-sessions";
const DATABASE_VERSION = 1;
const STORE_NAME = "sessions";
const SCOPE_PATTERN = /^[a-zA-Z0-9_-]{16,100}$/;
const ERROR_CODES = new Set(["blocked", "unsupported", "quota", "read", "write", "invalid", "conflict", "auth", "network", "permission"]);

function sessionError(code, cause) {
  return Object.assign(new Error(`Anna session storage: ${code}`), { sessionCode: code, cause });
}

export function getAnnaSessionErrorCode(error, fallback = "read") {
  if (ERROR_CODES.has(error?.sessionCode)) return error.sessionCode;
  const hostCode = {
    auth_required: "auth", permission_denied: "permission", network_error: "network",
    timeout: "network", quota_exceeded: "quota", storage_full: "quota", conflict: "conflict",
  };
  if (Object.hasOwn(hostCode, error?.code)) return hostCode[error.code];
  if (error?.name === "QuotaExceededError") return "quota";
  if (["SecurityError", "NotSupportedError", "InvalidStateError", "VersionError"].includes(error?.name)) return "unsupported";
  if (["DataCloneError", "DataError"].includes(error?.name)) return "invalid";
  return ERROR_CODES.has(fallback) ? fallback : "read";
}

function assertScope(scope) {
  if (typeof scope !== "string" || !SCOPE_PATTERN.test(scope)) throw sessionError("invalid");
}

function assertData(data) {
  if (data === null || typeof data !== "object") throw sessionError("invalid");
}

function readRecord(record, id) {
  if (record === undefined) return null;
  if (
    !record || typeof record !== "object" || record.id !== id
    || !Number.isSafeInteger(record.revision) || record.revision < 1
    || typeof record.savedAt !== "string" || !Number.isFinite(Date.parse(record.savedAt))
    || new Date(record.savedAt).toISOString() !== record.savedAt
  ) throw sessionError("invalid");
  assertData(record.data);
  return { id: record.id, revision: record.revision, savedAt: record.savedAt, data: record.data };
}

function openDatabase(fallback) {
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(sessionError(getAnnaSessionErrorCode(error, fallback), error));
    };
    try {
      if (!globalThis.indexedDB) return fail(sessionError("unsupported"));
      request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      fail(error);
      return;
    }
    request.onupgradeneeded = () => {
      try {
        if (settled) { request.transaction.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      } catch (error) {
        fail(error);
        try { request.transaction?.abort(); } catch { /* The failed upgrade may already be aborted. */ }
      }
    };
    request.onblocked = () => fail(sessionError("blocked"));
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (settled) { database.close(); return; }
      settled = true;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function transact(mode, operation) {
  const fallback = mode === "readwrite" ? "write" : "read";
  const database = await openDatabase(fallback);
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let requestError;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      database.close();
      const cause = requestError || error;
      reject(sessionError(getAnnaSessionErrorCode(cause, fallback), cause));
    };
    const abort = (error) => {
      requestError ||= error;
      if (!transaction) { fail(error); return; }
      try { transaction.abort(); } catch (abortError) { fail(error || abortError); }
    };
    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.oncomplete = () => {
        if (requestError) { fail(requestError); return; }
        if (settled) return;
        settled = true;
        database.close();
        resolve(result);
      };
      transaction.onabort = () => fail(transaction.error);
      transaction.onerror = (event) => { requestError ||= event.target?.error || transaction.error; };
      operation(transaction.objectStore(STORE_NAME), (value) => { result = value; }, abort);
    } catch (error) {
      abort(error);
    }
  });
}

async function readSession(scope, previous) {
  assertScope(scope);
  const id = previous ? `${scope}#previous` : scope;
  return transact("readonly", (store, setResult, abort) => {
    const request = store.get(id);
    request.onsuccess = () => {
      try { setResult(readRecord(request.result, id)); } catch (error) { abort(error); }
    };
  });
}

export function readAnnaSession(scope) {
  return readSession(scope, false);
}

/** Explicit recovery only: an invalid current record never silently loads its predecessor. */
export function readPreviousAnnaSession(scope) {
  return readSession(scope, true);
}

export async function saveAnnaSession(scope, data, options = {}) {
  assertScope(scope);
  assertData(data);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw sessionError("invalid");
  let expectedRevision;
  let snapshot;
  try {
    const requestedRevision = options.expectedRevision;
    expectedRevision = requestedRevision === undefined ? 0 : requestedRevision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw sessionError("invalid");
    if (typeof globalThis.structuredClone !== "function") throw sessionError("unsupported");
    // Snapshot before opening the database so later caller mutations cannot
    // alter this save. Blob/Map are preserved without encoding media bytes.
    snapshot = globalThis.structuredClone(data);
    assertData(snapshot);
  } catch (error) {
    throw sessionError(getAnnaSessionErrorCode(error, "invalid"), error);
  }
  return transact("readwrite", (store, setResult, abort) => {
    const request = store.get(scope);
    request.onsuccess = () => {
      try {
        const previous = readRecord(request.result, scope);
        const revision = previous?.revision ?? 0;
        if (revision !== expectedRevision) throw sessionError("conflict");
        if (revision === Number.MAX_SAFE_INTEGER) throw sessionError("invalid");
        const record = { id: scope, revision: revision + 1, savedAt: new Date().toISOString(), data: snapshot };
        // The revision read and both writes share one transaction. Quota,
        // cloning, or commit failures roll back both the current and previous
        // records; success is returned only by transaction.oncomplete.
        if (previous) store.put({ ...previous, id: `${scope}#previous` });
        store.put(record);
        setResult(record);
      } catch (error) { abort(error); }
    };
  });
}
