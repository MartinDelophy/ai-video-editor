// Transaction completion, rather than request success, acknowledges a saved snapshot.
const open = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("timeline-storyboards", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("STORAGE_BLOCKED"));
  });
export async function readStoryboard(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects");
    const request = tx.objectStore("projects").get(key);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result || null);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function writeStoryboard(key, value, revision) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite"),
      store = tx.objectStore("projects");
    let conflict = false;
    const request = store.get(key);
    request.onsuccess = () => {
      conflict = (request.result?.revision || 0) !== revision;
      // Preserve this editor's work without overwriting the winning revision.
      store.put(
        { ...value, revision: revision + 1 },
        conflict ? `${key}:recovery:${Date.now()}:${crypto.randomUUID()}` : key,
      );
    };
    tx.oncomplete = () => {
      db.close();
      resolve({ conflict, revision: revision + 1 });
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
