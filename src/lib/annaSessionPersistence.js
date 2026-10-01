import { getAnnaSessionErrorCode, readAnnaSession } from './annaSessionStorage.js';
import { createAnnaCloudSessionStore } from './annaCloudSessionStorage.js';
import { createAnnaLocalProjectStore } from './annaLocalProjectStore.js';
import { resolveAnnaSessionScope } from './annaRuntime.js';

/** Local commits are independent of remote latency. The durable outbox is
 * drained under a browser-wide lock; remote CAS conflicts never rebase edits. */
export function createAnnaSessionPersistence() {
  let local, scope, opening, timer, running = false, stopped = true;
  let backup = 'pending';
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
    if (running || stopped || !local) return;
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
  return {
    mode: 'local',
    subscribe(listener) {
      listeners.add(listener); stopped = false; listener(backup); schedule();
      const online = () => schedule(0);
      window.addEventListener('online', online);
      return () => { listeners.delete(listener); window.removeEventListener('online', online); if (!listeners.size) { stopped = true; clearTimeout(timer); } };
    },
    retryBackup: () => schedule(0),
    async read(explicitScope) { return (await open(explicitScope)).read(); },
    async listProjects() { return (await (await open()).metadata()).projects; },
    async deleteProject(id, options) {
      const result = await (await open()).remove(id, options);
      emit('pending'); schedule(); return result;
    },
    async readProject(id, previous = false, options) {
      const store = await open();
      const cached = await store.read(id, previous);
      if (cached) return cached;
      const remote = createAnnaCloudSessionStore();
      const record = await remote.readProject(id, previous, options);
      await store.cache(record, previous);
      return record;
    },
    async save(data, options) {
      const result = await (await open()).save(data, options);
      emit('pending'); schedule(); return result;
    },
  };
}
