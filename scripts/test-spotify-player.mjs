import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const themeInit = fs.readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');

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
  localSpotifyDeviceLabel: 'Tify Plus Web • TEST',
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
  setLocalVirtualDeviceState: () => {},
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
  localSpotifyDeviceLabel: 'Tify Plus Web • TEST',
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
assert.match(source, /name: localSpotifyDeviceLabel/, 'Yerel Spotify cihazı sekmeye özel anonim adla oluşturulmalı');
assert.ok(source.includes('globalThis.crypto.getRandomValues(anonymousDeviceBytes)'), 'Anonim cihaz eki kişisel veriden değil güvenli rastgele kaynaktan üretilmeli');
assert.doesNotMatch(source, /localSpotifyDeviceLabel\s*=.*state\.(user|profile)|localSpotifyDeviceLabel\s*=.*email/i, 'Cihaz adı kullanıcı kimliği veya e-postadan üretilmemeli');
assert.match(html, /id="localVirtualDevice"/, 'Sitede yerel sanal cihaz durum kartı bulunmalı');
assert.match(source, /return playbackBackend === 'spotify-remote'[\s\S]*activeSpotifyDeviceId !== spotifyDeviceId;/, 'Spotify Connect yalnızca kullanıcı uzaktaki cihazı seçtiğinde öncelikli olmalı');
assert.doesNotMatch(source, /spotifyStarted = await playThroughSpotify\(track, requestId, signal\);\s*if \(!spotifyStarted[\s\S]{0,180}playThroughSpotifyConnect/, 'Yerel player hatası bilgisayardaki Spotify cihazına otomatik aktarılmamalı');
assert.match(source, /window\.addEventListener\('pagehide', disconnectLocalSpotifyPlayer\)/, 'Sayfa kapanırken eski Spotify web cihazı ayrılmalı');
assert.match(source, /if \(playbackBackend === 'spotify'\) setPlayerSource\('spotify', 'Bu cihazda çalıyor'\)/, 'Uzak veya gömülü oynatıcı yerel SDK cihazı gibi etiketlenmemeli');
assert.match(source, /spotifyStarted = await playThroughSpotifyEmbed\(track, requestId, signal\)/, 'Yerel SDK hazır değilse tarayıcı içi Spotify oynatıcısı kullanılmalı');
assert.match(source, /playbackBackend === 'spotify-embed'[\s\S]*spotifyEmbedController\.togglePlay\(\)/, 'Özel oynat düğmesi gömülü Spotify oynatıcısını kontrol etmeli');
assert.match(source, /playbackBackend === 'spotify-embed'[\s\S]*spotifyEmbedController\.seek\(/, 'İleri sarma gömülü Spotify oynatıcısına iletilmeli');
assert.match(source, /\/v1\/me\/player\/shuffle\?\$\{query\}/, 'Karışık çalma Spotify Web API durumuna gönderilmeli');
assert.match(html, /id="btnPlayerShuffle"[\s\S]*aria-pressed="false"/, 'Player barında erişilebilir karışık çalma denetimi bulunmalı');
assert.match(html, /open\.spotify\.com\/embed\/iframe-api\/v1/, 'Resmi Spotify iFrame API sayfaya yüklenmeli');
assert.match(html, /id="spotifyEmbedPanel"/, 'Gömülü oynatıcı paneli bulunmalı');
assert.match(headers, /script-src[^;]*https:\/\/open\.spotify\.com/, 'Cloudflare CSP Spotify iFrame API betiğine izin vermeli');
assert.match(headers, /script-src[^;]*https:\/\/embed-cdn\.spotifycdn\.com/, 'Cloudflare CSP Spotify resmi embed CDN betiğine izin vermeli');
assert.match(headers, /script-src[^;]*'unsafe-eval'/, 'Spotify resmi embed çalışma zamanı için gereken değerlendirme izni bulunmalı');
assert.match(headers, /frame-src[^;]*https:\/\/sdk\.scdn\.co/, 'Spotify Web Playback SDK gizli oynatıcı çerçevesine izin verilmeli');
assert.match(headers, /encrypted-media=\(self "https:\/\/sdk\.scdn\.co"\)/, 'Spotify SDK çerçevesine şifreli medya yetkisi aktarılmalı');
assert.match(styles, /\.floating-web-player \.player-center[\s\S]*left:\s*50%[\s\S]*translateX\(-50%\)/, 'Masaüstü player kontrolleri parça metninden bağımsız ekran merkezinde kalmalı');
assert.match(styles, /\.energy-head i\s*\{\s*display:\s*none/, 'İlerleme göstergesinde yıldırım logosu görünmemeli');
assert.match(styles, /energyRingFlash/, 'İlerleme göstergesi ikon yerine enerji parlamasıyla hareket etmeli');
assert.match(html, /class="energy-bolt-fx"/, 'İlerleme göstergesinde çatallanan SVG yıldırım efekti bulunmalı');
assert.match(html, /class="player-ambient"/, 'Premium oynatıcı yüzeyinde bağımsız ortam ışığı katmanı bulunmalı');
assert.match(html, /class="player-now-label"/, 'Çalan parça alanında canlı yayın durum etiketi bulunmalı');
assert.match(styles, /\.energy-head\s*\{[\s\S]*width:\s*14px;[\s\S]*height:\s*14px;[\s\S]*radial-gradient/, 'İlerleme başı dik çizgi yerine plazma çekirdeği olmalı');
assert.doesNotMatch(styles, /\.energy-head\s*\{[\s\S]{0,180}width:\s*4px;[\s\S]{0,80}height:\s*22px;/, 'Eski beyaz dik ilerleme çizgisi geri gelmemeli');
assert.match(styles, /\.player-right\s*\{[\s\S]*clip-path:\s*polygon/, 'Sağ oynatıcı kontrolleri köşeli bütünleşik kontrol rayı kullanmalı');
assert.match(styles, /#playerOpenSpotifyBtn[\s\S]*border-radius:\s*50%/, 'Spotify aksiyonu kontrol rayında özel dairesel düğme olmalı');
assert.match(html, /id="btnThemeToggle"/, 'Site başlığında erişilebilir tema anahtarı bulunmalı');
assert.match(html, /Tify<sup class="brand-plus"[^>]*>\+<\/sup><small>Pulse<\/small>/, 'Görsel marka Tify üstü artı ve Pulse olarak yazılmalı');
assert.match(styles, /\.brand-title small\s*\{[\s\S]*color:\s*var\(--lime\);[\s\S]*font:\s*inherit;/, 'Pulse eski Plus ile aynı yeşil tipografik ölçüyü kullanmalı');
assert.match(html, /id="playerVolumeValue"/, 'Ses kontrolünde canlı yüzde göstergesi bulunmalı');
assert.match(styles, /html\[data-theme="light"\][\s\S]*--bg:\s*#e8e6df/, 'Açık tema saf beyaz yerine düşük parlamalı sıcak zemin kullanmalı');
assert.match(styles, /\.floating-web-player\s*\{[\s\S]*clip-path:\s*polygon/, 'Oynatıcı barı yuvarlak kapsül yerine kesik köşeli kasa kullanmalı');
assert.match(themeInit, /document\.documentElement\.dataset\.theme\s*=\s*theme/, 'Tema ilk boyamadan önce belge köküne uygulanmalı');
assert.match(themeInit, /\? savedTheme : 'light'/, 'İlk ziyaret düşük parlamalı açık tema ile başlamalı');
assert.match(styles, /@keyframes polarStarSpin/, 'Üst artı simgesi kutup yıldızı gibi dönmeli');
assert.match(styles, /\.brand-title \.brand-plus::before[\s\S]*polarStarTwinkle/, 'Üst artı simgesinde yıldız ışını ve parıltı animasyonu bulunmalı');
assert.match(styles, /--f-display:\s*'Inter'[\s\S]*'Noto Sans'/, 'Başlık font zinciri Türkçe ve farklı alfabelerde güvenli olmalı');
assert.match(html, /id="externalPlaylistModal"/, 'Dış Spotify bağlantıları için ayrı inceleme penceresi bulunmalı');
assert.match(source, /openExternalPlaylistEmbed\(extractedId/, 'Dış bağlantı API hatasında gerçek Spotify embed görünümüne düşmeli');
assert.match(source, /fetchSpotifyPlaylistOEmbed/, 'Dış Spotify bağlantısı resmî oEmbed metaverisiyle doğrulanmalı');
assert.match(source, /Promise\.allSettled\(\[/, 'Playlist metaverisi ve erişim kontrollü parça isteği birbirinden bağımsız ele alınmalı');
assert.match(source, /Spotify'ın güncel API kuralı/, 'Başkasına ait playlistlerde Spotify erişim sınırı kullanıcıya dürüstçe açıklanmalı');
assert.match(styles, /\.external-playlist-embed\s*\{[^}]*height:352px/, 'Resmî playlist embed önerilen sabit yükseklikte kırpılmadan gösterilmeli');
assert.match(source, /modalCard\.scrollTop = 0/, 'Dış playlist penceresi her açılışta başlık hizasından başlamalı');
assert.match(styles, /#externalPlaylistModal \.external-playlist-card[^}]*overflow:hidden/, 'Genel modal kaydırması dış playlist başlığını kırpmamalı');
assert.doesNotMatch(source, /Demo modunda örnek playlist analizi açıldı/, 'Dış playlist hatası kullanıcının karşısına demo playlist çıkarmamalı');
assert.doesNotMatch(source, /state\.playlists\.unshift\(newPl\)/, 'Dış playlist kullanıcının kişisel kütüphanesine karıştırılmamalı');
assert.match(source, /const activePlaylists = state\.isLoggedIn \? state\.playlists : MOCK_PLAYLISTS/, 'Demo eşleşmeleri yalnızca giriş yapılmamış ana sayfada çalışmalı');
assert.match(source, /sessionStorage\.setItem\(LIBRARY_CACHE_KEY/, 'Kişisel Spotify kütüphanesi sekme oturumuna özel saklanmalı');
const linkContext = { URL };
vm.createContext(linkContext);
vm.runInContext(`${extractFunction('extractCleanPlaylistId')}\nglobalThis.parsePlaylist = extractCleanPlaylistId;`, linkContext);
assert.equal(linkContext.parsePlaylist('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=test'), '37i9dQZF1DXcBWIGoYBM5M', 'Spotify playlist bağlantısı sorgu parametrelerinden temizlenmeli');
assert.equal(linkContext.parsePlaylist('https://open.spotify.com/user/example'), '', 'Profil bağlantısı yanlışlıkla playlist olarak açılmamalı');
assert.match(styles, /realisticBoltBurst/, 'Gerçekçi yıldırım düzensiz çoklu çakma animasyonu kullanmalı');
assert.match(styles, /energy-bolt-branch/, 'Yıldırım efektinde bağımsız yan dallar bulunmalı');
assert.match(html, /animate attributeName="d"/, 'Zikzak yıldırım hattının geometrisi hareket halinde değişmeli');
assert.match(html, /energy-bolt-node node-start/, 'Zikzak sinyalin camgöbeği başlangıç düğümü bulunmalı');
assert.match(html, /energy-bolt-node node-end/, 'Zikzak sinyalin yeşil bitiş düğümü bulunmalı');

console.log('SPOTIFY_PLAYER_GESTURE_TEST=PASS');
console.log('SPOTIFY_CONNECT_FALLBACK_TEST=PASS');
console.log('SPOTIFY_BROWSER_EMBED_FALLBACK_TEST=PASS');
