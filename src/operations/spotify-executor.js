export async function executePlaylistAddOperation({ operation, playlistId, token, fetchImpl = fetch, persist }) {
  const mutable = structuredClone(operation);
  mutable.status = 'applying';
  mutable.targetPlaylistId = playlistId;
  mutable.undo = { status: 'available', items: mutable.results.added.map(item => item.uri), snapshotId: mutable.latestSnapshotId || null };
  await persist?.(mutable);

  const pending = mutable.items.filter(item => item.status === 'pending' && item.uri);
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = pending.slice(offset, offset + 100);
    batch.forEach(item => { item.status = 'running'; });
    await persist?.(mutable);
    let response;
    try {
      response = await fetchImpl('https://api.spotify.com/v1/playlists/' + encodeURIComponent(playlistId) + '/items', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: batch.map(item => item.uri) })
      });
    } catch (error) {
      batch.forEach(item => { item.status = 'unknown'; item.error = error?.message || 'network_unknown'; });
      mutable.status = 'partial';
      mutable.undo.status = 'review_required';
      mutable.results.failed.push(...batch.map(item => ({ uri: item.uri, status: 'unknown' })));
      await persist?.(mutable);
      return mutable;
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const uncertain = response.status >= 500;
      batch.forEach(item => { item.status = uncertain ? 'unknown' : 'failed'; item.error = error?.error?.message || 'http_' + response.status; });
      mutable.status = uncertain || mutable.results.added.length ? 'partial' : 'failed';
      if (uncertain) mutable.undo.status = 'review_required';
      mutable.results.failed.push(...batch.map(item => ({ uri: item.uri, status: uncertain ? 'unknown' : 'failed', error: item.error })));
      await persist?.(mutable);
      return mutable;
    }
    const result = await response.json().catch(() => ({}));
    mutable.latestSnapshotId = result.snapshot_id || mutable.latestSnapshotId || null;
    batch.forEach(item => {
      item.status = 'succeeded';
      mutable.results.added.push({ uri: item.uri, sourcePlaylistId: item.source?.id || null });
    });
    mutable.undo = { status: 'available', items: mutable.results.added.map(item => item.uri), snapshotId: mutable.latestSnapshotId };
    await persist?.(mutable);
  }
  mutable.status = mutable.items.every(item => item.status === 'succeeded' || item.status === 'skipped') ? 'completed' : 'partial';
  mutable.undo.status = mutable.results.added.length ? 'available' : 'unavailable';
  await persist?.(mutable);
  return mutable;
}

export async function undoPlaylistAddOperation({ operation, token, getSnapshotId, fetchImpl = fetch, persist }) {
  if (!operation?.results?.added?.length || operation.undo?.status === 'undone') return { ...operation, undo: { ...operation.undo, status: 'unavailable' } };
  if (operation.undo?.status === 'unknown' || operation.undo?.status === 'review_required' || operation.undo?.status === 'conflict') return operation;
  const currentSnapshot = await getSnapshotId(operation.targetPlaylistId);
  if (!currentSnapshot || currentSnapshot !== operation.undo.snapshotId) {
    const conflicted = { ...operation, undo: { ...operation.undo, status: 'conflict' }, status: 'conflict' };
    await persist?.(conflicted);
    return conflicted;
  }
  const remaining = operation.undo.remaining || operation.results.added.map(item => item.uri);
  for (let offset = 0; offset < remaining.length; offset += 100) {
    const beforeBatchSnapshot = await getSnapshotId(operation.targetPlaylistId);
    if (!beforeBatchSnapshot || beforeBatchSnapshot !== operation.undo.snapshotId) {
      const conflicted = { ...operation, undo: { ...operation.undo, status: 'conflict' }, status: 'conflict' };
      await persist?.(conflicted);
      return conflicted;
    }
    const batch = remaining.slice(offset, offset + 100);
    let response;
    try {
      response = await fetchImpl('https://api.spotify.com/v1/playlists/' + encodeURIComponent(operation.targetPlaylistId) + '/items', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch.map(uri => ({ uri })), snapshot_id: operation.undo.snapshotId })
      });
    } catch (error) {
      const partial = { ...operation, undo: { ...operation.undo, status: 'unknown', error: error?.message || 'network_unknown', remaining: remaining.slice(offset) }, status: 'partial' };
      await persist?.(partial);
      return partial;
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const uncertain = response.status >= 500;
      const partial = { ...operation, undo: { ...operation.undo, status: uncertain ? 'unknown' : 'failed', error: error?.error?.message || 'http_' + response.status, remaining: remaining.slice(offset) }, status: uncertain ? 'unknown' : 'partial' };
      await persist?.(partial);
      return partial;
    }
    const result = await response.json().catch(() => ({}));
    operation = { ...operation, undo: { ...operation.undo, status: 'available', snapshotId: result.snapshot_id || operation.undo.snapshotId, remaining: remaining.slice(offset + batch.length) } };
    await persist?.(operation);
  }
  const undone = { ...operation, undo: { ...operation.undo, status: 'undone', remaining: [] }, status: 'undone' };
  await persist?.(undone);
  return undone;
}
