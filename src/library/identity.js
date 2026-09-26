/** Stable identity for the same Spotify recording across playlists. */
export function getTrackIdentity(track) {
  if (typeof track?.uri === 'string' && track.uri.startsWith('spotify:track:')) return track.uri;
  const id = String(track?.id || '');
  if (/^[A-Za-z0-9]{22}$/.test(id)) return 'spotify:track:' + id;
  return null;
}

export function getTrackArtistIds(track) {
  if (Array.isArray(track?.artistIds) && track.artistIds.length) return track.artistIds.map(String).filter(Boolean);
  if (Array.isArray(track?.artists)) return track.artists.map(artist => String(artist?.id || '')).filter(Boolean);
  return [];
}

export function getPlaylistEntryKey(playlistId, track, index) {
  return String(playlistId) + ':' + index + ':' + (getTrackIdentity(track) || 'unverified');
}
