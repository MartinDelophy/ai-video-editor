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
        // Only the first migration downloads the current remote project. A
        // failed read cannot masquerade as an empty account or erase its work.
        const remote = createAnnaCloudSessionStore();
        const record = await remote.read();
        let legacy = null;
        if (!record) legacy = await readAnnaSession(scope);
        await candidate.initialize(record || (legacy ? { ...legacy, projectId: 'legacy', projectName: '', source: 'local' } : null), remote.head());
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
    async read(explicitScope) { const store = await open(explicitScope); return cloud ? (await cloudStore()).read() : store.read(); },
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
      return record;
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
