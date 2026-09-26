import assert from 'node:assert/strict';
import { executePlaylistAddOperation, undoPlaylistAddOperation } from '../src/operations/spotify-executor.js';
import { recoverInterruptedOperations } from '../src/operations/journal.js';

const makeOperation = count => ({
  id: 'op-test', status: 'preview', items: Array.from({ length: count }, (_, index) => ({ id: String(index), uri: 'spotify:track:' + String(index).padStart(22, 'x'), status: 'pending' })),
  results: { added: [], skipped: [], failed: [] }, undo: { status: 'unavailable', items: [] }
});
const response = (ok, snapshotId = 'snap-1') => ({ ok, status: ok ? 201 : 403, json: async () => (ok ? { snapshot_id: snapshotId } : { error: { message: 'denied' } }) });
const operation = makeOperation(101);
const saved = [];
let calls = 0;
const partial = await executePlaylistAddOperation({
  operation, playlistId: 'playlist', token: 'secret',
  fetchImpl: async (_url, request) => { calls++; assert.equal(request.method, 'POST'); return calls === 1 ? response(true, 'snap-1') : response(false); },
  persist: value => saved.push(structuredClone(value))
});
assert.equal(calls, 2);
assert.equal(partial.status, 'partial');
assert.equal(partial.results.added.length, 100);
assert.equal(partial.results.failed.length, 1);
assert.equal(saved.at(-1).status, 'partial');
const retry = await executePlaylistAddOperation({
  operation: { ...partial, items: partial.items.map(item => item.status === 'failed' ? { ...item, status: 'pending' } : item), results: { ...partial.results, failed: [] } },
  playlistId: 'playlist', token: 'secret', fetchImpl: async () => { calls++; return response(true, 'snap-2'); }
});
assert.equal(retry.results.added.length, 101);
assert.equal(retry.status, 'completed');

let undoCalls = 0;
const undoable = { ...retry, targetPlaylistId: 'playlist', undo: { status: 'available', items: retry.results.added.map(item => item.uri), snapshotId: 'snap-2' } };
const conflict = await undoPlaylistAddOperation({ operation: undoable, token: 'secret', getSnapshotId: async () => 'newer-snapshot', fetchImpl: async () => { undoCalls++; } });
assert.equal(conflict.undo.status, 'conflict');
assert.equal(undoCalls, 0, 'undo refuses to overwrite a newer playlist edit');
let snapshotReads = 0, batchedUndoCalls = 0;
const partialUndo = await undoPlaylistAddOperation({
  operation: { ...undoable, undo: { status: 'available', items: undoable.results.added.map(item => item.uri), snapshotId: 'snap-2' } },
  token: 'secret',
  getSnapshotId: async () => (++snapshotReads <= 2 ? 'snap-2' : 'snap-4'),
  fetchImpl: async () => { batchedUndoCalls++; return response(true, 'snap-3'); }
});
assert.equal(batchedUndoCalls, 1, 'undo rechecks the snapshot before each API batch');
assert.equal(partialUndo.undo.status, 'conflict', 'a concurrent edit stops remaining undo batches');

const unknownUndo = await undoPlaylistAddOperation({
  operation: undoable, token: 'secret', getSnapshotId: async () => 'snap-2',
  fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'server error' } }) })
});
assert.equal(unknownUndo.undo.status, 'unknown', 'uncertain server errors during undo are not blindly retried');

const unknown = await executePlaylistAddOperation({
  operation: makeOperation(1), playlistId: 'playlist', token: 'secret',
  fetchImpl: async () => { throw new Error('connection lost'); }
});
assert.equal(unknown.items[0].status, 'unknown');
assert.equal(unknown.undo.status, 'review_required');
const serverUncertain = await executePlaylistAddOperation({
  operation: makeOperation(1), playlistId: 'playlist', token: 'secret',
  fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'server error' } }) })
});
assert.equal(serverUncertain.items[0].status, 'unknown', 'a server error may follow a committed write and must not be retried blindly');
assert.equal(serverUncertain.undo.status, 'review_required');

const interrupted = recoverInterruptedOperations([{
  status: 'applying', targetPlaylistId: 'playlist',
  items: [{ uri: 'spotify:track:one', status: 'running' }, { uri: 'spotify:track:two', status: 'pending' }],
  results: { added: [], failed: [] }, undo: { status: 'unavailable' }
}]);
assert.equal(interrupted.changed, true);
assert.equal(interrupted.operations[0].status, 'unknown');
assert.equal(interrupted.operations[0].items[0].status, 'unknown');
assert.equal(interrupted.operations[0].items[1].status, 'pending', 'unsubmitted items remain pending but are not automatically retried');
const uncertainCreate = recoverInterruptedOperations([{ status: 'applying', items: [], results: { added: [] }, undo: {} }]);
assert.equal(uncertainCreate.operations[0].status, 'unknown', 'an interrupted create request is never silently repeated');

console.log('OPERATION_EXECUTOR_TEST=PASS');
