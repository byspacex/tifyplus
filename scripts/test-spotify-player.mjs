import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} app.js içinde bulunamadı`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} fonksiyon sonu bulunamadı`);
}

const actions = [];
const timers = [];

class FakeSpotifyPlayer {
  constructor() {
    this.listeners = new Map();
    actions.push('construct');
  }
  addListener(name, listener) {
    this.listeners.set(name, listener);
  }
  activateElement() {
    actions.push('activate');
    return Promise.resolve();
  }
  connect() {
    actions.push('connect');
    queueMicrotask(() => this.listeners.get('ready')?.({ device_id: 'browser-device' }));
    return Promise.resolve(true);
  }
  disconnect() {
    actions.push('disconnect');
  }
}

const context = {
  console,
  Promise,
  queueMicrotask,
  Spotify: { Player: FakeSpotifyPlayer },
  window: { Spotify: { Player: FakeSpotifyPlayer } },
  state: { accessToken: 'test-token' },
  spotifyPlayer: null,
  spotifyDeviceId: null,
  spotifyPlayerInitPromise: null,
  spotifyPlayerFailureReason: null,
  spotifyPlayerFailureMessage: '',
  spotifySdkUnavailableUntil: 0,
  playbackBackend: 'none',
  activeSpotifyDeviceId: null,
  activeSpotifyDeviceName: '',
  cassetteVolume: { value: '0.85' },
  playerDuration: null,
  playerCurrentTime: null,
  tapeCounter: null,
  cassetteProgressFill: null,
  cassetteDurationSec: 0,
  cassetteCurrentSec: 0,
  getValidSpotifyAccessToken: async () => 'test-token',
  setPlayerSource: () => {},
  formatTapeTime: () => '00:00',
  setPlayerProgress: () => {},
  setUnifiedPlaybackState: () => {},
  requestSpotifyMediaActivation() {
    if (!context.spotifyPlayer) return false;
    context.spotifyPlayer.activateElement();
    return true;
  },
  setTimeout(callback) {
    timers.push(callback);
    return timers.length;
  },
  clearTimeout: () => {}
};

vm.createContext(context);
vm.runInContext([
  extractFunction('startSpotifyPlayerConnection'),
  extractFunction('prepareSpotifyPlayerFromUserGesture'),
  'globalThis.runGesture = prepareSpotifyPlayerFromUserGesture;',
  'globalThis.getFailure = () => spotifyPlayerFailureReason;'
].join('\n'), context);

assert.equal(context.runGesture(), true, 'Kullanıcı dokunuşu oynatıcıyı hazırlamalı');
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(actions.slice(0, 3), ['construct', 'activate', 'connect'], 'Mobil etkinleştirme connect çağrısından önce olmalı');
assert.equal(context.spotifyDeviceId, 'browser-device', 'ready olayı yerel cihaz kimliğini kaydetmeli');
assert.equal(context.getFailure(), null, 'Başarılı bağlantı hata durumunu temizlemeli');

for (const timer of timers) timer();
assert.equal(context.getFailure(), null, 'Eski zaman aşımı başarılı bağlantıyı sonradan bozmamalı');
assert.ok(!actions.includes('disconnect'), 'Hazır oynatıcı bağlantısı kesilmemeli');

assert.match(source, /play-playlist' \|\| action === 'play-track'\) prepareSpotifyPlayerFromUserGesture\(\)/, 'Kart oynatma eylemi dokunuş hazırlığını çağırmalı');
console.log('SPOTIFY_PLAYER_GESTURE_TEST=PASS');
