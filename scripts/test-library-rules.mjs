import assert from 'node:assert/strict';
import { getTrackIdentity } from '../src/library/identity.js';
import { comparePlaylists, createMergePlan, planArtistSpacedOrder, planDurationBuckets } from '../src/rules/library-rules.js';
import { createOperation, operationStorageKey, readOperations, updateOperation, writeOperations } from '../src/operations/journal.js';

const track = (id, artist = 'A', durationMs = 60_000) => ({ id, uri: `spotify:track:${id}`, title: id, artist, durationMs });
const a = { id: 'a', name: 'A', tracks: [track('x'), track('y'), track('y')] };
const b = { id: 'b', name: 'B', tracks: [track('y'), track('z')] };

assert.equal(getTrackIdentity({ id: 'fake' }), null, 'non-Spotify IDs are not treated as cross-playlist matches');
const comparison = comparePlaylists([a, b]);
assert.deepEqual(comparison.common.map(item => item.identity), ['spotify:track:y']);
assert.deepEqual(comparison.unique.map(item => item.identity), ['spotify:track:x', 'spotify:track:z']);
assert.equal(comparison.totalEntries, 5);
const merged = createMergePlan([a, b]);
assert.deepEqual(merged.items.map(item => item.identity), ['spotify:track:x', 'spotify:track:y', 'spotify:track:z']);
assert.equal(merged.skipped.length, 2, 'both in-playlist and cross-playlist repeats are reported');
assert.deepEqual(createMergePlan([a, b], { deduplicate: false }).items.map(item => item.identity), ['spotify:track:x', 'spotify:track:y', 'spotify:track:y', 'spotify:track:y', 'spotify:track:z']);

const duration = planDurationBuckets([
  { id: '1', durationMs: 40_000 }, { id: 'unknown', durationMs: 0 },
  { id: '2', durationMs: 40_000 }, { id: 'long', durationMs: 120_001 }
], 2);
assert.equal(duration.buckets.length, 1);
assert.deepEqual(duration.buckets[0].items.map(item => item.track.id), ['1', '2']);
assert.equal(duration.unknown.length, 1);
assert.equal(duration.oversized.length, 1);

const ordered = planArtistSpacedOrder([
  { id: 'a1', artist: 'A' }, { id: 'a2', artist: 'A' }, { id: 'b1', artist: 'B' }, { id: 'c1', artist: 'C' }
], { pinned: { 0: 2 } });
assert.equal(ordered.tracks[0].id, 'b1', 'pinned entry keeps its slot');
assert.equal(new Set(ordered.tracks.map(item => item.id)).size, 4, 'sorting keeps every entry once');

const memoryStorage = new Map();
const storage = {
  getItem: key => memoryStorage.get(key) || null,
  setItem: (key, value) => memoryStorage.set(key, value)
};
const operation = createOperation({ type: 'merge', userId: 'user-a', sourcePlaylists: [a, b], items: merged.items });
assert.equal(operation.status, 'preview');
assert.equal(writeOperations(storage, 'user-a', [operation]), true);
assert.equal(readOperations(storage, 'user-a').length, 1);
assert.equal(readOperations(storage, 'user-b').length, 0, 'journal data is account-scoped');
assert.notEqual(operationStorageKey('user-a'), operationStorageKey('user-b'));
const updated = updateOperation([operation], operation.id, value => ({ ...value, status: 'applying' }));
assert.equal(updated[0].status, 'applying');
assert.equal(operation.status, 'preview', 'updates do not mutate the prior operation');

console.log('LIBRARY_RULES_TEST=PASS');
