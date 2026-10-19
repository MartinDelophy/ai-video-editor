const open = () =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open("timeline-infinite-canvas", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("projects");
      const s = r.result.createObjectStore("recoveries");
      s.createIndex("projectKey", "projectKey");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("STORAGE_BLOCKED"));
  });
export async function readCanvasProject(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "recoveries"]),
      main = tx.objectStore("projects").get(key),
      copies = tx.objectStore("recoveries").index("projectKey").getAll(key);
    tx.oncomplete = () => {
      db.close();
      const record = main.result || null,
        recovery =
          (copies.result || [])
            .filter((r) => !r.resolvedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
      resolve({ record, recovery });
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function writeCanvasProject(
  key,
  value,
  expectedRevision,
  editorId,
  resolvedRecoveryKey = null,
) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "recoveries"], "readwrite"),
      s = tx.objectStore("projects"),
      r = s.get(key);
    let result;
    r.onsuccess = () => {
      const current = r.result,
        conflict = (current?.revision || 0) !== expectedRevision;
      const record = { ...value, revision: expectedRevision + 1, updatedAt: Date.now() };
      if (conflict) {
        const recoveryKey = `${key}:${editorId}`;
        tx.objectStore("recoveries").put({ ...record, projectKey: key, recoveryKey }, recoveryKey);
        result = { conflict: true, recoveryKey };
      } else {
        s.put(record, key);
        const recoveries = tx.objectStore("recoveries");
        if (resolvedRecoveryKey) {
          const previous = recoveries.get(resolvedRecoveryKey);
          previous.onsuccess = () => {
            if (previous.result)
              recoveries.put({ ...previous.result, resolvedAt: Date.now() }, resolvedRecoveryKey);
          };
        }
        recoveries.delete(`${key}:${editorId}`);
        result = { conflict: false, revision: record.revision };
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
