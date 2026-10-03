import { getAnnaSessionErrorCode, readAnnaSession } from './annaSessionStorage.js';
import { createAnnaCloudSessionStore } from './annaCloudSessionStorage.js';
import { createAnnaLocalProjectStore } from './annaLocalProjectStore.js';
import { resolveAnnaSessionScope } from './annaRuntime.js';

/** Local commits are independent of remote latency. The durable outbox is
 * drained under a browser-wide lock; remote CAS conflicts never rebase edits. */
export function createAnnaSessionPersistence() {
  let local, scope, opening, timer, running = false, stopped = true;
  let backup = 'pending', cloud = false, cloudReady = false, transitionRevision = null, restoring = false;
  const listeners = new Set();
  const backupRemote = createAnnaCloudSessionStore();
  const emit = (value) => { backup = value; for (const listener of listeners) listener(value); };
  async function open(explicitScope) {
    if (local) return local;
    if (opening) return opening;
    opening = (async () => {
      scope = explicitScope || await resolveAnnaSessionScope();
      const candidate = createAnnaLocalProjectStore(scope);
      if (!await candidate.metadata()) {
        // Bootstrap from the small catalog only. Media is read after an
        // explicit recovery choice; a failed catalog read is never empty.
        const remote = backupRemote;
        const head = await remote.initialize();
        let legacy = null;
        if (!head.current) legacy = await readAnnaSession(scope);
        try {
          await candidate.initialize(legacy ? { ...legacy, projectId: 'legacy', projectName: '', source: 'local' } : null, head);
        } catch (error) {
          if (getAnnaSessionErrorCode(error) !== 'quota' || legacy) throw error;
          // Even the small account metadata can fail when browser storage is
          // full. The already-read remote catalog is still a safe CAS baseline.
          local = candidate; cloud = true; cloudReady = true;
          return local;
        }
      }
      local = candidate;
      cloud = Boolean((await local.metadata()).cloudFallback);
      schedule();
      return local;
    })().finally(() => { opening = null; });
    return opening;
  }
  function schedule(delay = 1500) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(sync, delay);
  }
  async function sync() {
    if (running || stopped || !local || cloud || restoring) return;
    if (!navigator.locks?.request) { emit('error'); return; }
    running = true;
    try {
      await navigator.locks.request(`anna-project-backup:${scope}`, async () => {
        let account = await local.metadata();
        if (!Object.keys(account.outbox).length && !Object.keys(account.deleted).length) { emit('saved'); return; }
        emit('syncing');
        const remote = backupRemote;
        let head = await remote.initialize(account.cloudFiles);
        if (head.anchor !== account.anchor) throw Object.assign(new Error('Remote project changed'), { sessionCode: 'conflict' });
        // Drain snapshots before deletes so a locally switched current project
        // becomes the remote current before removing its former predecessor.
        while (!stopped) {
          account = await local.metadata();
          const ids = Object.keys(account.outbox).sort((a, b) => account.outbox[a] - account.outbox[b]);
          if (!ids.length) break;
          const id = ids[0];
          const record = await local.read(id);
          if (!record) continue; // A local delete raced with this selection.
          await remote.save(record.data, { expectedRevision: head.revision, project: { id, name: record.projectName } });
          head = remote.head();
          await local.acknowledge(id, record.revision, head);
        }
        account = await local.metadata();
        for (const id of Object.keys(account.deleted)) {
          if (stopped) break;
          if (head.projects.some(p => p.id === id)) await remote.deleteProject(id, { expectedRevision: head.revision });
          head = remote.head();
          await local.acknowledge(id, 0, head, true);
        }
        account = await local.metadata();
        emit(Object.keys(account.outbox).length || Object.keys(account.deleted).length ? 'pending' : 'saved');
      });
    } catch (error) {
      emit(getAnnaSessionErrorCode(error) === 'conflict' ? 'conflict' : 'error');
    } finally {
      running = false;
      // Retry transient transfer failures, but never silently resolve a conflict.
      if (backup === 'error' || backup === 'pending') schedule(30000);
    }
  }
  // Switch durably before transferring: a reload must never restore a stale
  // local snapshot after a successful cloud-only commit. Keep the outbox intact
  // until each pending project has reached the remote CAS pointer.
  async function cloudStore(expectedRevision) {
    const store = await open();
    return navigator.locks.request(`anna-project-backup:${scope}`, async () => {
      let account = await store.metadata();
      if (!cloud) {
        account = await store.useCloud(expectedRevision);
        cloud = true; transitionRevision = expectedRevision; clearTimeout(timer);
      }
      if (!cloudReady) {
        let head = await backupRemote.initialize(account.cloudFiles);
        if ((Object.keys(account.outbox).length || Object.keys(account.deleted).length) && head.anchor !== account.anchor) throw Object.assign(new Error('Remote project changed'), { sessionCode: 'conflict' });
        const ids = Object.keys(account.outbox).sort((a, b) => account.outbox[a] - account.outbox[b]);
        for (const id of ids) {
          const record = await store.read(id);
          if (!record) continue;
          await backupRemote.save(record.data, { expectedRevision: head.revision, project: { id, name: record.projectName } });
          head = backupRemote.head();
          await store.acknowledge(id, record.revision, head);
        }
        for (const id of Object.keys(account.deleted)) {
          if (head.projects.some(project => project.id === id)) await backupRemote.deleteProject(id, { expectedRevision: head.revision });
          head = backupRemote.head(); await store.acknowledge(id, 0, head, true);
        }
        cloudReady = true;
      }
      return backupRemote;
    });
  }
  return {
    setRestoreBusy(value) { restoring = Boolean(value); if (restoring) clearTimeout(timer); else schedule(); },
    get mode() { return cloud ? 'cloud' : 'local'; },
    subscribe(listener) {
      listeners.add(listener); stopped = false; listener(backup); schedule();
      const online = () => schedule(0);
      window.addEventListener('online', online);
      return () => { listeners.delete(listener); window.removeEventListener('online', online); if (!listeners.size) { stopped = true; clearTimeout(timer); } };
    },
    retryBackup: () => schedule(0),
    async inspect(explicitScope) {
      const store = await open(explicitScope);
      if (cloud) {
        const head = (await cloudStore()).head();
        return { revision: head.revision, project: head.projects.find(item => item.id === head.current) || null };
      }
      const account = await store.metadata();
      return { revision: account.revision, project: account.projects.find(item => item.id === account.current) || null };
    },
    async read(explicitScope, options = {}) {
      const started = performance.now();
      const store = await open(explicitScope);
      performance.measure('anna-session-open', { start: started, end: performance.now() });
      const reading = performance.now();
      let record;
      if (cloud) record = await (await cloudStore()).read(options);
      else {
        record = await store.read();
        if (!record) {
          const account = await store.metadata();
          if (account.current) {
            const remote = createAnnaCloudSessionStore();
            record = await remote.readProject(account.current, false, options);
            await store.cache(record);
            record = { ...record, revision: account.revision, source: 'browser' };
          }
        }
      }
      performance.measure('anna-session-read', { start: reading, end: performance.now() });
      return record;
    },
    async listProjects() { const store = await open(); return cloud ? (await cloudStore()).listProjects() : (await store.metadata()).projects; },
    async deleteProject(id, options) {
      await open();
      if (cloud) return (await cloudStore()).deleteProject(id, options);
      const result = await local.remove(id, options);
      emit('pending'); schedule(); return result;
    },
    async readProject(id, previous = false, options) {
      const store = await open();
      if (cloud) return (await cloudStore()).readProject(id, previous, options);
      const cached = await store.read(id, previous);
      if (cached) return cached;
      const remote = createAnnaCloudSessionStore();
      const record = await remote.readProject(id, previous, options);
      await store.cache(record, previous);
      return { ...record, revision: (await store.metadata()).revision, source: 'browser' };
    },
    async save(data, options) {
      const store = await open();
      if (cloud) {
        const remote = await cloudStore();
        const expectedRevision = transitionRevision === options?.expectedRevision ? remote.head().revision : options?.expectedRevision;
        const account = transitionRevision === options?.expectedRevision ? await store.metadata() : null;
        const project = options?.project || account?.projects.find(item => item.id === account.current);
        const result = await remote.save(data, { ...options, expectedRevision, project });
        transitionRevision = null; return result;
      }
      try {
        const result = await store.save(data, options);
        emit('pending'); schedule(); return result;
      } catch (error) {
        if (getAnnaSessionErrorCode(error) !== 'quota' || !navigator.locks?.request) throw error;
        const remote = await cloudStore(options?.expectedRevision);
        const account = await store.metadata();
        const project = options?.project || account.projects.find(item => item.id === account.current);
        const result = await remote.save(data, { expectedRevision: remote.head().revision, project });
        transitionRevision = null; emit('saved'); return result;
      }
    },
  };
}
