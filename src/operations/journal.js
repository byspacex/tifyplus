const JOURNAL_VERSION = 1;
const MAX_OPERATIONS = 30;

export function operationStorageKey(userId) {
  return 'tify.operations.v' + JOURNAL_VERSION + '.' + encodeURIComponent(userId || 'anonymous');
}

export function createOperation({ type, userId, sourcePlaylists = [], rules = {}, items = [] }) {
  const now = new Date().toISOString();
  return {
    id: 'op_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)),
    type, userId: userId || 'anonymous', status: 'preview', createdAt: now, updatedAt: now,
    sourcePlaylists: sourcePlaylists.map(playlist => ({ id: playlist.id, name: playlist.name, snapshotId: playlist.snapshotId || null })),
    rules: structuredClone(rules),
    items: items.map((item, index) => ({ ...item, id: String(index), uri: item.uri || item.track?.uri || null, status: 'pending' })),
    results: { added: [], skipped: [], failed: [] },
    undo: { status: 'unavailable', items: [] }
  };
}

export function readOperations(storage, userId) {
  try {
    const parsed = JSON.parse(storage?.getItem(operationStorageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(operation => operation.userId === (userId || 'anonymous')) : [];
  } catch { return []; }
}

export function writeOperations(storage, userId, operations) {
  try {
    storage?.setItem(operationStorageKey(userId), JSON.stringify(operations.slice(0, MAX_OPERATIONS)));
    return true;
  } catch { return false; }
}

export function recoverInterruptedOperations(operations) {
  let changed = false;
  const recovered = operations.map(operation => {
    let hadRunningItem = false;
    const items = operation.items.map(item => {
      if (item.status !== 'running') return item;
      changed = true;
      hadRunningItem = true;
      return { ...item, status: 'unknown', error: 'page_interrupted' };
    });
    const interrupted = operation.status === 'applying';
    if (!interrupted) return operation;
    const creationMayHaveCompleted = !operation.targetPlaylistId;
    changed = true;
    const status = creationMayHaveCompleted || hadRunningItem
      ? 'unknown'
      : items.every(item => item.status === 'succeeded' || item.status === 'skipped') ? 'completed' : 'partial';
    return {
      ...operation,
      items,
      status,
      error: creationMayHaveCompleted ? 'playlist_creation_outcome_unknown' : hadRunningItem ? 'page_interrupted' : operation.error,
      undo: status === 'unknown' ? { ...operation.undo, status: operation.undo?.items?.length ? 'review_required' : 'unavailable' } : operation.undo,
      updatedAt: new Date().toISOString()
    };
  });
  return { operations: recovered, changed };
}

export function updateOperation(operations, operationId, updater) {
  return operations.map(operation => operation.id === operationId
    ? { ...updater(operation), updatedAt: new Date().toISOString() }
    : operation);
}
