import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

function extractFunction(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
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

let requestedDeviceId = '';
let selectedSource = '';
const connectContext = {
  console,
  encodeURIComponent,
  state: { accessToken: 'test-token' },
  activeSpotifyDeviceId: null,
  activeSpotifyDeviceName: '',
  spotifyDeviceId: null,
  spotifyPlayerFailureReason: null,
  spotifyPlayerFailureMessage: '',
  getSpotifyTrackUri: () => 'spotify:track:1234567890123456789012',
  getValidSpotifyAccessToken: async () => 'test-token',
  isCurrentPlaybackRequest: () => true,
  setUnifiedPlaybackState: playing => assert.equal(playing, true),
  hideSpotifyEmbed: () => {},
  setPlayerSource: (mode, label) => { selectedSource = `${mode}|${label}`; },
  fetch: async url => {
    if (String(url).endsWith('/devices')) {
      return {
        ok: true,
        json: async () => ({
          devices: [
            { id: 'desktop-device', name: 'Masaüstü', type: 'Computer', is_active: true, is_restricted: false },
            { id: 'phone-device', name: 'Telefon', type: 'Smartphone', is_active: false, is_restricted: false }
          ]
        })
      };
    }
    requestedDeviceId = new URL(String(url)).searchParams.get('device_id') || '';
    return { ok: true, json: async () => ({}) };
  }
};

vm.createContext(connectContext);
vm.runInContext(`${extractFunction('playThroughSpotifyConnect')}\nglobalThis.runConnect = playThroughSpotifyConnect;`, connectContext);
assert.equal(await connectContext.runConnect({ id: 'track-id' }, 1, {}), true, 'Spotify Connect yedek yolu parçayı başlatmalı');
assert.equal(requestedDeviceId, 'phone-device', 'Mobil cihaz masaüstünden önce seçilmeli');
assert.match(selectedSource, /^spotify-remote\|Spotify Connect • Telefon$/, 'Player seçilen Spotify Connect cihazını göstermeli');
assert.match(source, /name: 'Tify Plus Pulse Web Player'/, 'Yerel Spotify cihazı Tify Plus Pulse adıyla oluşturulmalı');
assert.match(source, /return playbackBackend === 'spotify-remote'[\s\S]*activeSpotifyDeviceId !== spotifyDeviceId;/, 'Spotify Connect yalnızca kullanıcı uzaktaki cihazı seçtiğinde öncelikli olmalı');
assert.doesNotMatch(source, /spotifyStarted = await playThroughSpotify\(track, requestId, signal\);\s*if \(!spotifyStarted[\s\S]{0,180}playThroughSpotifyConnect/, 'Yerel player hatası bilgisayardaki Spotify cihazına otomatik aktarılmamalı');
assert.match(source, /window\.addEventListener\('pagehide', disconnectLocalSpotifyPlayer\)/, 'Sayfa kapanırken eski Spotify web cihazı ayrılmalı');
assert.match(source, /if \(playbackBackend === 'spotify'\) setPlayerSource\('spotify', 'Bu cihazda çalıyor'\)/, 'Uzak veya gömülü oynatıcı yerel SDK cihazı gibi etiketlenmemeli');
assert.match(source, /spotifyStarted = await playThroughSpotifyEmbed\(track, requestId, signal\)/, 'Yerel SDK hazır değilse tarayıcı içi Spotify oynatıcısı kullanılmalı');
assert.match(source, /playbackBackend === 'spotify-embed'[\s\S]*spotifyEmbedController\.togglePlay\(\)/, 'Özel oynat düğmesi gömülü Spotify oynatıcısını kontrol etmeli');
assert.match(source, /playbackBackend === 'spotify-embed'[\s\S]*spotifyEmbedController\.seek\(/, 'İleri sarma gömülü Spotify oynatıcısına iletilmeli');
assert.match(html, /open\.spotify\.com\/embed\/iframe-api\/v1/, 'Resmi Spotify iFrame API sayfaya yüklenmeli');
assert.match(html, /id="spotifyEmbedPanel"/, 'Gömülü oynatıcı paneli bulunmalı');
assert.match(headers, /script-src[^;]*https:\/\/open\.spotify\.com/, 'Cloudflare CSP Spotify iFrame API betiğine izin vermeli');
assert.match(headers, /script-src[^;]*https:\/\/embed-cdn\.spotifycdn\.com/, 'Cloudflare CSP Spotify resmi embed CDN betiğine izin vermeli');
assert.match(headers, /script-src[^;]*'unsafe-eval'/, 'Spotify resmi embed çalışma zamanı için gereken değerlendirme izni bulunmalı');

console.log('SPOTIFY_PLAYER_GESTURE_TEST=PASS');
console.log('SPOTIFY_CONNECT_FALLBACK_TEST=PASS');
console.log('SPOTIFY_BROWSER_EMBED_FALLBACK_TEST=PASS');
