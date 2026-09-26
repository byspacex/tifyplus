import { getTrackIdentity } from '../library/identity.js';

function playlistTrackRecords(playlists) {
  const records = new Map();
  const unverifiable = [];
  playlists.forEach((playlist, playlistIndex) => {
    (playlist.tracks || []).forEach((track, trackIndex) => {
      const identity = getTrackIdentity(track);
      if (!identity) { unverifiable.push({ track, playlist, playlistIndex, trackIndex }); return; }
      if (!records.has(identity)) records.set(identity, { identity, track, occurrences: [] });
      records.get(identity).occurrences.push({ playlist, playlistIndex, trackIndex, track });
    });
  });
  return { records, unverifiable };
}

export function comparePlaylists(playlists) {
  const { records, unverifiable } = playlistTrackRecords(playlists);
  const common = [], unique = [];
  records.forEach(record => (new Set(record.occurrences.map(item => item.playlistIndex)).size > 1 ? common : unique).push(record));
  return {
    totalEntries: playlists.reduce((sum, playlist) => sum + (playlist.tracks || []).length, 0),
    common, unique, unverifiable,
    byPlaylist: playlists.map((playlist, playlistIndex) => ({
      playlist, playlistIndex,
      onlyHere: unique.filter(record => record.occurrences[0].playlistIndex === playlistIndex),
      commonHere: common.filter(record => record.occurrences.some(item => item.playlistIndex === playlistIndex))
    }))
  };
}

export function createMergePlan(playlists, { deduplicate = true } = {}) {
  const items = [], skipped = [], seen = new Set();
  playlists.forEach((playlist, playlistIndex) => {
    (playlist.tracks || []).forEach((track, trackIndex) => {
      const identity = getTrackIdentity(track);
      if (deduplicate && identity && seen.has(identity)) {
        skipped.push({ track, source: playlist, sourceIndex: playlistIndex, trackIndex, reason: 'duplicate' });
        return;
      }
      if (identity) seen.add(identity);
      items.push({ track, source: playlist, sourceIndex: playlistIndex, trackIndex, identity });
    });
  });
  return { items, skipped, unknownDuration: items.filter(item => !(Number(item.track.durationMs) > 0)).length };
}

export function createDeduplicationPlan(tracks, { keep = 'first' } = {}) {
  const input = tracks || [];
  const indices = input.map((track, index) => ({ track, index, identity: getTrackIdentity(track) }));
  const retained = new Set();
  const kept = [], removed = [], unverifiable = [];
  const ordered = keep === 'last' ? [...indices].reverse() : indices;
  for (const item of ordered) {
    if (!item.identity) { unverifiable.push(item); continue; }
    if (retained.has(item.identity)) removed.push({ ...item, reason: 'duplicate' });
    else { retained.add(item.identity); kept.push(item); }
  }
  if (keep === 'last') kept.reverse();
  removed.sort((a, b) => a.index - b.index);
  unverifiable.sort((a, b) => a.index - b.index);
  return { kept, removed, unverifiable };
}

export function createArtistExclusionPlan(tracks, artistId) {
  const removed = [], kept = [];
  (tracks || []).forEach((track, index) => {
    const record = { track, index };
    if (artistId && (track.artistIds || []).includes(artistId)) removed.push(record);
    else kept.push(record);
  });
  return { kept, removed };
}

export function planDurationBuckets(tracks, targetMinutes) {
  const targetMs = Math.max(1, Number(targetMinutes)) * 60_000;
  const known = [], unknown = [], oversized = [];
  (tracks || []).forEach((track, index) => {
    const durationMs = Number(track?.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) unknown.push({ track, index });
    else if (durationMs > targetMs) oversized.push({ track, index, durationMs });
    else known.push({ track, index, durationMs });
  });
  const buckets = [];
  let bucket = [], durationMs = 0;
  known.forEach(item => {
    if (bucket.length && durationMs + item.durationMs > targetMs) {
      buckets.push({ items: bucket, durationMs });
      bucket = []; durationMs = 0;
    }
    bucket.push(item); durationMs += item.durationMs;
  });
  if (bucket.length) buckets.push({ items: bucket, durationMs });
  return { buckets, unknown, oversized, targetMs };
}

export function planArtistSpacedOrder(tracks, { maxConsecutive = 1, pinned = {} } = {}) {
  const ordered = [...(tracks || [])];
  const pinEntries = Object.entries(pinned).map(([position, trackIndex]) => [Number(position), Number(trackIndex)]);
  const used = new Set(pinEntries.map(([, index]) => index));
  const result = new Array(ordered.length);
  pinEntries.forEach(([position, index]) => { if (position >= 0 && position < result.length && ordered[index]) result[position] = ordered[index]; });
  const buckets = new Map();
  ordered.forEach((track, index) => {
    if (used.has(index)) return;
    const artistKey = String(track.artistIds?.[0] || track.artist || '').trim().toLocaleLowerCase();
    if (!buckets.has(artistKey)) buckets.set(artistKey, []);
    buckets.get(artistKey).push(track);
  });
  const recent = [];
  for (let position = 0; position < result.length; position++) {
    if (result[position]) {
      recent.push(String(result[position].artistIds?.[0] || result[position].artist || '').toLocaleLowerCase());
      continue;
    }
    const available = [...buckets.entries()].filter(([, items]) => items.length).sort((a, b) => b[1].length - a[1].length);
    let chosen = available.find(([artist]) => recent.slice(-maxConsecutive).filter(item => item === artist).length < maxConsecutive);
    if (!chosen) chosen = available[0];
    if (!chosen) continue;
    result[position] = chosen[1].shift();
    recent.push(chosen[0]);
  }
  const violations = [];
  for (let index = 0; index < result.length; index++) {
    const artist = String(result[index]?.artistIds?.[0] || result[index]?.artist || '').toLocaleLowerCase();
    if (artist && recentArtistCount(result, index, artist, maxConsecutive + 1) > maxConsecutive) violations.push(index);
  }
  return { tracks: result, violations };
}

function recentArtistCount(tracks, end, artist, count) {
  return tracks.slice(Math.max(0, end - count + 1), end + 1)
    .filter(track => String(track.artistIds?.[0] || track.artist || '').toLocaleLowerCase() === artist).length;
}
