/** Account-scoped project snapshots and a durable, coalescing cloud outbox.
 * Metadata, snapshots and outbox revisions always commit atomically. */
const fail = (code) => Object.assign(new Error(`Anna local projects: ${code}`), { sessionCode: code });
export function createAnnaLocalProjectStore(scope) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(scope)) throw fail('auth');
  const key = (id, previous = false) => `${scope}/${id}${previous ? '/previous' : ''}`;
  async function transaction(mode, operation) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('timeline-studio-anna-local-projects', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('accounts');
        request.result.createObjectStore('snapshots');
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(fail('blocked'));
      request.onsuccess = () => { const value = request.result; value.onversionchange = () => value.close(); resolve(value); };
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['accounts', 'snapshots'], mode);
      let result, failure;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(failure || tx.error || fail('write')); };
      const request = tx.objectStore('accounts').get(scope);
      request.onsuccess = () => {
        try { operation(request.result, tx.objectStore('snapshots'), (value) => { result = value; },
          (account) => tx.objectStore('accounts').put(account, scope)); }
        catch (error) { failure = error; tx.abort(); }
      };
    });
  }
  const metadata = () => transaction('readonly', (account, _, done) => done(account || null));
  const read = (id, previous = false) => transaction('readonly', (account, snapshots, done) => {
    const target = id || account?.current;
    if (!target) return done(null);
    const request = snapshots.get(key(target, previous));
    request.onsuccess = () => done(request.result || null);
  });
  return {
    metadata, read,
    initialize(record, head) {
      return transaction('readwrite', (existing, snapshots, done, put) => {
        if (existing) return done(existing);
        const projects = head.projects || [];
        const current = record?.projectId || null;
        const account = { revision: record ? 1 : 0, current, projects, anchor: head.anchor,
          cloudRevision: head.revision, cloudFiles: head.files || [], outbox: {}, deleted: {} };
        if (record) {
          const saved = { ...record, revision: 1, source: 'browser' };
          snapshots.put(saved, key(current));
          if (!projects.some(p => p.id === current)) account.projects.push({ id: current, name: record.projectName || '', savedAt: record.savedAt, previous: false, preview: record.data.projectPreview || null });
          if (record.source === 'local') account.outbox[current] = 1;
        }
        put(account); done(account);
      });
    },
    cache(record, previous = false) {
      return transaction('readwrite', (account, snapshots) => {
        if (!account || !account.projects.some(p => p.id === record.projectId) || account.outbox[record.projectId]) return;
        snapshots.put({ ...record, source: 'browser' }, key(record.projectId, previous));
      });
    },
    save(data, { expectedRevision = 0, project } = {}) {
      const snapshot = structuredClone(data);
      return transaction('readwrite', (account, snapshots, done, put) => {
        if (!account) throw fail('read');
        if (account.revision !== expectedRevision) throw fail('conflict');
        const id = project?.id || account.current || 'legacy';
        const old = account.projects.find(p => p.id === id);
        const name = project?.name ?? old?.name ?? '';
        const record = { data: snapshot, revision: account.revision + 1, savedAt: new Date().toISOString(), projectId: id, projectName: name, source: 'browser' };
        const request = snapshots.get(key(id));
        request.onsuccess = () => {
          if (request.result) snapshots.put(request.result, key(id, true));
          snapshots.put(record, key(id));
          account.revision = record.revision; account.current = id;
          account.projects = [{ id, name, savedAt: record.savedAt, preview: snapshot.projectPreview || old?.preview || null, previous: Boolean(request.result || old?.previous) }, ...account.projects.filter(p => p.id !== id)];
          account.outbox[id] = record.revision; delete account.deleted[id];
          put(account); done(record);
        };
      });
    },
    remove(id, { expectedRevision } = {}) {
      return transaction('readwrite', (account, snapshots, done, put) => {
        if (!account || account.revision !== expectedRevision || account.current === id) throw fail('conflict');
        account.projects = account.projects.filter(p => p.id !== id);
        delete account.outbox[id]; account.deleted[id] = true;
        snapshots.delete(key(id)); snapshots.delete(key(id, true));
        put(account); done(true);
      });
    },
    acknowledge(id, revision, head, removed = false) {
      return transaction('readwrite', (account, _, done, put) => {
        if (removed) delete account.deleted[id];
        else if (account.outbox[id] === revision) delete account.outbox[id];
        account.anchor = head.anchor; account.cloudRevision = head.revision; account.cloudFiles = head.files || [];
        put(account); done(account);
      });
    },
  };
}
