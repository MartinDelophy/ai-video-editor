import { getAnnaSessionErrorCode, readAnnaSession } from "./annaSessionStorage.js";
import { createAnnaCloudSessionStore } from "./annaCloudSessionStorage.js";
import { resolveAnnaSessionScope } from "./annaRuntime.js";

/** Anna sessions save to the account's cloud storage by default. Only a
 * confirmed absent cloud pointer permits migration from an older local copy.
 * A failed cloud read must never look like an empty account or allow overwrite.
 */
export function createAnnaSessionPersistence() {
  const cloud = createAnnaCloudSessionStore();
  let localScope = "";
  let migrationErrorCode = "";
  let pendingRead = null;
  let pendingReadScope;
  const read = async (scope) => {
    const record = await cloud.read();
    migrationErrorCode = "";
    if (record) return record;
    try {
      // Local recovery is optional for a new cloud account. Its namespace or
      // IndexedDB failure cannot prevent new work from being saved remotely.
      localScope = scope || localScope || await resolveAnnaSessionScope();
      const local = await readAnnaSession(localScope);
      // The old browser revision is unrelated to cloud CAS. The importer
      // must first restore this data before the hook migrates revision zero.
      return local ? { revision: 0, savedAt: local.savedAt, data: local.data, source: "local" } : null;
    } catch (error) {
      migrationErrorCode = getAnnaSessionErrorCode(error, "read");
      return null;
    }
  };
  return {
    mode: "cloud",
    get migrationErrorCode() { return migrationErrorCode; },
    read(scope) {
      // React StrictMode can restart the load effect during the host read.
      // Share that read only; concurrent saves still use the cloud store's CAS.
      if (pendingRead) return scope === pendingReadScope ? pendingRead
        : Promise.reject(Object.assign(new Error("Anna session read conflict"), { sessionCode: "conflict" }));
      pendingReadScope = scope;
      pendingRead = read(scope).finally(() => { pendingRead = null; });
      return pendingRead;
    },
    save(data, options) {
      // Local quota exhaustion cannot gate a confirmed remote commit. Cloud
      // media is restored into memory; migration never changes the old copy.
      return cloud.save(data, options);
    },
  };
}
