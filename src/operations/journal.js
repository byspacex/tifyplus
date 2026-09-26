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
    let itemsChanged = false;
    const items = operation.items.map(item => {
      if (item.status !== 'running') return item;
      changed = true;
      itemsChanged = true;
      return { ...item, status: 'unknown', error: 'page_interrupted' };
    });
    const creationMayHaveCompleted = operation.status === 'applying' && !operation.targetPlaylistId;
    if (!itemsChanged && !creationMayHaveCompleted) return operation;
    changed = true;
    return {
      ...operation,
      items,
      status: 'unknown',
      error: creationMayHaveCompleted ? 'playlist_creation_outcome_unknown' : operation.error,
      undo: { ...operation.undo, status: operation.undo?.items?.length ? 'review_required' : 'unavailable' },
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
