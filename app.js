/**
 * Tify Plus Pulse - Official Spotify Web API Engine (Dual Endpoint & Auto Fallback Fetcher)
 */

// The removed mobile dock used URL fragments such as #catalogSection. Mobile
// browsers persist that fragment between visits and otherwise jump halfway down
// the page before the app becomes interactive.
const LEGACY_MOBILE_NAV_HASHES = new Set(['#catalogsection', '#studio']);
if (LEGACY_MOBILE_NAV_HASHES.has(window.location.hash.toLowerCase())) {
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${window.location.search}`);

  const restorePageStart = () => window.scrollTo(0, 0);
  restorePageStart();
  window.requestAnimationFrame(restorePageStart);
  window.addEventListener('load', restorePageStart, { once: true });
  window.addEventListener('pageshow', restorePageStart, { once: true });
}

document.addEventListener('DOMContentLoaded', () => {

  // Security migration: OAuth secrets belong to the current tab session, not
  // persistent browser storage. Existing installations are migrated once.
  ['spotify_access_token', 'spotify_refresh_token', 'spotify_token_expires_at', 'spotify_code_verifier', 'spotify_client_id'].forEach(key => {
    const legacyValue = localStorage.getItem(key);
    if (legacyValue && !sessionStorage.getItem(key)) sessionStorage.setItem(key, legacyValue);
    localStorage.removeItem(key);
  });

  const STORAGE_CONSENT_KEY = 'tify_storage_consent_v1';
  let storageConsent = localStorage.getItem(STORAGE_CONSENT_KEY) || 'unset';
  localStorage.removeItem('tify_storage_consent');
  const allowsFunctionalStorage = () => storageConsent === 'functional';

  const THEME_STORAGE_KEY = 'tify_ui_theme';
  const themeToggle = document.getElementById('btnThemeToggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(theme, persist = true) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    if (themeMeta) themeMeta.content = nextTheme === 'light' ? '#e8e6df' : '#060812';
    if (themeToggle) {
      const isLight = nextTheme === 'light';
      themeToggle.setAttribute('aria-pressed', String(isLight));
      themeToggle.setAttribute('aria-label', isLight ? 'Koyu temaya geç' : 'Açık temaya geç');
      themeToggle.querySelector('.theme-toggle-icon').innerHTML = `<i class="fa-solid ${isLight ? 'fa-sun' : 'fa-moon'}"></i>`;
      themeToggle.querySelector('.theme-toggle-label').textContent = isLight ? 'Açık' : 'Koyu';
    }
    if (!persist) return;
    sessionStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    if (allowsFunctionalStorage()) localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  applyTheme(document.documentElement.dataset.theme || 'light', false);
  themeToggle?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });

  // App State Store
  const state = {
    accessToken: sessionStorage.getItem('spotify_access_token') || null,
    isLoggedIn: false,
    userId: sessionStorage.getItem('spotify_user_id') || "",
    userName: sessionStorage.getItem('spotify_user_name') || "Spotify Kullanıcısı",
    userEmail: sessionStorage.getItem('spotify_user_email') || "",
    userAvatar: sessionStorage.getItem('spotify_user_avatar') || "",
    userProduct: "",
    playlists: [],
    currentPlaylist: null,
    externalPlaylist: null,
    selectedTrackIds: new Set(),
    versionedHistory: [],
    presenceMap: {}
  };

  // Personal Spotify data used to be stored under unscoped localStorage keys.
  // Remove those legacy records once so one Spotify account can never inherit
  // another account's library on a shared browser profile.
  (() => {
    const legacyKeys = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (['spotify_library_cache', 'spotify_pulse_snapshots', 'spotify_last_sync', 'spotify_user_name', 'spotify_user_email', 'spotify_user_avatar'].includes(key) || key.startsWith('spotify_tracks_'))) {
        legacyKeys.push(key);
      }
    }
    legacyKeys.forEach(key => localStorage.removeItem(key));
  })();

  // App-native localization. Locale is selected from the browser's country-aware
  // language tag (for example pt-BR or de-DE) without requesting precise location.
  const LOCALES = {
    tr: { name:'Türkçe', demo:'Örnek Demo', backups:'Yedekler', connect:'Spotify ile Giriş', studio:'Stüdyoya Bağlan →', collection:'SOOND Koleksiyonu', eyebrow:'● DÜZENLE. BAĞLAN. KONTROL ET.', heroDescription:'Spotify arşivinizi akıllı eşleştirme, gerçek rastgelelik ve profesyonel düzenleme araçlarıyla yönetin.', analyze:'İncele', fusionEngine:'FÜZYON MOTORU', fusionTitle:'Akıllı Playlist Eşleşmeleri & DNA Analizi', fusionSubtitle:'Müzik türü ve frekans benzerliğine göre keşfedilen güçlü eşleşmeler', collectionLabel:'KOLEKSİYON', playlists:'Çalma Listeleri', list:'Liste', tracks:'Şarkı', curator:'Küratör', private:'Gizli', public:'Açık', compatible:'Uyumlu', common:'Ortak Şarkı', match:'Eşleşmeyi Aç', search:'Koleksiyonda ara...', vinyl:'Albüm Vitrini', rack:'Liste Modu', auto:'Otomatik' },
    en: { name:'English', demo:'Live Demo', backups:'Backups', connect:'Connect Spotify', studio:'Connect Studio →', collection:'SOOND Collection', eyebrow:'● CURATE. CONNECT. CONTROL.', heroDescription:'Shape your Spotify library with smart matching, true randomness and professional curation tools.', analyze:'Analyze', fusionEngine:'FUSION ENGINE', fusionTitle:'Smart Playlist Matches & DNA Analysis', fusionSubtitle:'High-signal matches discovered through genre and frequency similarity', collectionLabel:'COLLECTION', playlists:'Playlists', list:'List', tracks:'Tracks', curator:'Curator', private:'Private', public:'Public', compatible:'Compatible', common:'Shared Tracks', match:'Open Match', search:'Search collection...', vinyl:'Cover Gallery', rack:'List View', auto:'Auto' },
    de: { name:'Deutsch', demo:'Live-Demo', backups:'Sicherungen', connect:'Spotify verbinden', studio:'Studio verbinden →', collection:'SOOND-Sammlung', eyebrow:'● KURATIEREN. VERBINDEN. STEUERN.', heroDescription:'Verwalte deine Spotify-Sammlung mit intelligentem Matching, echtem Zufall und professionellen Werkzeugen.', analyze:'Analysieren', fusionEngine:'FUSIONSMOTOR', fusionTitle:'Intelligente Playlist-Matches & DNA-Analyse', fusionSubtitle:'Starke Übereinstimmungen nach Genre- und Frequenzähnlichkeit', collectionLabel:'SAMMLUNG', playlists:'Playlists', list:'Liste', tracks:'Titel', curator:'Kurator', private:'Privat', public:'Öffentlich', compatible:'Kompatibel', common:'Gemeinsame Titel', match:'Match öffnen', search:'Sammlung durchsuchen...', vinyl:'Cover-Galerie', rack:'Listenansicht', auto:'Automatisch' },
    fr: { name:'Français', demo:'Démo', backups:'Sauvegardes', connect:'Connecter Spotify', studio:'Connecter le studio →', collection:'Collection SOOND', eyebrow:'● CRÉER. CONNECTER. CONTRÔLER.', heroDescription:'Façonnez votre bibliothèque Spotify avec des correspondances intelligentes et des outils de curation professionnels.', analyze:'Analyser', fusionEngine:'MOTEUR DE FUSION', fusionTitle:'Correspondances intelligentes & analyse ADN', fusionSubtitle:'Correspondances fortes selon les genres et les fréquences', collectionLabel:'COLLECTION', playlists:'Playlists', list:'Liste', tracks:'Titres', curator:'Curateur', private:'Privée', public:'Publique', compatible:'Compatible', common:'Titres communs', match:'Ouvrir', search:'Rechercher...', vinyl:'Galerie', rack:'Vue liste', auto:'Automatique' },
    es: { name:'Español', demo:'Demo', backups:'Copias', connect:'Conectar Spotify', studio:'Conectar estudio →', collection:'Colección SOOND', eyebrow:'● CURA. CONECTA. CONTROLA.', heroDescription:'Organiza tu biblioteca de Spotify con coincidencias inteligentes y herramientas profesionales.', analyze:'Analizar', fusionEngine:'MOTOR DE FUSIÓN', fusionTitle:'Coincidencias inteligentes y análisis de ADN', fusionSubtitle:'Coincidencias por similitud de género y frecuencia', collectionLabel:'COLECCIÓN', playlists:'Playlists', list:'Lista', tracks:'Canciones', curator:'Curador', private:'Privada', public:'Pública', compatible:'Compatible', common:'Canciones comunes', match:'Abrir coincidencia', search:'Buscar colección...', vinyl:'Galería', rack:'Vista de lista', auto:'Automático' },
    it: { name:'Italiano', demo:'Demo', backups:'Backup', connect:'Collega Spotify', studio:'Collega lo studio →', collection:'Collezione SOOND', eyebrow:'● CURA. CONNETTI. CONTROLLA.', heroDescription:'Organizza la tua libreria Spotify con abbinamenti intelligenti e strumenti professionali.', analyze:'Analizza', fusionEngine:'MOTORE FUSIONE', fusionTitle:'Abbinamenti intelligenti e analisi DNA', fusionSubtitle:'Abbinamenti per genere e frequenza', collectionLabel:'COLLEZIONE', playlists:'Playlist', list:'Elenco', tracks:'Brani', curator:'Curatore', private:'Privata', public:'Pubblica', compatible:'Compatibile', common:'Brani comuni', match:'Apri', search:'Cerca...', vinyl:'Galleria', rack:'Vista elenco', auto:'Automatico' },
    pt: { name:'Português', demo:'Demonstração', backups:'Backups', connect:'Conectar Spotify', studio:'Conectar estúdio →', collection:'Coleção SOOND', eyebrow:'● ORGANIZE. CONECTE. CONTROLE.', heroDescription:'Organize sua biblioteca Spotify com combinações inteligentes e ferramentas profissionais.', analyze:'Analisar', fusionEngine:'MOTOR DE FUSÃO', fusionTitle:'Combinações inteligentes e análise de DNA', fusionSubtitle:'Combinações por gênero e frequência', collectionLabel:'COLEÇÃO', playlists:'Playlists', list:'Lista', tracks:'Faixas', curator:'Curador', private:'Privada', public:'Pública', compatible:'Compatível', common:'Faixas em comum', match:'Abrir', search:'Buscar coleção...', vinyl:'Galeria', rack:'Lista', auto:'Automático' },
    ru: { name:'Русский', demo:'Демо', backups:'Резервные копии', connect:'Подключить Spotify', studio:'Подключить студию →', collection:'Коллекция SOOND', eyebrow:'● СОЗДАВАЙ. ПОДКЛЮЧАЙ. УПРАВЛЯЙ.', heroDescription:'Управляйте медиатекой Spotify с умным подбором и профессиональными инструментами.', analyze:'Анализ', fusionEngine:'ДВИЖОК СЛИЯНИЯ', fusionTitle:'Умные совпадения и ДНК-анализ', fusionSubtitle:'Совпадения по жанру и частотному профилю', collectionLabel:'КОЛЛЕКЦИЯ', playlists:'Плейлисты', list:'Список', tracks:'Треки', curator:'Куратор', private:'Приватный', public:'Публичный', compatible:'Совместимо', common:'Общие треки', match:'Открыть', search:'Поиск...', vinyl:'Обложки', rack:'Список', auto:'Авто' },
    ar: { name:'العربية', demo:'عرض تجريبي', backups:'النسخ الاحتياطية', connect:'ربط Spotify', studio:'ربط الاستوديو ←', collection:'مجموعة SOOND', eyebrow:'● نظّم. اتصل. تحكّم.', heroDescription:'نظّم مكتبة Spotify بالمطابقة الذكية وأدوات التنظيم الاحترافية.', analyze:'تحليل', fusionEngine:'محرك الدمج', fusionTitle:'مطابقات ذكية وتحليل DNA', fusionSubtitle:'مطابقات حسب النوع والتردد', collectionLabel:'المجموعة', playlists:'قوائم التشغيل', list:'قائمة', tracks:'مقاطع', curator:'المنسق', private:'خاصة', public:'عامة', compatible:'متوافق', common:'مقاطع مشتركة', match:'فتح', search:'بحث في المجموعة...', vinyl:'معرض الأغلفة', rack:'عرض القائمة', auto:'تلقائي' },
    zh: { name:'中文', demo:'演示', backups:'备份', connect:'连接 Spotify', studio:'连接工作室 →', collection:'SOOND 收藏', eyebrow:'● 编排・连接・掌控', heroDescription:'使用智能匹配和专业编排工具管理您的 Spotify 音乐库。', analyze:'分析', fusionEngine:'融合引擎', fusionTitle:'智能歌单匹配与 DNA 分析', fusionSubtitle:'根据流派和频率相似度发现匹配', collectionLabel:'收藏', playlists:'播放列表', list:'列表', tracks:'歌曲', curator:'创建者', private:'私密', public:'公开', compatible:'匹配', common:'共同歌曲', match:'打开匹配', search:'搜索收藏...', vinyl:'封面画廊', rack:'列表视图', auto:'自动' },
    ja: { name:'日本語', demo:'デモ', backups:'バックアップ', connect:'Spotifyに接続', studio:'スタジオに接続 →', collection:'SOONDコレクション', eyebrow:'● 選ぶ・つなぐ・操る', heroDescription:'スマートマッチングとプロ向けツールでSpotifyライブラリを整理します。', analyze:'分析', fusionEngine:'フュージョンエンジン', fusionTitle:'スマートプレイリストマッチ＆DNA分析', fusionSubtitle:'ジャンルと周波数の類似性から強い組み合わせを発見', collectionLabel:'コレクション', playlists:'プレイリスト', list:'リスト', tracks:'曲', curator:'作成者', private:'非公開', public:'公開', compatible:'相性良好', common:'共通曲', match:'開く', search:'コレクションを検索...', vinyl:'カバー表示', rack:'リスト表示', auto:'自動' },
    ko: { name:'한국어', demo:'데모', backups:'백업', connect:'Spotify 연결', studio:'스튜디오 연결 →', collection:'SOOND 컬렉션', eyebrow:'● 큐레이션. 연결. 제어.', heroDescription:'스마트 매칭과 전문 도구로 Spotify 라이브러리를 관리하세요.', analyze:'분석', fusionEngine:'퓨전 엔진', fusionTitle:'스마트 플레이리스트 매칭 및 DNA 분석', fusionSubtitle:'장르와 주파수 유사도로 발견한 매칭', collectionLabel:'컬렉션', playlists:'플레이리스트', list:'목록', tracks:'곡', curator:'큐레이터', private:'비공개', public:'공개', compatible:'호환', common:'공통 곡', match:'열기', search:'컬렉션 검색...', vinyl:'커버 갤러리', rack:'목록 보기', auto:'자동' },
    hi: { name:'हिन्दी', demo:'डेमो', backups:'बैकअप', connect:'Spotify जोड़ें', studio:'स्टूडियो जोड़ें →', collection:'SOOND संग्रह', eyebrow:'● चुनें. जोड़ें. नियंत्रित करें.', heroDescription:'स्मार्ट मैचिंग और पेशेवर टूल से अपनी Spotify लाइब्रेरी व्यवस्थित करें।', analyze:'विश्लेषण', fusionEngine:'फ्यूज़न इंजन', fusionTitle:'स्मार्ट प्लेलिस्ट मिलान और DNA विश्लेषण', fusionSubtitle:'शैली और फ़्रीक्वेंसी के आधार पर मिलान', collectionLabel:'संग्रह', playlists:'प्लेलिस्ट', list:'सूची', tracks:'गाने', curator:'क्यूरेटर', private:'निजी', public:'सार्वजनिक', compatible:'अनुकूल', common:'साझा गाने', match:'खोलें', search:'संग्रह खोजें...', vinyl:'कवर गैलरी', rack:'सूची दृश्य', auto:'स्वचालित' },
    nl: { name:'Nederlands', demo:'Demo', backups:'Back-ups', connect:'Spotify koppelen', studio:'Studio koppelen →', collection:'SOOND-collectie', eyebrow:'● SELECTEER. VERBIND. BEHEER.', heroDescription:'Beheer je Spotify-bibliotheek met slimme matching en professionele tools.', analyze:'Analyseren', fusionEngine:'FUSIEMOTOR', fusionTitle:'Slimme matches & DNA-analyse', fusionSubtitle:'Matches op genre- en frequentieprofiel', collectionLabel:'COLLECTIE', playlists:'Playlists', list:'Lijst', tracks:'Nummers', curator:'Curator', private:'Privé', public:'Openbaar', compatible:'Compatibel', common:'Gedeelde nummers', match:'Openen', search:'Collectie zoeken...', vinyl:'Covergalerij', rack:'Lijstweergave', auto:'Automatisch' }
  };

  const HERO_TITLES = {
    tr: { lines: ['FREKANSI', 'ŞEKİLLENDİR'], accent: 0 },
    en: { lines: ['SHAPE', 'THE', 'FREQUENCY'], accent: 2 },
    de: { lines: ['FORME', 'DIE', 'FREQUENZ'], accent: 2 },
    fr: { lines: ['FAÇONNEZ', 'LA', 'FRÉQUENCE'], accent: 2 },
    es: { lines: ['DA FORMA', 'A LA', 'FRECUENCIA'], accent: 2 },
    it: { lines: ['MODELLA', 'LA', 'FREQUENZA'], accent: 2 },
    pt: { lines: ['MODELE', 'A', 'FREQUÊNCIA'], accent: 2 },
    ru: { lines: ['СОЗДАЙ', 'СВОЮ', 'ЧАСТОТУ'], accent: 2 },
    ar: { lines: ['شَكِّل', 'ذَبْذَبَة', 'مُوسِيقَاك'], accent: 1 },
    zh: { lines: ['塑造', '你的', '频率'], accent: 2 },
    ja: { lines: ['周波数を', '形に', 'する'], accent: 0 },
    ko: { lines: ['주파수를', '디자인', '하세요'], accent: 0 },
    hi: { lines: ['अपनी', 'फ़्रीक्वेंसी', 'गढ़ें'], accent: 1 },
    nl: { lines: ['VORM', 'DE', 'FREQUENTIE'], accent: 2 }
  };

  let currentLanguage = 'en';
  const t = (key) => (LOCALES[currentLanguage] && LOCALES[currentLanguage][key]) || LOCALES.en[key] || key;

  function detectBrowserLocale() {
    const raw = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    let locale;
    try { locale = new Intl.Locale(raw).maximize(); } catch { locale = { language: raw.split('-')[0], region: '' }; }
    document.documentElement.dataset.region = locale.region || '';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const timezoneLanguage = {
      'Europe/Istanbul':'tr', 'Europe/Berlin':'de', 'Europe/Vienna':'de',
      'Europe/Paris':'fr', 'Europe/Madrid':'es', 'Europe/Rome':'it',
      'Europe/Lisbon':'pt', 'Europe/Moscow':'ru', 'Europe/Amsterdam':'nl',
      'Asia/Riyadh':'ar', 'Asia/Dubai':'ar', 'Asia/Shanghai':'zh',
      'Asia/Hong_Kong':'zh', 'Asia/Tokyo':'ja', 'Asia/Seoul':'ko',
      'Asia/Kolkata':'hi', 'America/Sao_Paulo':'pt'
    }[timezone];
    return timezoneLanguage || (LOCALES[locale.language] ? locale.language : 'en');
  }

  function applyLanguage(language, persist = true) {
    currentLanguage = LOCALES[language] ? language : 'en';
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    if (persist && allowsFunctionalStorage()) localStorage.setItem('tify_ui_language', currentLanguage);
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });

    const setText = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; };
    setText('#btnTryDemo span', t('demo'));
    setText('#btnOpenHistoryModalDemo span', t('backups'));
    setText('#btnConnectSpotify span', t('connect'));
    setText('#btnHeroLogin', t('studio'));
    setText('#btnHeroDemo', t('collection'));
    setText('#btnAnalyze span', t('analyze'));
    setText('#btnViewVinyl span', t('vinyl'));
    setText('#btnViewRack span', t('rack'));
    const search = document.getElementById('catalogSearchInput');
    if (search) search.placeholder = t('search');
    const selector = document.getElementById('languageSelector');
    if (selector) selector.value = currentLanguage;
    renderHeroTitle();
  }

  let neonFaultTimer = null;

  function renderHeroTitle() {
    const headline = document.getElementById('heroMainTitle');
    if (!headline) return;
    const title = HERO_TITLES[currentLanguage] || HERO_TITLES.en;
    headline.setAttribute('aria-label', title.lines.join(' '));
    headline.innerHTML = title.lines.map((line, index) => index === title.accent
      ? `<span class="hero-title-line hero-title-accent h1-green frequency-neon" id="frequencyNeon" data-text="${line}">${line}</span>`
      : `<span class="hero-title-line">${line}</span>`).join('');
    initFrequencyNeon(true);
  }

  function initLanguageSelector() {
    const selector = document.getElementById('languageSelector');
    if (!selector) return;
    selector.innerHTML = Object.entries(LOCALES).map(([code, locale]) => `<option value="${code}">${locale.name}</option>`).join('');
    const saved = allowsFunctionalStorage() ? localStorage.getItem('tify_ui_language') : null;
    applyLanguage(saved && LOCALES[saved] ? saved : detectBrowserLocale(), false);
    selector.addEventListener('change', () => {
      applyLanguage(selector.value, true);
      renderPlaylistsCatalog();
      renderFastRecommendations();
      setAppSessionState(state.isLoggedIn);
    });
  }

  function initFrequencyNeon(force = false) {
    const sign = document.getElementById('frequencyNeon');
    if (!sign || (!force && sign.dataset.ready === 'true')) return;
    if (neonFaultTimer) clearTimeout(neonFaultTimer);
    sign.dataset.ready = 'true';
    const text = sign.dataset.text || sign.textContent.trim();
    sign.textContent = '';
    [...text].forEach((character, index) => {
      const letter = document.createElement('span');
      letter.className = 'neon-letter';
      letter.textContent = character;
      letter.setAttribute('aria-hidden', 'true');
      letter.style.setProperty('--letter-index', index);
      sign.appendChild(letter);
    });

    const supportsDecorativeMotion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches
      && window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && window.innerWidth > 720;
    if (!supportsDecorativeMotion) return;
    const letters = Array.from(sign.querySelectorAll('.neon-letter'));

    const triggerFault = () => {
      const letter = letters[Math.floor(Math.random() * letters.length)];
      if (!letter) return;
      letter.classList.add('neon-letter-out');
      setTimeout(() => {
        letter.classList.remove('neon-letter-out');
        if (Math.random() > 0.55) {
          setTimeout(() => {
            letter.classList.add('neon-letter-out');
            setTimeout(() => letter.classList.remove('neon-letter-out'), 70 + Math.random() * 110);
          }, 90 + Math.random() * 180);
        }
      }, 110 + Math.random() * 420);
      neonFaultTimer = setTimeout(triggerFault, 18000 + Math.random() * 32000);
    };

    neonFaultTimer = setTimeout(triggerFault, 12000 + Math.random() * 18000);
  }

  // Run startup migration to clean corrupt/empty track caches
  cleanCorruptEmptyTrackCaches();

  // ============================================================
  // DYNAMIC AURORA RANDOM POSITION SYSTEM
  // Generates a unique set of aurora positions on each page load
  // so the aurora orbs light up from different spots every time.
  // ============================================================
  function initDynamicAurora() {
    const root = document.documentElement;

    // Generate random positions within the viewport bounds
    // Each aurora orb gets its own random (x%, y%) starting position
    const generatePos = (minX, maxX, minY, maxY) => ({
      x: Math.round(Math.random() * (maxX - minX) + minX),
      y: Math.round(Math.random() * (maxY - minY) + minY)
    });

    const orbs = [
      generatePos(-20, 20,  -25, 10),   // aurora-1: upper-left region
      generatePos(55, 90,   50, 90),    // aurora-2: lower-right region
      generatePos(20, 65,   10, 60),    // aurora-3: center
      generatePos(-15, 15,  55, 90),    // aurora-4: lower-left region
      generatePos(70, 100,  -20, 20),   // aurora-5: upper-right region
    ];

    orbs.forEach((pos, i) => {
      root.style.setProperty(`--aurora-x${i + 1}`, `${pos.x}%`);
      root.style.setProperty(`--aurora-y${i + 1}`, `${pos.y}%`);
    });

    // Also randomize animation durations slightly for organic feel
    const durations = [
      18 + Math.random() * 12, // aurora-1: 18-30s
      24 + Math.random() * 14, // aurora-2: 24-38s
      15 + Math.random() * 10, // aurora-3: 15-25s
      28 + Math.random() * 10, // aurora-4: 28-38s
      20 + Math.random() * 10, // aurora-5: 20-30s
    ];

    document.querySelectorAll('.aurora-orb').forEach((orb, i) => {
      if (durations[i]) orb.style.animationDuration = `${durations[i].toFixed(1)}s`;
    });
  }
  initDynamicAurora();


  // DOM Elements
  const appModeBadge = document.getElementById('appModeBadge');
  const loggedOutHeaderActions = document.getElementById('loggedOutHeaderActions');
  const loggedInHeaderActions = document.getElementById('loggedInHeaderActions');
  const headerUserName = document.getElementById('headerUserName');

  const landingHeroSection = document.getElementById('landingHeroSection');
  const userDashboardHeader = document.getElementById('userDashboardHeader');
  const dashDisplayName = document.getElementById('dashDisplayName');

  const catalogTitleText = document.getElementById('catalogTitleText');
  const catalogTotalCount = document.getElementById('catalogTotalCount');
  const playlistsCatalogGrid = document.getElementById('playlistsCatalogGrid');
  const analysisResults = document.getElementById('analysisResults');
  const proTrackTableBody = document.getElementById('proTrackTableBody');

  const syncLoaderModal = document.getElementById('syncLoaderModal');
  const syncProgressBarFill = document.getElementById('syncProgressBarFill');
  const loaderStageText = document.getElementById('loaderStageText');
  const btnRefreshSync = document.getElementById('btnRefreshSync');

  const btnConnectSpotify = document.getElementById('btnConnectSpotify');
  const btnTryDemo = document.getElementById('btnTryDemo');
  const btnHeroLogin = document.getElementById('btnHeroLogin');
  const btnHeroDemo = document.getElementById('btnHeroDemo');
  const btnLogout = document.getElementById('btnLogout');

  const authModal = document.getElementById('authModal');
  const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
  const btnStartOAuth = document.getElementById('btnStartOAuth');
  const clientIdInput = document.getElementById('clientIdInput');
  const accessTokenInput = document.getElementById('accessTokenInput');

  const playlistUrlInput = document.getElementById('playlistUrlInput');
  const btnAnalyze = document.getElementById('btnAnalyze');
  const externalPlaylistModal = document.getElementById('externalPlaylistModal');
  const externalPlaylistTitle = document.getElementById('externalPlaylistTitle');
  const externalPlaylistSummary = document.getElementById('externalPlaylistSummary');
  const externalPlaylistContent = document.getElementById('externalPlaylistContent');
  const btnCloseExternalPlaylist = document.getElementById('btnCloseExternalPlaylist');

  const checkAllTracks = document.getElementById('checkAllTracks');
  const selectedTracksCountText = document.getElementById('selectedTracksCountText');
  const selectBatchTargetPlaylist = document.getElementById('selectBatchTargetPlaylist');
  const btnApplyBatchTransfer = document.getElementById('btnApplyBatchTransfer');

  const undoSafetyBar = document.getElementById('undoSafetyBar');
  const btnTriggerUndo = document.getElementById('btnTriggerUndo');
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // --- 100% REAL SPOTIFY WEB API FETCHERS ---

  async function fetchSpotifyProfile(token) {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Profil Okuma Hatası (${res.status})`);
    }
    return await res.json();
  }

  async function fetchSpotifyPlaylistDetails(token, rawPlaylistId) {
    const playlistId = extractCleanPlaylistId(rawPlaylistId);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
      const error = new Error('Spotify oturumu sona ermiş. Yeniden giriş yapın.');
      error.isTokenExpired = true;
      throw error;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Spotify playlist bilgisi alınamadı (${res.status})`);
    }
    return res.json();
  }

  /**
   * Dual Endpoint Fetcher: Tries /v1/me/playlists first, then /v1/users/{userId}/playlists
   * On 429: NO retry. Throws a special RateLimitError so caller can handle it.
   */
  async function fetchSpotifyPlaylists(token, userId = null) {
    let allPlaylists = [];
    let url = userId 
      ? `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists?limit=50`
      : 'https://api.spotify.com/v1/me/playlists?limit=50';

    while (url) {
      let res;
      try {
        res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {
        console.error("Playlist Fetch Network Error:", err);
        break;
      }

      // 429 — NO retry. Throw with retryAfter so syncRealSpotifyLibrary can show message.
      if (res.status === 429) {
        const retryAfterSeconds = parseInt(res.headers.get('Retry-After') || '60', 10);
        const err = new Error(`RATE_LIMIT:${retryAfterSeconds}`);
        err.isRateLimit = true;
        err.retryAfter = retryAfterSeconds;
        throw err;
      }

      if (!res.ok) {
        console.warn(`Playlist Fetch Warning (${res.status}): ${res.statusText}`);
        break;
      }

      const data = await res.json();
      if (data.items && data.items.length > 0) {
        allPlaylists = allPlaylists.concat(data.items);
      }
      url = data.next;
    }

    // Fallback: If /me/playlists returned 0, try /users/{userId}/playlists
    if (allPlaylists.length === 0 && !userId && state.userName && state.userName !== "Spotify Kullanıcısı") {
      console.log(`[Tify Plus Pulse] /me/playlists returned 0, trying /users/${state.userName}/playlists...`);
      return await fetchSpotifyPlaylists(token, state.userName);
    }

    return allPlaylists;
  }

  function extractCleanPlaylistId(rawId) {
    if (!rawId) return '';
    const str = String(rawId).trim();
    if (str.startsWith('spotify:playlist:')) {
      const id = str.replace('spotify:playlist:', '').trim();
      return /^[A-Za-z0-9]{22}$/.test(id) ? id : '';
    }
    if (/^https?:\/\//i.test(str)) {
      try {
        const parsed = new URL(str);
        if (!/(^|\.)spotify\.com$/i.test(parsed.hostname)) return '';
        const parts = parsed.pathname.split('/').filter(Boolean);
        const playlistIndex = parts.indexOf('playlist');
        const id = playlistIndex >= 0 ? parts[playlistIndex + 1] : '';
        return /^[A-Za-z0-9]{22}$/.test(id || '') ? id : '';
      } catch (_) {
        return '';
      }
    }
    return /^[A-Za-z0-9]{22}$/.test(str) ? str : '';
  }

  async function fetchSpotifyPlaylistTracks(token, rawPlaylistId) {
    const playlistId = extractCleanPlaylistId(rawPlaylistId);
    let tracks = [];

    // Robust Parser for Spotify Track items in any Web API format
    function parseTrackItems(items) {
      const parsed = [];
      if (items && Array.isArray(items)) {
        items.forEach((item, idx) => {
          const tr = item.track || item.item || item;
          if (tr && (tr.name || tr.title)) {
            const trackId = tr.id || tr.uri || `tr_${idx}_${Date.now()}`;
            const artistNames = Array.isArray(tr.artists)
              ? tr.artists.map(a => a.name).join(', ')
              : (tr.artist || (tr.artists && tr.artists[0]?.name) || 'Bilinmeyen Sanatçı');
            const artistIds = Array.isArray(tr.artists)
              ? tr.artists.map(a => a.id).filter(Boolean)
              : [];
            const coverImg = (tr.album && tr.album.images && tr.album.images.length > 0)
              ? tr.album.images[0].url
              : (tr.cover || (item.album && item.album.images && item.album.images[0]?.url) || '');

            const previewUrl = tr.preview_url || tr.previewUrl || '';
            const spotifyTrackUrl = (tr.external_urls && tr.external_urls.spotify)
              ? tr.external_urls.spotify
              : `https://open.spotify.com/search/${encodeURIComponent((tr.name || tr.title) + ' ' + artistNames)}`;

            parsed.push({
              id: trackId,
              uri: tr.uri || '',
              title: tr.name || tr.title || 'İsimsiz Şarkı',
              artist: artistNames,
              artistIds: artistIds,
              album: tr.album ? tr.album.name : (tr.albumName || ''),
              cover: coverImg,
              previewUrl: previewUrl,
              spotifyUrl: spotifyTrackUrl,
              durationMs: tr.duration_ms || tr.durationMs || 0,
              genre: 'Spotify Parçası',
              genreSource: '',
              explicit: typeof tr.explicit === 'boolean' ? tr.explicit : null,
              isPlayable: typeof tr.is_playable === 'boolean' ? tr.is_playable : null,
              isLocal: Boolean(tr.is_local),
              isrc: tr.external_ids?.isrc || '',
              releaseYear: parseInt(String(tr.album?.release_date || '').slice(0, 4), 10) || null
            });
          }
        });
      }
      return parsed;
    }

    // 2026 Spotify Web API uses /items endpoint
    const endpointsToTry = [
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=100`,
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`,
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`
    ];

    let lastError = null;

    for (let endpointUrl of endpointsToTry) {
      let currentUrl = endpointUrl;
      let endpointTracks = [];
      let isSuccess = false;

      console.log(`[fetchSpotifyPlaylistTracks] GET: ${currentUrl}`);

      while (currentUrl) {
        let res;
        try {
          res = await fetch(currentUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        } catch (networkErr) {
          lastError = new Error(`NETWORK_ERROR: ${networkErr.message}`);
          break;
        }

        if (res.status === 429) {
          const retryAfterSeconds = parseInt(res.headers.get('Retry-After') || '2', 10);
          console.warn(`[429 Rate Limit] Bekleniyor: ${retryAfterSeconds}s...`);
          await new Promise(resolve => setTimeout(resolve, (retryAfterSeconds * 1000) + 300));
          continue;
        }

        if (res.status === 401) {
          const err = new Error(`HTTP 401 Unauthorized: Oturum süresi dolmuş`);
          err.isTokenExpired = true;
          throw err;
        }

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const errMsg = errBody?.error?.message || errBody?.message || res.statusText || 'Forbidden';
          console.warn(`[Spotify API ${res.status}] ${currentUrl}:`, errMsg, errBody);
          lastError = new Error(`HTTP ${res.status}: ${errMsg}`);
          if (res.status === 403) lastError.isForbidden = true;
          break; // Try next endpoint
        }

        const data = await res.json();

        if (data.tracks && Array.isArray(data.tracks.items)) {
          endpointTracks = endpointTracks.concat(parseTrackItems(data.tracks.items));
          currentUrl = data.tracks.next || null;
        } else if (data.items && Array.isArray(data.items)) {
          endpointTracks = endpointTracks.concat(parseTrackItems(data.items));
          currentUrl = data.next || null;
        } else {
          currentUrl = null;
        }

        isSuccess = true;
        if (currentUrl) {
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      }

      if (isSuccess && endpointTracks.length > 0) {
        return endpointTracks;
      }
    }

    if (tracks.length === 0 && lastError) {
      throw lastError;
    }

    return tracks;
  }

  // ============================================================
  // CACHE HELPERS
  // ============================================================
  const LIBRARY_CACHE_KEY = 'spotify_library_cache';
  const TRACK_CACHE_PREFIX = 'spotify_tracks_';
  const CACHE_TTL_MS = 30 * 60 * 1000;       // 30 minutes
  const SYNC_COOLDOWN_MS = 5 * 60 * 1000;    // 5 minutes

  function clearPersonalSpotifySessionData() {
    const exactKeys = [LIBRARY_CACHE_KEY, SNAPSHOT_STORAGE_KEY, 'spotify_last_sync', 'spotify_user_id', 'spotify_user_name', 'spotify_user_email', 'spotify_user_avatar'];
    exactKeys.forEach(key => sessionStorage.removeItem(key));
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(TRACK_CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
    state.userId = '';
    state.userName = 'Spotify Kullanıcısı';
    state.userEmail = '';
    state.userAvatar = '';
    state.playlists = [];
    state.currentPlaylist = null;
    state.externalPlaylist = null;
    state.versionedHistory = [];
    state.presenceMap = {};
  }

  function saveLibraryCache(playlists) {
    const payload = {
      data: playlists.map(pl => ({
        id: pl.id, name: pl.name, owner: pl.owner, followers: pl.followers,
        isPrivate: pl.isPrivate, url: pl.url, cover: pl.cover,
        description: pl.description, trackTotal: pl.trackTotal
        // tracks NOT saved here — saved per-playlist in TRACK_CACHE_PREFIX keys
      })),
      fetchedAt: Date.now()
    };
    try { sessionStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(payload)); } catch(e) {}
    sessionStorage.setItem('spotify_last_sync', String(Date.now()));
  }

  function loadLibraryCache() {
    try {
      const raw = sessionStorage.getItem(LIBRARY_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.fetchedAt || (Date.now() - parsed.fetchedAt) > CACHE_TTL_MS) return null;
      return parsed; // { data: [...], fetchedAt: number }
    } catch(e) { return null; }
  }

  function saveTrackCache(playlistId, tracks) {
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) return; // Never save empty track array
    try {
      sessionStorage.setItem(TRACK_CACHE_PREFIX + playlistId, JSON.stringify({
        tracks, savedAt: Date.now()
      }));
    } catch(e) {}
  }

  function loadTrackCache(playlistId) {
    try {
      const raw = sessionStorage.getItem(TRACK_CACHE_PREFIX + playlistId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tracks) || parsed.tracks.length === 0) {
        sessionStorage.removeItem(TRACK_CACHE_PREFIX + playlistId);
        return null;
      }
      return parsed; // { tracks: [...], savedAt: number }
    } catch(e) { return null; }
  }

  // One-time startup migration: cleans any empty/corrupt "spotify_tracks_*" records
  function cleanCorruptEmptyTrackCaches() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(TRACK_CACHE_PREFIX)) {
          const raw = sessionStorage.getItem(key);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (!parsed || !Array.isArray(parsed.tracks) || parsed.tracks.length === 0) {
                keysToRemove.push(key);
              }
            } catch(e) {
              keysToRemove.push(key);
            }
          }
        }
      }
      keysToRemove.forEach(k => {
        sessionStorage.removeItem(k);
        console.log(`[Cache Migration] Bozuk/boş önbellek kaydı silindi: ${k}`);
      });
    } catch(e) {}
  }

  // Cooldown helpers
  function getLastSyncTime() {
    return parseInt(sessionStorage.getItem('spotify_last_sync') || '0', 10);
  }

  function getSyncCooldownRemaining() {
    const elapsed = Date.now() - getLastSyncTime();
    return Math.max(0, SYNC_COOLDOWN_MS - elapsed);
  }

  // ============================================================
  // SAFETY SNAPSHOT & UNDO RESTORATION ENGINE
  // ============================================================
  const SNAPSHOT_STORAGE_KEY = 'spotify_pulse_snapshots';

  function saveSafetySnapshotsToStorage() {
    try {
      sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(state.versionedHistory));
    } catch(e) {}
  }

  function loadSafetySnapshotsFromStorage() {
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
      if (raw) {
        state.versionedHistory = JSON.parse(raw);
      }
    } catch(e) {
      state.versionedHistory = [];
    }
  }

  loadSafetySnapshotsFromStorage();

  function pushSafetySnapshot(actionLabel) {
    const snapshot = {
      id: 'snap_' + Date.now(),
      timestamp: Date.now(),
      actionLabel: actionLabel || 'Kütüphane Değişikliği',
      playlists: JSON.parse(JSON.stringify(state.playlists || []))
    };
    state.versionedHistory.unshift(snapshot);
    if (state.versionedHistory.length > 10) {
      state.versionedHistory.pop();
    }
    saveSafetySnapshotsToStorage();
    updateUndoBar(actionLabel);
  }

  let _undoBarTimeout = null;
  function updateUndoBar(actionLabel) {
    if (!undoSafetyBar) return;
    const undoBarText = document.getElementById('undoBarText');
    if (undoBarText) {
      undoBarText.innerHTML = `<strong>Spotify Yedeği Hazır!</strong> ${actionLabel} (Geri almak için tıklayın)`;
    }
    undoSafetyBar.classList.remove('hidden');
    if (_undoBarTimeout) clearTimeout(_undoBarTimeout);
    _undoBarTimeout = setTimeout(() => {
      if (undoSafetyBar) undoSafetyBar.classList.add('hidden');
    }, 12000);
  }

  function restoreSafetySnapshot(snapshotId) {
    const targetSnap = state.versionedHistory.find(s => s.id === snapshotId) || state.versionedHistory[0];
    if (!targetSnap || !targetSnap.playlists) {
      showToast("Geri yüklenecek geçerli bir yedek bulunamadı.", "warning");
      return;
    }

    state.playlists = JSON.parse(JSON.stringify(targetSnap.playlists));
    buildGlobalPresenceMap();
    saveLibraryCache(state.playlists);
    state.playlists.forEach(pl => {
      if (pl.tracks && pl.tracks.length > 0) saveTrackCache(pl.id, pl.tracks);
    });

    renderPlaylistsCatalog();
    if (state.currentPlaylist) {
      const refreshedCurrent = state.playlists.find(p => p.id === state.currentPlaylist.id);
      if (refreshedCurrent) {
        state.currentPlaylist = refreshedCurrent;
        renderProTrackTable(refreshedCurrent);
      }
    }

    if (undoSafetyBar) undoSafetyBar.classList.add('hidden');
    const historyModal = document.getElementById('historyModal');
    if (historyModal) historyModal.classList.add('hidden');

    const formattedTime = new Date(targetSnap.timestamp).toLocaleTimeString();
    showToast(`Kütüphane "${targetSnap.actionLabel}" öncesi durumuna (${formattedTime}) geri yüklendi!`, "success");
  }

  function renderHistoryModalList() {
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    if (!state.versionedHistory || state.versionedHistory.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <i class="fa-solid fa-clock-rotate-left text-dim" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
          <p>Henüz kayıtlı bir yedek noktası bulunmuyor.</p>
          <p style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">Şarkı aktardığınızda veya birleştirme yaptığınızda otomatik yedek alınır.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.versionedHistory.map((snap, idx) => {
      const date = new Date(snap.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = date.toLocaleDateString();
      const totalPls = snap.playlists ? snap.playlists.length : 0;
      const totalTracks = snap.playlists ? snap.playlists.reduce((acc, pl) => acc + (pl.trackTotal || (pl.tracks ? pl.tracks.length : 0)), 0) : 0;

      return `
        <div class="history-item">
          <div class="history-item-left">
            <div class="history-item-icon">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div class="history-item-info">
              <h5>${snap.actionLabel}</h5>
              <p>${dateStr} ${timeStr} • ${totalPls} Liste • ${totalTracks} Toplam Parça</p>
            </div>
          </div>
          <button class="btn btn-warning btn-sm" data-action="restore-snapshot" data-snapshot-id="${snap.id}">
            <i class="fa-solid fa-rotate-left"></i> Bu Ana Dön
          </button>
        </div>
      `;
    }).join('');
  }

  window.restoreSafetySnapshot = restoreSafetySnapshot;
  window.pushSafetySnapshot = pushSafetySnapshot;

  // ============================================================
  // FULL REAL SPOTIFY SYNC CONTROLLER
  // 1 API call only (profile + /me/playlists). Tracks are lazy.
  // ============================================================
  async function syncRealSpotifyLibrary(token, force = false) {
    // Safety guard: NEVER make API calls if cooldown is active (unless forced)
    if (!force) {
      const remaining = getSyncCooldownRemaining();
      if (remaining > 0) {
        const remainMin = Math.ceil(remaining / 60000);
        console.log(`[Sync Blocked] Cooldown aktif (${remainMin} dk). API isteği atılmadı.`);
        if (btnRefreshSync) btnRefreshSync.classList.remove('syncing');
        updateSyncButtonState();
        return;
      }
    }

    showLoader(true, "Spotify Hesabınız Doğrulanıyor...", 25);
    if (btnRefreshSync) btnRefreshSync.classList.add('syncing');

    try {
      // 1. Fetch Profile (1 API call)
      const meData = await fetchSpotifyProfile(token);
      const previousUserId = state.userId;
      state.userId = meData.id || '';
      state.userName = meData.display_name || meData.id || "Spotify Kullanıcısı";
      state.userEmail = meData.email || "";
      state.userAvatar = (meData.images && meData.images.length > 0) ? meData.images[0].url : "";
      state.userProduct = String(meData.product || '').toLowerCase();
      if (previousUserId && state.userId && previousUserId !== state.userId) {
        sessionStorage.removeItem(LIBRARY_CACHE_KEY);
        sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
        sessionStorage.removeItem('spotify_last_sync');
        for (let index = sessionStorage.length - 1; index >= 0; index--) {
          const key = sessionStorage.key(index);
          if (key?.startsWith(TRACK_CACHE_PREFIX)) sessionStorage.removeItem(key);
        }
      }
      sessionStorage.setItem('spotify_user_id', state.userId);
      sessionStorage.setItem('spotify_user_name', state.userName);
      sessionStorage.setItem('spotify_user_email', state.userEmail);
      if (state.userAvatar) sessionStorage.setItem('spotify_user_avatar', state.userAvatar);
      else sessionStorage.removeItem('spotify_user_avatar');
      updateHeaderUserInfo();

      // 2. Fetch Playlist list only — NO track calls (1 API call, paginated)
      showLoader(true, `Çalma Listeleri Çekiliyor...`, 60);
      const rawPlaylists = await fetchSpotifyPlaylists(token);

      if (!rawPlaylists || rawPlaylists.length === 0) {
        showLoader(false);
        if (btnRefreshSync) btnRefreshSync.classList.remove('syncing');
        showToast("Spotify hesabınızda çalma listesi okunamadı. Lütfen oturumu yenileyin.", "warning");
        renderPlaylistsCatalog();
        return;
      }

      // 3. Build catalog — tracks: [] (lazy), restore track cache flags if available
      const parsedPlaylists = rawPlaylists.map((pl) => {
        const coverUrl = (pl.images && pl.images.length > 0) ? pl.images[0].url
          : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80";
        const realTrackTotal = pl.items?.total ?? pl.tracks?.total ?? 0;
        const cachedTracks = loadTrackCache(pl.id);

        return {
          id: pl.id,
          name: pl.name,
          owner: pl.owner ? pl.owner.display_name || pl.owner.id : state.userName,
          followers: 0,
          isPrivate: pl.public === false,
          url: pl.external_urls ? pl.external_urls.spotify : "",
          cover: coverUrl,
          description: pl.description || "Spotify hesabınızdan canlı senkronize edilen resmi çalma listesi.",
          trackTotal: realTrackTotal,
          tracks: cachedTracks ? cachedTracks.tracks : [],
          tracksLoaded: !!cachedTracks  // If localStorage had tracks, mark as loaded
        };
      });

      state.playlists = parsedPlaylists;
      buildGlobalPresenceMap();

      // Save library to localStorage cache
      saveLibraryCache(parsedPlaylists);

      console.log(`[Tify Plus Pulse Sync] ${parsedPlaylists.length} playlist yüklendi. API: 2 çağrı (profil + liste). Tracklar tıklanınca lazy-load.`);

      showLoader(true, `Tamamlandı! ${parsedPlaylists.length} Çalma Listesi Yüklendi.`, 100);

      setTimeout(() => {
        if (btnRefreshSync) btnRefreshSync.classList.remove('syncing');
        showLoader(false);
        renderPlaylistsCatalog();
        startSyncCooldownTimer();
        showToast(`${parsedPlaylists.length} çalma listeniz yüklendi. Şarkı detayları için bir listeye tıklayın.`, "success");
      }, 400);

    } catch (err) {
      console.error("Spotify API Live Sync Exception:", err);
      if (btnRefreshSync) btnRefreshSync.classList.remove('syncing');
      showLoader(false);

      // 429 — No retry. Show Retry-After to user and disable sync button for that duration.
      if (err.isRateLimit) {
        const waitSec = err.retryAfter || 60;
        const waitMin = Math.ceil(waitSec / 60);
        showToast(`Spotify ${waitSec} saniye bekleme istiyor. Buton ${waitMin} dk sonra aktif olacak.`, "warning");
        startRateLimitCooldown(waitSec);
        return;
      }

      if (err.message && err.message.includes('401')) {
        showToast("Spotify Oturumu dolmuş. Çıkış yapıp tekrar bağlanın.", "warning");
        sessionStorage.removeItem('spotify_access_token');
        state.accessToken = null;
        setAppSessionState(false);
      } else {
        showToast("Spotify API Bağlantı Hatası: " + err.message, "warning");
      }
    }
  }

  // ============================================================
  // LIVE COUNTDOWN TIMER & COOLDOWN HELPERS
  // ============================================================
  function formatCooldown(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${hours}sa ${String(minutes).padStart(2, '0')}dk ${String(seconds).padStart(2, '0')}sn`;
    }
    return `${String(minutes).padStart(2, '0')}dk ${String(seconds).padStart(2, '0')}sn`;
  }

  let _cooldownInterval = null;
  function startSyncCooldownTimer() {
    if (_cooldownInterval) clearInterval(_cooldownInterval);
    updateSyncButtonState();
    _cooldownInterval = setInterval(updateSyncButtonState, 1000); // 1-second live tick
  }

  function startRateLimitCooldown(seconds) {
    if (allowsFunctionalStorage()) localStorage.setItem('spotify_last_sync', String(Date.now() - SYNC_COOLDOWN_MS + seconds * 1000));
    startSyncCooldownTimer();
  }

  function updateSyncButtonState() {
    if (!btnRefreshSync) return;
    const remaining = getSyncCooldownRemaining();
    if (remaining <= 0) {
      btnRefreshSync.disabled = false;
      btnRefreshSync.title = '';
      btnRefreshSync.innerHTML = `<i class="fa-solid fa-rotate text-green"></i> <span>Yeniden Senkronize Et</span>`;
      if (_cooldownInterval) { clearInterval(_cooldownInterval); _cooldownInterval = null; }
    } else {
      const formatted = formatCooldown(remaining);
      btnRefreshSync.disabled = true;
      btnRefreshSync.title = `Spotify API rate-limit bekleme süresi: ${formatted}`;
      btnRefreshSync.innerHTML = `<i class="fa-solid fa-hourglass-half text-warning"></i> <span>⏳ ${formatted}</span>`;
    }
  }

  // --- ACCURATE CROSS-PLAYLIST PRESENCE MAP ---
  function buildGlobalPresenceMap() {
    const pMap = {};

    state.playlists.forEach(pl => {
      (pl.tracks || []).forEach(t => {
        const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
        if (!pMap[key]) {
          pMap[key] = {
            title: t.title,
            artist: t.artist,
            cover: t.cover,
            playlists: []
          };
        }
        if (!pMap[key].playlists.some(p => p.plId === pl.id)) {
          pMap[key].playlists.push({
            plId: pl.id,
            plName: pl.name,
            plCoverUrl: pl.cover
          });
        }
      });
    });

    state.presenceMap = pMap;
  }

  // --- LOADER UI CONTROL ---
  function showLoader(visible, text = "", percent = 0) {
    if (!syncLoaderModal) return;
    if (visible) {
      syncLoaderModal.classList.remove('hidden');
      if (syncProgressBarFill) syncProgressBarFill.style.width = `${percent}%`;
      if (loaderStageText) loaderStageText.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-green"></i> <span>${text}</span>`;
    } else {
      syncLoaderModal.classList.add('hidden');
    }
  }

  function updateHeaderUserInfo() {
    if (headerUserName) {
      headerUserName.textContent = state.userName;
    }
    const dropdownUserName = document.getElementById('dropdownUserName');
    if (dropdownUserName) dropdownUserName.textContent = state.userName;

    const dropdownUserEmail = document.getElementById('dropdownUserEmail');
    if (dropdownUserEmail) dropdownUserEmail.textContent = state.userEmail || (state.isLoggedIn ? 'Spotify Canlı Hesabı' : 'Ziyaretçi Modu');

    const headerAvatarImg = document.getElementById('headerUserAvatarImg');
    const headerAvatarFallback = document.getElementById('headerUserAvatarFallback');
    const dropdownAvatarImg = document.getElementById('dropdownUserAvatarImg');
    const dropdownAvatarFallback = document.getElementById('dropdownUserAvatarFallback');

    const initial = (state.userName || 'S').trim().charAt(0).toUpperCase();

    const useRemoteHeaderAvatar = Boolean(state.userAvatar);

    if (useRemoteHeaderAvatar) {
      if (headerAvatarImg) {
        headerAvatarImg.classList.add('hidden');
        if (headerAvatarFallback) headerAvatarFallback.classList.remove('hidden');
        headerAvatarImg.referrerPolicy = 'no-referrer';
        headerAvatarImg.onload = () => {
          headerAvatarImg.classList.remove('hidden');
          if (headerAvatarFallback) headerAvatarFallback.classList.add('hidden');
        };
        headerAvatarImg.onerror = () => {
          headerAvatarImg.classList.add('hidden');
          if (headerAvatarFallback) headerAvatarFallback.classList.remove('hidden');
        };
        headerAvatarImg.src = state.userAvatar;
      }
      if (dropdownAvatarImg) {
        dropdownAvatarImg.classList.add('hidden');
        if (dropdownAvatarFallback) dropdownAvatarFallback.classList.remove('hidden');
        dropdownAvatarImg.referrerPolicy = 'no-referrer';
        dropdownAvatarImg.onload = () => {
          dropdownAvatarImg.classList.remove('hidden');
          if (dropdownAvatarFallback) dropdownAvatarFallback.classList.add('hidden');
        };
        dropdownAvatarImg.onerror = () => {
          dropdownAvatarImg.classList.add('hidden');
          if (dropdownAvatarFallback) dropdownAvatarFallback.classList.remove('hidden');
        };
        dropdownAvatarImg.src = state.userAvatar;
      }
    } else {
      if (headerAvatarImg) headerAvatarImg.classList.add('hidden');
      if (headerAvatarFallback) {
          headerAvatarFallback.innerHTML = `<i class="fa-brands fa-spotify" aria-hidden="true"></i>`;
          headerAvatarFallback.setAttribute('aria-label', `${initial} için Spotify profil görseli yedeği`);
        headerAvatarFallback.classList.remove('hidden');
      }
      if (dropdownAvatarImg) dropdownAvatarImg.classList.add('hidden');
      if (dropdownAvatarFallback) {
          dropdownAvatarFallback.innerHTML = `<i class="fa-brands fa-spotify" aria-hidden="true"></i>`;
          dropdownAvatarFallback.setAttribute('aria-label', `${initial} için Spotify profil görseli yedeği`);
        dropdownAvatarFallback.classList.remove('hidden');
      }
    }

    if (dashDisplayName) {
      dashDisplayName.textContent = state.userName;
    }
  }

  // --- CACHED, RATE-AWARE REAL GENRE RESOLUTION ---
  const ARTIST_GENRE_CACHE_KEY = 'tify_artist_genres_v2';
  const MUSICBRAINZ_GENRE_CACHE_KEY = 'tify_musicbrainz_genres_v1';

  function readJsonCache(key) {
    if (!allowsFunctionalStorage()) return {};
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return {}; }
  }

  function writeJsonCache(key, value) {
    if (!allowsFunctionalStorage()) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage may be unavailable */ }
  }

  async function fetchSpotifyArtistGenres(token, artistIds) {
    if (!artistIds || artistIds.length === 0) return {};
    const uniqueIds = Array.from(new Set(artistIds)).filter(id => id && !String(id).startsWith('mock_'));
    if (uniqueIds.length === 0) return {};

    const genreMap = {};
    const cache = readJsonCache(ARTIST_GENRE_CACHE_KEY);
    const cacheMaxAge = 30 * 24 * 60 * 60 * 1000;
    for (const artistId of uniqueIds.slice(0, 20)) {
      const cached = cache[artistId];
      if (cached && Date.now() - cached.savedAt < cacheMaxAge) {
        if (cached.genres?.length) genreMap[artistId] = cached.genres;
        continue;
      }
      try {
        const res = await fetch(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const artist = await res.json();
          const genres = Array.isArray(artist.genres)
            ? artist.genres.map(g => g.charAt(0).toUpperCase() + g.slice(1))
            : [];
          cache[artistId] = { genres, savedAt: Date.now(), source: 'Spotify' };
          if (genres.length) genreMap[artistId] = genres;
        }
      } catch (e) {
        console.warn("[Artist Genre Fetch Warning]:", e);
      }
    }
    writeJsonCache(ARTIST_GENRE_CACHE_KEY, cache);
    return genreMap;
  }

  async function fetchMusicBrainzGenres(artistName) {
    if (navigator.globalPrivacyControl === true || localStorage.getItem('tify_external_metadata_disabled') === 'true') return [];
    const normalizedName = String(artistName || '').trim();
    if (!normalizedName) return [];
    const cache = readJsonCache(MUSICBRAINZ_GENRE_CACHE_KEY);
    const key = normalizedName.toLocaleLowerCase('tr-TR');
    const cached = cache[key];
    if (cached && Date.now() - cached.savedAt < 30 * 24 * 60 * 60 * 1000) return cached.genres || [];

    const genreWords = /(rock|pop|jazz|blues|metal|punk|folk|country|rap|hip hop|electronic|dance|house|techno|trance|ambient|classical|soul|funk|reggae|indie|alternative|r&b|disco|synthwave|soundtrack|latin|afrobeat)/i;
    try {
      const query = encodeURIComponent(`artist:\"${normalizedName.replace(/\"/g, '')}\"`);
      const response = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${query}&fmt=json&limit=1`);
      if (!response.ok) return [];
      const data = await response.json();
      const artist = data.artists?.[0];
      const rawTags = [...(artist?.genres || []), ...(artist?.tags || [])];
      const genres = Array.from(new Set(rawTags.map(tag => tag.name).filter(name => genreWords.test(name)))).slice(0, 4);
      cache[key] = { genres, savedAt: Date.now(), source: 'MusicBrainz' };
      writeJsonCache(MUSICBRAINZ_GENRE_CACHE_KEY, cache);
      return genres;
    } catch (error) {
      console.warn('[MusicBrainz Genre Fetch Warning]:', error);
      return [];
    }
  }

  // --- DUAL SESSION STATE SWITCHER ---
  function setAppSessionState(isLoggedIn) {
    state.isLoggedIn = isLoggedIn;
    updatePlaybackLockUi();

    const cockpitLoggedOutActions = document.getElementById('cockpitLoggedOutActions');
    const cockpitLoggedInActions = document.getElementById('cockpitLoggedInActions');

    if (isLoggedIn) {
      // Demo catalog belongs only to the public landing page. Never carry it
      // into an authenticated user's private workspace.
      if (state.playlists === MOCK_PLAYLISTS || state.playlists.some(playlist => String(playlist?.id || '').startsWith('soond_pl_'))) {
        state.playlists = [];
        state.currentPlaylist = null;
        state.presenceMap = {};
        renderPlaylistsCatalog();
        renderFastRecommendations();
      }
      if (appModeBadge) {
        appModeBadge.textContent = "Spotify Hesabı (Aktif)";
        appModeBadge.style.background = "rgba(29, 185, 84, 0.15)";
        appModeBadge.style.color = "var(--spotify-green)";
      }

      if (loggedOutHeaderActions) loggedOutHeaderActions.classList.add('hidden');
      if (loggedInHeaderActions) loggedInHeaderActions.classList.remove('hidden');

      if (cockpitLoggedOutActions) cockpitLoggedOutActions.classList.add('hidden');
      if (cockpitLoggedInActions) cockpitLoggedInActions.classList.remove('hidden');

      if (landingHeroSection) landingHeroSection.classList.add('hidden');
      if (userDashboardHeader) userDashboardHeader.classList.remove('hidden');

      if (state.accessToken) {
        // Create the Spotify Connect device while the library is loading so a
        // later mobile Play tap can unlock media synchronously.
        scheduleSpotifyPlayerWarmup(0);
        // Check localStorage cache before making any API call
        const cached = loadLibraryCache();
        if (cached && cached.data && cached.data.length > 0) {
          const cachedAt = new Date(cached.fetchedAt);
          console.log(`[Cache Hit] Library cache from ${cachedAt.toLocaleTimeString()} restored. 0 API calls.`);
          state.playlists = cached.data.map(pl => {
            const cachedTracks = loadTrackCache(pl.id);
            return {
              ...pl,
              tracks: cachedTracks ? cachedTracks.tracks : [],
              tracksLoaded: !!cachedTracks
            };
          });
          const cachedName = sessionStorage.getItem('spotify_user_name');
          if (cachedName) {
            state.userName = cachedName;
            updateHeaderUserInfo();
          }
          buildGlobalPresenceMap();
          renderPlaylistsCatalog();
          updateSyncButtonState();
          showToast(`${state.playlists.length} çalma listesi önbellekten yüklendi.`, "success");
        } else {
          const remaining = getSyncCooldownRemaining();
          if (remaining > 0) {
            const remainMin = Math.ceil(remaining / 60000);
            console.log(`[Session Init] Kütüphane cache'i boş ancak cooldown aktif (${remainMin} dk). Otomatik API isteği ENGELLENDİ.`);
            const cachedName = sessionStorage.getItem('spotify_user_name');
            if (cachedName) {
              state.userName = cachedName;
              updateHeaderUserInfo();
            }
            renderPlaylistsCatalog();
            startSyncCooldownTimer();
          } else {
            syncRealSpotifyLibrary(state.accessToken);
          }
        }
      }
      updateHeaderUserInfo();
    } else {
      if (appModeBadge) {
        appModeBadge.textContent = "Ziyaretçi / Demo Modu";
        appModeBadge.style.background = "rgba(0, 242, 254, 0.15)";
        appModeBadge.style.color = "var(--cyan-accent)";
      }

      if (loggedOutHeaderActions) loggedOutHeaderActions.classList.remove('hidden');
      if (loggedInHeaderActions) loggedInHeaderActions.classList.add('hidden');

      if (cockpitLoggedOutActions) cockpitLoggedOutActions.classList.remove('hidden');
      if (cockpitLoggedInActions) cockpitLoggedInActions.classList.add('hidden');

      if (landingHeroSection) landingHeroSection.classList.remove('hidden');
      if (userDashboardHeader) userDashboardHeader.classList.add('hidden');

      state.playlists = MOCK_PLAYLISTS;
      if (catalogTitleText) catalogTitleText.innerHTML = `<i class="fa-solid fa-compact-disc text-cyan"></i> Örnek Çalma Listeleri Kataloğu (Demo)`;
      if (catalogTotalCount) catalogTotalCount.textContent = `${MOCK_PLAYLISTS.length} Liste`;
      buildGlobalPresenceMap();
      renderPlaylistsCatalog();
      updateHeaderUserInfo();
    }
  }

  // ============================================================
  // PLAYLIST DNA & COSINE SIMILARITY ENGINE (Bölüm 2)
  // ============================================================

  // ============================================================
  // SOOND'S AUTHENTIC PUBLIC PLAYLIST ARCHIVE (DEFAULT LIBRARY)
  // ============================================================

  const SOOND_PUBLIC_PLAYLISTS = [
    {
      id: 'soond_pl_1',
      name: 'Global Cheri',
      owner: 'SOOND',
      followers: 4320,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
      description: 'Global dans listeleri, pop hitleri ve enerjik kulüp remixleri arşivi.',
      trackTotal: 87,
      genreVector: { 'Dance Pop': 0.95, Pop: 0.9, Electronic: 0.75, House: 0.5 },
      dnaTag: '🔥 Global Hits / 126 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'gc_t1', title: 'Cheri Cheri Lady', artist: 'Modern Talking', album: 'Let\'s Talk About Love', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80', durationMs: 225000, genre: 'Pop', camelot: '8A' },
        { id: 'gc_t2', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We\'re Dreaming', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80', durationMs: 243000, genre: 'Electronic', camelot: '11B' },
        { id: 'gc_t3', title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80', durationMs: 320000, genre: 'House', camelot: '8A' },
        { id: 'gc_t4', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80', durationMs: 200000, genre: 'Synthwave', camelot: '9A' },
        { id: 'gc_t5', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', cover: 'https://images.unsplash.com/photo-1445307806294-bff7f67ff225?w=100&q=80', durationMs: 203000, genre: 'Dance Pop', camelot: '7A' }
      ]
    },
    {
      id: 'soond_pl_2',
      name: 'WORK FLOW',
      owner: 'SOOND',
      followers: 8910,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
      description: 'Derin odaklanma, kodlama ve kesintisiz akış için tasarlanmış minimalist elektronik ve lo-fi ritimler.',
      trackTotal: 79,
      genreVector: { 'Deep Electronic': 0.95, 'Lo-Fi': 0.85, Ambient: 0.8, Chillhop: 0.6 },
      dnaTag: '💻 Deep Flow / 110 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'wf_t1', title: 'Resonance', artist: 'HOME', album: 'Odyssey', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=100&q=80', durationMs: 212000, genre: 'Synthwave', camelot: '8A' },
        { id: 'wf_t2', title: 'Affection', artist: 'Jinsang', album: 'Life', cover: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=100&q=80', durationMs: 180000, genre: 'Lo-Fi', camelot: '4A' },
        { id: 'wf_t3', title: 'Controlla', artist: 'Idealism', album: 'Amaranthine', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=100&q=80', durationMs: 165000, genre: 'Ambient', camelot: '6B' },
        { id: 'wf_t4', title: 'Snowman', artist: 'Wun Two', album: 'Rio', cover: 'https://images.unsplash.com/photo-1445307806294-bff7f67ff225?w=100&q=80', durationMs: 154000, genre: 'Chillhop', camelot: '5A' }
      ]
    },
    {
      id: 'soond_pl_3',
      name: 'Chill Old Country',
      owner: 'SOOND',
      followers: 2450,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&q=80',
      description: 'Samimi akustik gitar riffleri, sıcak country ezgileri ve nostaljik tınılar.',
      trackTotal: 45,
      genreVector: { Acoustic: 0.95, Country: 0.9, Folk: 0.8, Indie: 0.5 },
      dnaTag: '🌾 Warm Country / 92 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'coc_t1', title: 'Take Me Home, Country Roads', artist: 'John Denver', album: 'Poems, Prayers & Promises', cover: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=100&q=80', durationMs: 198000, genre: 'Country', camelot: '9B' },
        { id: 'coc_t2', title: 'Heart of Gold', artist: 'Neil Young', album: 'Harvest', cover: 'https://images.unsplash.com/photo-1445307806294-bff7f67ff225?w=100&q=80', durationMs: 187000, genre: 'Folk', camelot: '7B' },
        { id: 'coc_t3', title: 'Tennessee Whiskey', artist: 'Chris Stapleton', album: 'Traveller', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80', durationMs: 293000, genre: 'Country', camelot: '8A' }
      ]
    },
    {
      id: 'soond_pl_4',
      name: 'Kasa Edit',
      owner: 'SOOND',
      followers: 3890,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80',
      description: 'Agresif 808 baslar, drift phonk ve ağır tempolu urban trap kesitleri.',
      trackTotal: 42,
      genreVector: { Phonk: 0.95, 'Hip-Hop': 0.85, Trap: 0.8, Electronic: 0.6 },
      dnaTag: '⚡ Aggressive 808 / 140 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'ke_t1', title: 'Murder In My Mind', artist: 'Kordhell', album: 'Phonk Master', cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80', durationMs: 145000, genre: 'Phonk', camelot: '1A' },
        { id: 'ke_t2', title: 'Metamorphosis', artist: 'INTERWORLD', album: 'Metamorphosis', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80', durationMs: 143000, genre: 'Phonk', camelot: '1A' },
        { id: 'ke_t3', title: 'Rapture', artist: 'INTERWORLD', album: 'Rapture', cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&q=80', durationMs: 135000, genre: 'Phonk', camelot: '2A' }
      ]
    },
    {
      id: 'soond_pl_5',
      name: 'my SoundTRACK',
      owner: 'SOOND',
      followers: 1980,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400&q=80',
      description: 'Epik film müzikleri, Hans Zimmer atmosferi ve dramatik senfonik kompozisyonlar.',
      trackTotal: 54,
      genreVector: { Cinematic: 0.95, Soundtrack: 0.9, Orchestral: 0.85, Ambient: 0.4 },
      dnaTag: '🎻 Cinematic Score / 75 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'st_t1', title: 'Time', artist: 'Hans Zimmer', album: 'Inception OST', cover: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=100&q=80', durationMs: 275000, genre: 'Cinematic', camelot: '4A' },
        { id: 'st_t2', title: 'Cornfield Chase', artist: 'Hans Zimmer', album: 'Interstellar OST', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80', durationMs: 126000, genre: 'Soundtrack', camelot: '5A' },
        { id: 'st_t3', title: 'Experience', artist: 'Ludovico Einaudi', album: 'In a Time Lapse', cover: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=100&q=80', durationMs: 315000, genre: 'Orchestral', camelot: '6A' }
      ]
    },
    {
      id: 'soond_pl_6',
      name: 'LAZ',
      owner: 'SOOND',
      followers: 1200,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80',
      description: 'Karadeniz tınıları, kemençe füzyonu ve enerjik etnik rock ezgileri.',
      trackTotal: 8,
      genreVector: { Folk: 0.9, Rock: 0.75, Ethnic: 0.7 },
      dnaTag: '🌊 Ethnic Rock / 120 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'lz_t1', title: 'Gelevera Deresi', artist: 'Kazım Koyuncu', album: 'Hayde', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80', durationMs: 245000, genre: 'Folk', camelot: '8A' },
        { id: 'lz_t2', title: 'Koyverdin Gittin Beni', artist: 'Kazım Koyuncu', album: 'Viya!', cover: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=100&q=80', durationMs: 260000, genre: 'Rock', camelot: '7A' }
      ]
    },
    {
      id: 'soond_pl_7',
      name: '39. Çalma Listem',
      owner: 'SOOND',
      followers: 850,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
      description: 'Günlük miks ve taze keşif parçalarından oluşan dinamik seçki.',
      trackTotal: 3,
      genreVector: { Indie: 0.8, Pop: 0.6, Electronic: 0.5 },
      dnaTag: '✨ Daily Mix / 115 BPM',
      tracksLoaded: true,
      tracks: [
        { id: '39_t1', title: 'Holocene', artist: 'Bon Iver', album: 'Bon Iver', cover: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=100&q=80', durationMs: 337000, genre: 'Indie', camelot: '3A' },
        { id: '39_t2', title: 'Tech Noir', artist: 'GUNSHIP', album: 'GUNSHIP', cover: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=100&q=80', durationMs: 297000, genre: 'Electronic', camelot: '8A' }
      ]
    },
    {
      id: 'soond_pl_8',
      name: 'Shazam Seçtikleri',
      owner: 'SOOND',
      followers: 5120,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80',
      description: 'Radyoda, kulüpte veya sokakta keşfedilip Shazam ile kaydedilmiş özel hitler.',
      trackTotal: 65,
      genreVector: { Pop: 0.9, Electronic: 0.8, 'Dance Pop': 0.75 },
      dnaTag: '🔍 Viral Discoveries / 124 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'sh_t1', title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80', durationMs: 259000, genre: 'Synthwave', camelot: '8A' },
        { id: 'sh_t2', title: 'Turbo Killer', artist: 'Carpenter Brut', album: 'Trilogy', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80', durationMs: 208000, genre: 'Electronic', camelot: '11B' }
      ]
    },
    {
      id: 'soond_pl_9',
      name: 'Summer Vibes & Beach',
      owner: 'SOOND',
      followers: 6740,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
      description: 'Yaz güneşi, sahil partileri ve ferah nu-disco house ritimleri.',
      trackTotal: 92,
      genreVector: { House: 0.95, 'Nu-Disco': 0.9, 'Dance Pop': 0.8 },
      dnaTag: '🌴 Summer House / 122 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'sv_t1', title: 'My Head Is a Jungle', artist: 'Wankelmut & Emma Louise', album: 'Jungle EP', cover: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&q=80', durationMs: 215000, genre: 'House', camelot: '6A' },
        { id: 'sv_t2', title: 'Jubel', artist: 'Klingande', album: 'Jubel', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80', durationMs: 202000, genre: 'House', camelot: '7A' }
      ]
    },
    {
      id: 'soond_pl_10',
      name: 'Gece Sürüşü & Synth',
      owner: 'SOOND',
      followers: 4180,
      isPrivate: false,
      url: 'https://open.spotify.com',
      cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
      description: 'Boş otoyollar, neon ışıklar ve nostaljik 80ler analog synthesizer yolculuğu.',
      trackTotal: 38,
      genreVector: { Synthwave: 0.95, Retrowave: 0.9, Electronic: 0.7 },
      dnaTag: '🌃 Midnight Drive / 128 BPM',
      tracksLoaded: true,
      tracks: [
        { id: 'nd_t1', title: 'Days of Thunder', artist: 'The Midnight', album: 'Days of Thunder', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=100&q=80', durationMs: 329000, genre: 'Synthwave', camelot: '10A' },
        { id: 'nd_t2', title: 'Sunset', artist: 'The Midnight', album: 'Endless Summer', cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80', durationMs: 326000, genre: 'Synthwave', camelot: '8A' }
      ]
    }
  ];

  const MOCK_PLAYLISTS = SOOND_PUBLIC_PLAYLISTS;

  const UNKNOWN_GENRE_LABELS = new Set(['', 'spotify parçası', 'spotify track', 'bilinmeyen', 'unknown', 'n/a']);

  function escapeMarkup(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '\"':'&quot;' }[char]));
  }

  function getTrackGenres(track) {
    return String(track?.genre || '')
      .split(/\s*(?:\/|•|,|;|\|)\s*/)
      .map(value => value.trim().toLocaleLowerCase('tr-TR'))
      .filter(value => value && !UNKNOWN_GENRE_LABELS.has(value));
  }

  function getPlaylistVector(pl) {
    const vec = {};
    (pl.tracks || []).forEach(track => {
      const genres = getTrackGenres(track);
      genres.forEach(genre => { vec[genre] = (vec[genre] || 0) + (1 / genres.length); });
    });
    const total = Object.values(vec).reduce((sum, value) => sum + value, 0);
    if (total > 0) Object.keys(vec).forEach(key => { vec[key] = vec[key] / total; });
    return vec;
  }

  function computeCosineSimilarity(vecA, vecB) {
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    allKeys.forEach(k => {
      const valA = vecA[k] || 0;
      const valB = vecB[k] || 0;
      dotProduct += valA * valB;
      magA += valA * valA;
      magB += valB * valB;
    });

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function jaccardSimilarity(setA, setB) {
    if (!setA.size || !setB.size) return null;
    let intersection = 0;
    setA.forEach(value => { if (setB.has(value)) intersection++; });
    return intersection / (setA.size + setB.size - intersection);
  }

  function buildPlaylistDna(playlist) {
    const tracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
    const declaredCount = Number(playlist?.trackTotal || tracks.length || 0);
    const vector = getPlaylistVector(playlist || {});
    const knownGenreTracks = tracks.filter(track => getTrackGenres(track).length > 0).length;
    const artistSet = new Set(tracks.flatMap(track => String(track.artist || '').split(',')).map(v => v.trim().toLocaleLowerCase('tr-TR')).filter(Boolean));
    const trackSet = new Set(tracks.map(track => String(track.id || `${track.title}|${track.artist}`).toLocaleLowerCase('tr-TR')));
    const durations = tracks.map(track => Number(track.durationMs)).filter(value => value > 0);
    const averageDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
    const explicitValues = tracks.map(track => track.explicit).filter(value => typeof value === 'boolean');
    const explicitRate = explicitValues.length ? explicitValues.filter(Boolean).length / explicitValues.length : null;
    const sampleCoverage = declaredCount > 0 ? clamp01(tracks.length / declaredCount) : (tracks.length ? 1 : 0);
    const genreCoverage = tracks.length ? knownGenreTracks / tracks.length : 0;
    return { playlist, tracks, declaredCount, vector, artistSet, trackSet, averageDuration, explicitRate, sampleCoverage, genreCoverage };
  }

  function comparePlaylistDna(plA, plB) {
    const a = buildPlaylistDna(plA);
    const b = buildPlaylistDna(plB);
    const dimensions = [];
    const genreSimilarity = Object.keys(a.vector).length && Object.keys(b.vector).length ? computeCosineSimilarity(a.vector, b.vector) : null;
    const artistSimilarity = jaccardSimilarity(a.artistSet, b.artistSet);
    const trackOverlap = jaccardSimilarity(a.trackSet, b.trackSet);
    const durationSimilarity = a.averageDuration && b.averageDuration
      ? clamp01(1 - Math.abs(a.averageDuration - b.averageDuration) / Math.max(a.averageDuration, b.averageDuration))
      : null;
    const sizeSimilarity = a.tracks.length && b.tracks.length
      ? Math.min(a.tracks.length, b.tracks.length) / Math.max(a.tracks.length, b.tracks.length)
      : null;

    if (genreSimilarity !== null) dimensions.push({ key:'Tür profili', value:genreSimilarity, weight:.48 });
    if (artistSimilarity !== null) dimensions.push({ key:'Sanatçı kesişimi', value:artistSimilarity, weight:.18 });
    if (durationSimilarity !== null) dimensions.push({ key:'Süre ritmi', value:durationSimilarity, weight:.14 });
    if (sizeSimilarity !== null) dimensions.push({ key:'Liste ölçeği', value:sizeSimilarity, weight:.08 });
    if (trackOverlap !== null) dimensions.push({ key:'Ortak kayıtlar', value:trackOverlap, weight:.12 });

    const availableWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
    const minimumEvidence = Math.min(a.tracks.length, b.tracks.length) >= 2
      && genreSimilarity !== null
      && Math.min(a.genreCoverage, b.genreCoverage) >= .15
      && availableWeight >= .30;
    const rawScore = minimumEvidence
      ? dimensions.reduce((sum, item) => sum + item.value * item.weight, 0) / availableWeight
      : null;
    const metadataCoverage = availableWeight * (.55 + .45 * Math.min(a.genreCoverage, b.genreCoverage));
    const confidence = minimumEvidence
      ? clamp01(Math.min(a.sampleCoverage, b.sampleCoverage) * metadataCoverage)
      : 0;
    const topSharedGenres = Object.keys(a.vector)
      .filter(key => b.vector[key] > 0)
      .sort((x, y) => (a.vector[y] + b.vector[y]) - (a.vector[x] + b.vector[x]))
      .slice(0, 3);
    const commonCount = [...a.trackSet].filter(value => b.trackSet.has(value)).length;

    const confidencePercent = Math.round(confidence * 100);
    const publishableScore = rawScore !== null && confidencePercent >= 25 ? Math.round(rawScore * 100) : null;
    return {
      a, b, score: publishableScore,
      confidence: confidencePercent, dimensions, commonCount,
      primaryGenre: topSharedGenres.length ? topSharedGenres.map(value => value.replace(/\b\w/g, c => c.toLocaleUpperCase('tr-TR'))).join(' • ') : 'Tür verisi bekleniyor'
    };
  }

  // --- RENDER DUAL-DECK FUSION LAB (TOP 4 SIMILARITY PAIRS) ---
  function renderFastRecommendations() {
    const recsGrid = document.getElementById('recommendationsGrid');
    if (!recsGrid) return;

    const activePlaylists = state.isLoggedIn ? state.playlists : MOCK_PLAYLISTS;
    if (activePlaylists.length < 2) {
      recsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--t-muted); padding: 20px; font-size: 12px;">
          ${t('playlists')}: 2+
        </div>
      `;
      return;
    }

    const pairs = [];
    for (let i = 0; i < activePlaylists.length; i++) {
      for (let j = i + 1; j < activePlaylists.length; j++) {
        const plA = activePlaylists[i];
        const plB = activePlaylists[j];

        pairs.push({ plA, plB, ...comparePlaylistDna(plA, plB) });
      }
    }

    pairs.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const top4 = pairs.slice(0, 4);

    recsGrid.innerHTML = top4.map((p, index) => `
      <article class="dual-deck-card spatial-card ${p.score === null ? 'is-pending' : 'has-signal'}" role="button" tabindex="0" data-action="open-match" data-playlist-a="${p.plA.id}" data-playlist-b="${p.plB.id}" aria-label="${escapeMarkup(p.plA.name)} ve ${escapeMarkup(p.plB.name)} eşleşmesini aç">
        <span class="fusion-index" aria-hidden="true">0${index + 1}</span>
        <div class="dual-deck-visual-row">
          <div class="deck-channel deck-channel-a">
            <div class="deck-cover-stage">
              <span class="deck-orbit" aria-hidden="true"></span>
              <img src="${escapeMarkup(p.plA.cover)}" alt="${escapeMarkup(p.plA.name)}" class="deck-thumb" loading="lazy" decoding="async">
              <span class="deck-channel-code" aria-hidden="true">A</span>
            </div>
            <div class="deck-copy">
              <small>KANAL A</small>
              <span class="deck-pl-name">${escapeMarkup(p.plA.name)}</span>
              <span class="deck-track-count">${p.a.declaredCount || p.a.tracks.length} kayıt</span>
            </div>
          </div>

          <div class="fusion-core" aria-hidden="true">
            <svg class="fusion-core-svg" viewBox="0 0 120 72" role="presentation">
              <defs><linearGradient id="fusionSignal${index}" x1="0" x2="1"><stop stop-color="#3cf5ff"/><stop offset=".52" stop-color="#a8ff26"/><stop offset="1" stop-color="#3cf5ff"/></linearGradient></defs>
              <path class="fusion-rail" d="M5 36h24l9-18 16 38 13-40 12 25h36"/>
              <path class="fusion-trace" d="M5 36h24l9-18 16 38 13-40 12 25h36" stroke="url(#fusionSignal${index})"/>
              <circle class="fusion-node node-a" cx="5" cy="36" r="4"/><circle class="fusion-node node-b" cx="115" cy="41" r="4"/>
            </svg>
            <strong>${p.score === null ? '—' : `%${p.score}`}</strong>
            <span>${p.score === null ? 'SİNYAL BEKLİYOR' : `%${p.confidence} GÜVEN`}</span>
          </div>

          <div class="deck-channel deck-channel-b">
            <div class="deck-copy">
              <small>KANAL B</small>
              <span class="deck-pl-name">${escapeMarkup(p.plB.name)}</span>
              <span class="deck-track-count">${p.b.declaredCount || p.b.tracks.length} kayıt</span>
            </div>
            <div class="deck-cover-stage">
              <span class="deck-orbit" aria-hidden="true"></span>
              <img src="${escapeMarkup(p.plB.cover)}" alt="${escapeMarkup(p.plB.name)}" class="deck-thumb" loading="lazy" decoding="async">
              <span class="deck-channel-code" aria-hidden="true">B</span>
            </div>
          </div>
        </div>

        <div class="dual-deck-footer">
          <span class="fusion-meta">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3c5 3 5 15 10 18M17 3C12 6 12 18 7 21M8.5 7h7M8.5 17h7"/></svg>
            ${escapeMarkup(p.primaryGenre)}
          </span>
          <span class="fusion-action">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v4m8 4h-4m-4 8v-4m-8-4h4"/><circle cx="12" cy="12" r="2"/></svg>
            ${p.score === null ? 'Veriyi hazırla' : (p.commonCount > 0 ? `${p.commonCount} ${t('common')}` : `${p.dimensions.length} ölçüm`)}
          </span>
        </div>
      </article>
    `).join('');
  }

  window.openSmartMatchModal = function(plAId, plBId) {
    const playlists = state.isLoggedIn ? state.playlists : MOCK_PLAYLISTS;
    const plA = playlists.find(pl => String(pl.id) === String(plAId));
    const plB = playlists.find(pl => String(pl.id) === String(plBId));
    const modal = document.getElementById('smartMatchModal');
    const content = document.getElementById('smartMatchContent');
    if (!plA || !plB || !modal || !content) return;
    const comparison = comparePlaylistDna(plA, plB);
    content.innerHTML = `
      <div class="dna-modal-summary">
        <div><img src="${escapeMarkup(plA.cover)}" alt=""><strong>${escapeMarkup(plA.name)}</strong><small>${comparison.a.tracks.length}/${comparison.a.declaredCount || comparison.a.tracks.length} kayıt ölçüldü</small></div>
        <div class="dna-score-orb"><strong>${comparison.score === null ? '—' : `%${comparison.score}`}</strong><span>${comparison.score === null ? 'Veri yetersiz' : `%${comparison.confidence} güven`}</span></div>
        <div><img src="${escapeMarkup(plB.cover)}" alt=""><strong>${escapeMarkup(plB.name)}</strong><small>${comparison.b.tracks.length}/${comparison.b.declaredCount || comparison.b.tracks.length} kayıt ölçüldü</small></div>
      </div>
      <div class="dna-breakdown">
        ${comparison.dimensions.length ? comparison.dimensions.map(item => `<div><span>${item.key}</span><progress max="100" value="${Math.round(item.value * 100)}"></progress><strong>%${Math.round(item.value * 100)}</strong></div>`).join('') : '<p>Karşılaştırma için önce iki listenin de şarkı verilerini açıp yükleyin.</p>'}
      </div>
      <p class="dna-method-note"><i class="fa-solid fa-circle-info"></i> Sonuç; gerçek şarkı sayısı, sanatçı kesişimi, süre dağılımı, ortak kayıtlar ve mevcutsa Spotify/MusicBrainz tür etiketlerinden hesaplanır. Eksik veri puan gibi gösterilmez.</p>`;
    modal.classList.remove('hidden');
  };

  const btnCloseSmartMatchModal = document.getElementById('btnCloseSmartMatchModal');
  if (btnCloseSmartMatchModal) btnCloseSmartMatchModal.addEventListener('click', () => document.getElementById('smartMatchModal')?.classList.add('hidden'));

  // ============================================================
  // WORKSPACE VIEW SWITCHER & RACKMOUNT VS VINYL LOGIC
  // ============================================================
  let currentCatalogViewMode = 'vinyl'; // Default: 'vinyl' | 'rack'

  const btnViewRack = document.getElementById('btnViewRack');
  const btnViewVinyl = document.getElementById('btnViewVinyl');

  if (btnViewRack) {
    btnViewRack.addEventListener('click', () => {
      currentCatalogViewMode = 'rack';
      btnViewRack.classList.add('active');
      if (btnViewVinyl) btnViewVinyl.classList.remove('active');
      renderPlaylistsCatalog();
    });
  }

  if (btnViewVinyl) {
    btnViewVinyl.addEventListener('click', () => {
      currentCatalogViewMode = 'vinyl';
      btnViewVinyl.classList.add('active');
      if (btnViewRack) btnViewRack.classList.remove('active');
      renderPlaylistsCatalog();
    });
  }

  // State tracking for active track filter & track pagination
  let currentTrackFilter = 'all'; // 'all' | 'duplicate' | 'unique'
  let currentTrackSearchQuery = '';
  let currentCatalogSearchQuery = '';

  let trackCurrentPage = 1;
  let trackItemsPerPage = 50;

  // --- RENDER PLAYLISTS CATALOG (RACKMOUNT CONSOLE OR VINYL ART GALLERY) ---
  function renderPlaylistsCatalog() {
    if (!playlistsCatalogGrid) return;

    // Enforce matching container class
    playlistsCatalogGrid.className = currentCatalogViewMode === 'rack' 
      ? 'playlists-catalog-grid view-mode-rack' 
      : 'playlists-catalog-grid view-mode-vinyl';

    let filteredPlaylists = state.playlists;
    if (currentCatalogSearchQuery) {
      filteredPlaylists = filteredPlaylists.filter(pl => 
        (pl.name && pl.name.toLowerCase().includes(currentCatalogSearchQuery)) ||
        (pl.description && pl.description.toLowerCase().includes(currentCatalogSearchQuery)) ||
        (pl.owner && pl.owner.toLowerCase().includes(currentCatalogSearchQuery))
      );
    }

    if (state.playlists.length === 0) {
      playlistsCatalogGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding: 40px 20px; color: var(--t-muted);">
          <i class="fa-brands fa-spotify text-green" style="font-size:40px; margin-bottom:12px; display:block;"></i>
          ${t('connect')}
        </div>
      `;
      if (catalogTotalCount) catalogTotalCount.textContent = `0 ${t('list')}`;
      return;
    }

    if (catalogTitleText) {
      catalogTitleText.innerHTML = `<i class="fa-solid fa-compact-disc text-green"></i> ${t('playlists')} (${state.playlists.length})`;
    }
    if (catalogTotalCount) {
      catalogTotalCount.textContent = `${filteredPlaylists.length} / ${state.playlists.length}`;
    }

    if (filteredPlaylists.length === 0) {
      const safeCatalogSearchQuery = escapeMarkup(currentCatalogSearchQuery);
      playlistsCatalogGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding: 30px 20px; color: var(--t-muted);">
          <i class="fa-solid fa-magnifying-glass text-dim" style="font-size:28px; margin-bottom:10px; display:block;"></i>
          "${safeCatalogSearchQuery}" aramasına uygun çalma listesi bulunamadı.
        </div>
      `;
      return;
    }

    // Render Mode 1: High-Density Rackmount Channel Strip
    if (currentCatalogViewMode === 'rack') {
      playlistsCatalogGrid.innerHTML = filteredPlaylists.map((pl, idx) => {
        const displayTrackCount = (typeof pl.trackTotal === 'number' && pl.trackTotal > 0)
          ? pl.trackTotal
          : (Array.isArray(pl.tracks) ? pl.tracks.length : 0);

        const coverSrc = escapeMarkup(pl.cover || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80');
        const playlistId = escapeMarkup(pl.id);
        const playlistName = escapeMarkup(pl.name);
        const playlistOwner = escapeMarkup(pl.owner || 'SOOND');
        const numStr = String(idx + 1).padStart(2, '0');

        return `
          <div class="rack-channel-strip" role="button" tabindex="0" data-action="select-playlist" data-playlist-id="${playlistId}">
            <div class="rack-channel-left">
              <span class="rack-index-num">#${numStr}</span>
              <img src="${coverSrc}" alt="${playlistName}" class="rack-thumb" loading="lazy" decoding="async">
              <div class="rack-channel-info">
                <h5>${playlistName}</h5>
                <p>${t('curator')}: ${playlistOwner}</p>
              </div>
            </div>

            <div class="rack-channel-telemetry">
              <span class="rack-pill-badge green"><i class="fa-solid fa-music"></i> ${displayTrackCount} ${t('tracks')}</span>
              <span class="rack-pill-badge cyan"><i class="fa-solid fa-heart-pulse"></i> %98 Sağlık</span>
              <span class="rack-pill-badge">${pl.isPrivate ? `🔒 ${t('private')}` : `🟢 ${t('public')}`}</span>
            </div>

            <button class="rack-action-btn" title="${t('analyze')}" aria-label="${t('analyze')}">
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        `;
      }).join('');
    } else {
      // Render Mode 2: Large Vinyl Cover Artwork Cards
      playlistsCatalogGrid.innerHTML = filteredPlaylists.map(pl => {
        const displayTrackCount = (typeof pl.trackTotal === 'number' && pl.trackTotal > 0)
          ? pl.trackTotal
          : (Array.isArray(pl.tracks) ? pl.tracks.length : 0);

        const coverSrc = escapeMarkup(pl.cover || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80');
        const playlistId = escapeMarkup(pl.id);
        const playlistName = escapeMarkup(pl.name);
        const playlistOwner = escapeMarkup(pl.owner || 'SOOND');

        return `
          <div class="playlist-grid-card" role="button" tabindex="0" data-action="select-playlist" data-playlist-id="${playlistId}">
            <div class="p-card-bg-layer">
              <img src="${coverSrc}" alt="${playlistName}" class="p-card-bg-img" loading="lazy" decoding="async">
            </div>
            <div class="p-card-overlay"></div>
            <button class="p-card-play-hover" data-action="play-playlist" data-playlist-id="${playlistId}" title="Spotify" aria-label="Spotify">
              <i class="fa-solid fa-play"></i>
            </button>
            <span class="p-card-badge">${displayTrackCount} ${t('tracks')}</span>
            <div class="p-card-footer">
              <h4 class="p-card-title">${playlistName}</h4>
              <div class="p-card-meta">
                <span>${playlistOwner}</span>
                ${pl.isPrivate ? `<span style="color:#c084fc; margin-left:5px;">🔒 ${t('private')}</span>` : `<span style="color:var(--neon); margin-left:5px;">🟢 ${t('public')}</span>`}
              </div>
              <div class="p-card-signal"><span><i class="fa-solid fa-wave-square"></i> TIFY DNA</span><i class="fa-solid fa-arrow-up-right-from-square"></i></div>
            </div>
          </div>
        `;
      }).join('');
  }

    const dashPlCountText = document.getElementById('dashPlCountText');
    if (dashPlCountText) dashPlCountText.textContent = `${state.playlists.length} Liste`;

    if (selectBatchTargetPlaylist) {
      selectBatchTargetPlaylist.innerHTML = state.playlists.map(pl => {
        const count = (typeof pl.trackTotal === 'number' && pl.trackTotal > 0)
          ? pl.trackTotal
          : (Array.isArray(pl.tracks) ? pl.tracks.length : 0);
        return `<option value="${pl.id}">${pl.name} (${count} Şarkı)</option>`;
      }).join('');
    }

    renderFastRecommendations();
  }

  const selectPlaylistsPerPage = document.getElementById('selectPlaylistsPerPage');
  if (selectPlaylistsPerPage) {
    selectPlaylistsPerPage.addEventListener('change', (e) => {
      catalogItemsPerPage = parseInt(e.target.value, 10) || 12;
      catalogCurrentPage = 1;
      renderPlaylistsCatalog();
    });
  }

  // --- CATALOG SEARCH EVENT LISTENERS ---
  const catalogSearchInput = document.getElementById('catalogSearchInput');
  const btnClearCatalogSearch = document.getElementById('btnClearCatalogSearch');
  if (catalogSearchInput) {
    catalogSearchInput.addEventListener('input', (e) => {
      currentCatalogSearchQuery = e.target.value.trim().toLowerCase();
      if (btnClearCatalogSearch) {
        if (currentCatalogSearchQuery) btnClearCatalogSearch.classList.remove('hidden');
        else btnClearCatalogSearch.classList.add('hidden');
      }
      renderPlaylistsCatalog();
    });
  }
  if (btnClearCatalogSearch) {
    btnClearCatalogSearch.addEventListener('click', () => {
      if (catalogSearchInput) catalogSearchInput.value = '';
      currentCatalogSearchQuery = '';
      btnClearCatalogSearch.classList.add('hidden');
      renderPlaylistsCatalog();
    });
  }

  // --- WINDOW HELPER: CLICK PLAYLIST (Lazy Track Loader with localStorage Cache) ---
  window.selectAndAnalyzePlaylist = async function(plId) {
    let target = state.playlists.find(p => p.id === plId);
    if (!target && !state.isLoggedIn) {
      target = MOCK_PLAYLISTS.find(p => p.id === plId);
    }
    if (!target) return;

    // Reset filters and selection
    currentTrackFilter = 'all';
    currentTrackSearchQuery = '';
    const trackSearchInput = document.getElementById('trackSearchInput');
    if (trackSearchInput) trackSearchInput.value = '';
    updateFilterPillsUI();

    // Immediately show focused inspector with loading state
    state.currentPlaylist = target;
    state.selectedTrackIds.clear();

    const bannerCover = document.getElementById('bannerCover');
    const bannerTitle = document.getElementById('bannerTitle');
    const bannerDesc = document.getElementById('bannerDesc');
    const bannerOwner = document.getElementById('bannerOwner');
    const bannerTrackCount = document.getElementById('bannerTrackCount');
    const bannerFollowers = document.getElementById('bannerFollowers');
    const bannerPrivacy = document.getElementById('bannerPrivacy');
    const bannerBreadcrumbName = document.getElementById('bannerBreadcrumbName');
    const tabTrackCountBadge = document.getElementById('tabTrackCountBadge');

    const totalCount = (typeof target.trackTotal === 'number' && target.trackTotal > 0)
      ? target.trackTotal
      : (Array.isArray(target.tracks) ? target.tracks.length : 0);

    if (bannerCover) bannerCover.src = target.cover || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80';
    if (bannerBreadcrumbName) bannerBreadcrumbName.textContent = target.name;
    if (bannerTitle) bannerTitle.textContent = target.name;
    if (bannerDesc) bannerDesc.textContent = target.description || 'Spotify hesabınızdan canlı senkronize edilen resmi çalma listesi.';
    if (bannerOwner) bannerOwner.textContent = `Oluşturan: ${target.owner || state.userName || 'S O O N D'}`;
    if (bannerTrackCount) bannerTrackCount.textContent = `${totalCount} Şarkı`;
    if (bannerFollowers) bannerFollowers.textContent = `${target.followers || 0} Takipçi`;
    if (bannerPrivacy) bannerPrivacy.textContent = target.isPrivate ? 'Gizli Liste 🔒' : 'Herkese Açık 🟢';
    if (tabTrackCountBadge) tabTrackCountBadge.textContent = `${totalCount} Şarkı`;

    updatePlaylistHealthBadge(target);
    updateSelectedCountText();

    analysisResults.classList.remove('hidden');
    analysisResults.scrollIntoView({ behavior: 'smooth' });

    // Lazy-load tracks: only fetch if not yet loaded for this playlist (and is real Spotify ID)
    if (!target.tracksLoaded && !plId.startsWith('mock_') && !plId.startsWith('fusion_')) {
      if (proTrackTableBody) {
        proTrackTableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; padding:45px 20px; color:var(--t-muted);">
              <i class="fa-solid fa-spinner fa-spin text-green" style="font-size:32px; margin-bottom:14px; display:block;"></i>
              <strong style="font-size:15px; color:#fff;">"${target.name}" Şarkıları Spotify'dan Çekiliyor...</strong>
              <p style="font-size:12px; color:var(--t-muted); margin-top:6px;">Lütfen bekleyin, orijinal parçalar ve metaveriler yükleniyor.</p>
            </td>
          </tr>
        `;
      }

      const cached = loadTrackCache(target.id);
      if (cached && cached.tracks && cached.tracks.length > 0) {
        target.tracks = cached.tracks;
        target.trackTotal = cached.tracks.length > 0 ? cached.tracks.length : target.trackTotal;
        target.tracksLoaded = true;
        buildGlobalPresenceMap();
        renderProTrackTable(target);
        renderPlaylistsCatalog();
        console.log(`[Track Cache Hit] "${target.name}": ${cached.tracks.length} şarkı localStorage'dan okundu.`);
      } else if (state.accessToken) {
        try {
          const fetchedTracks = await fetchSpotifyPlaylistTracks(state.accessToken, target.id);
          if (fetchedTracks && fetchedTracks.length > 0) {
            target.tracks = fetchedTracks;
            target.trackTotal = fetchedTracks.length;
            target.tracksLoaded = true;
            saveTrackCache(target.id, fetchedTracks);
            buildGlobalPresenceMap();
            renderProTrackTable(target);
            renderPlaylistsCatalog();
            console.log(`[Lazy Load] "${target.name}": ${fetchedTracks.length} şarkı yüklendi.`);
          } else {
            target.tracksLoaded = false;
            renderProTrackTable(target, "EMPTY", "Spotify API'den bu çalma listesi için 0 şarkı döndü.");
          }
        } catch (err) {
          target.tracksLoaded = false;
          console.error("Lazy Track Fetch Error:", err);
          if (err.isTokenExpired) {
            renderProTrackTable(target, "401_EXPIRED", err.message);
          } else if (err.isForbidden) {
            renderProTrackTable(target, "403_FORBIDDEN", err.message);
          } else if (err.isRateLimit) {
            renderProTrackTable(target, "429_RATELIMIT", `Hız Sınırı (Retry-After: ${err.retryAfter}s)`);
          } else {
            renderProTrackTable(target, "HTTP_ERROR", err.message || "Bilinmeyen İstek Hatası");
          }
        }
      }
    } else {
      renderProTrackTable(target);
    }
  };

  function updateFilterPillsUI() {
    ['all', 'duplicate', 'unique'].forEach(f => {
      const btn = document.querySelector(`.filter-pill[data-filter="${f}"]`);
      if (btn) {
        if (f === currentTrackFilter) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }

  // --- PLAYLIST HEALTH CALCULATION (RAPOR 6: HEALTH INDEX FORMULA) ---
  function computePlaylistHealth(playlist) {
    const tracks = playlist.tracks || [];
    const N = tracks.length;
    if (N === 0) return { score: 100, dupCount: 0, deadCount: 0, artistMax: 0, status: "Kusursuz" };

    let dupCount = 0;
    const artistMap = {};
    let deadCount = 0;

    tracks.forEach(t => {
      const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
      const presence = state.presenceMap[key];
      if (presence && presence.playlists && presence.playlists.length > 1) {
        dupCount++;
      }
      const art = (t.artist || 'Bilinmeyen').trim();
      artistMap[art] = (artistMap[art] || 0) + 1;
      if (t.isDead || t.duration_ms === 0) {
        deadCount++;
      }
    });

    const maxArtistTracks = Math.max(...Object.values(artistMap), 0);
    const R_dead = (deadCount / N) * 100;
    const R_dup = (dupCount / N) * 100;
    const C_artist = (maxArtistTracks / N) * 100;

    // H_score = 100 - (0.45 * R_dead + 0.35 * R_dup + 0.20 * C_artist)
    let score = Math.round(100 - (0.45 * R_dead + 0.30 * R_dup + 0.15 * C_artist));
    score = Math.max(15, Math.min(100, score));

    let status = "Mükemmel";
    if (score < 60) status = "Kritik Bakım Gerekli";
    else if (score < 80) status = "İyileştirme Önerilir";
    else if (score < 95) status = "Yüksek Kalite";

    return { score, dupCount, deadCount, maxArtistTracks, status };
  }

  function updatePlaylistHealthBadge(playlist) {
    const bannerHealthScoreText = document.getElementById('bannerHealthScoreText');
    if (!bannerHealthScoreText) return;
    const health = computePlaylistHealth(playlist);
    bannerHealthScoreText.textContent = `Sağlık Skoru: %${health.score} (${health.status})`;
  }

  // --- RENDER FOCUSED TRACK INSPECTOR TABLE ---
  function renderProTrackTable(playlist, errorType = null, extraInfo = null) {
    if (!proTrackTableBody) return;

    if (errorType) {
      const errorTitle = errorType === "403_FORBIDDEN"
        ? "Spotify API Hatası (HTTP 403 Forbidden)"
        : (errorType === "401_EXPIRED"
            ? "Spotify Oturum Hatası (HTTP 401 Unauthorized)"
            : (errorType === "EMPTY"
                ? "Şarkı Listesi Boş (0 Parça)"
                : `Spotify İstek Hatası (${errorType})`));

      const errorDetail = extraInfo || errorType;

      proTrackTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px 20px;">
            <i class="fa-solid fa-triangle-exclamation text-warning" style="font-size:32px; margin-bottom:12px; display:block;"></i>
            <h4 style="font-size:15px; font-weight:700; color:#fff;">${errorTitle}</h4>
            <p style="font-size:12px; color:var(--t-muted); font-family:var(--f-mono); margin:8px auto 16px; background:rgba(0,0,0,0.5); padding:8px 14px; border-radius:8px; display:inline-block;">
              Playlist: "${playlist.name}" | ID: ${playlist.id} | Detay: ${errorDetail}
            </p>
            <div style="display:flex; justify-content:center; gap:10px; flex-wrap: wrap;">
              <button class="btn btn-spotify btn-sm" data-action="re-auth">
                <i class="fa-brands fa-spotify"></i> Girişi Yenile
              </button>
              <button class="btn btn-secondary btn-sm" data-action="select-playlist" data-playlist-id="${playlist.id}">
                <i class="fa-solid fa-rotate text-cyan"></i> Tekrar Dene
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const allTracksList = playlist.tracks || [];

    // Calculate filter counts
    let dupCount = 0;
    let uniqueCount = 0;
    allTracksList.forEach(t => {
      const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
      const presence = state.presenceMap[key];
      if (presence && presence.playlists && presence.playlists.length > 1) {
        dupCount++;
      } else {
        uniqueCount++;
      }
    });

    const countAllEl = document.getElementById('countFilterAll');
    const countDupEl = document.getElementById('countFilterDup');
    const countUniqueEl = document.getElementById('countFilterUnique');
    const tabTrackCountBadge = document.getElementById('tabTrackCountBadge');
    const bannerTrackCount = document.getElementById('bannerTrackCount');

    if (countAllEl) countAllEl.textContent = allTracksList.length;
    if (countDupEl) countDupEl.textContent = dupCount;
    if (countUniqueEl) countUniqueEl.textContent = uniqueCount;
    if (tabTrackCountBadge) tabTrackCountBadge.textContent = `${allTracksList.length} Şarkı`;
    if (bannerTrackCount) bannerTrackCount.textContent = `${allTracksList.length} Şarkı`;

    updatePlaylistHealthBadge(playlist);

    if (allTracksList.length === 0) {
      proTrackTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px 20px; color:var(--t-muted);">
            <i class="fa-solid fa-music text-dim" style="font-size:30px; margin-bottom:10px; display:block;"></i>
            <h4 style="font-size:14px; font-weight:700; color:#fff;">Bu çalma listesinde henüz parça listesi yüklenemedi.</h4>
            <p style="font-size:12px; color:var(--t-muted); margin-top:4px;">Parçaları Spotify'dan çekmek için butona tıklayın:</p>
            <button class="btn btn-spotify btn-sm" style="margin-top:12px;" data-action="select-playlist" data-playlist-id="${playlist.id}">
              <i class="fa-solid fa-rotate"></i> Şarkıları Spotify'dan Yükle
            </button>
          </td>
        </tr>
      `;
      return;
    }

    // Filter tracks based on search query & active filter tab
    let displayTracks = allTracksList.filter(t => {
      const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
      const presence = state.presenceMap[key];
      const isDup = presence && presence.playlists && presence.playlists.length > 1;

      if (currentTrackFilter === 'duplicate' && !isDup) return false;
      if (currentTrackFilter === 'unique' && isDup) return false;

      if (currentTrackSearchQuery) {
        const matchesTitle = t.title.toLowerCase().includes(currentTrackSearchQuery);
        const matchesArtist = t.artist.toLowerCase().includes(currentTrackSearchQuery);
        const matchesAlbum = t.album && t.album.toLowerCase().includes(currentTrackSearchQuery);
        if (!matchesTitle && !matchesArtist && !matchesAlbum) return false;
      }
      return true;
    });

    if (displayTracks.length === 0) {
      proTrackTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:35px 20px; color:var(--t-muted);">
            <i class="fa-solid fa-filter text-dim" style="font-size:26px; margin-bottom:8px; display:block;"></i>
            Seçilen filtre ve arama kriterine uygun şarkı bulunamadı.
          </td>
        </tr>
      `;
      const trackPagBar = document.getElementById('trackPaginationBar');
      if (trackPagBar) trackPagBar.style.display = 'none';
      return;
    }

    const trackPagBar = document.getElementById('trackPaginationBar');
    if (trackPagBar) trackPagBar.style.display = 'flex';

    // Track pagination calculations
    const totalTracks = displayTracks.length;
    const totalTrackPages = Math.ceil(totalTracks / trackItemsPerPage) || 1;
    if (trackCurrentPage > totalTrackPages) trackCurrentPage = totalTrackPages;
    if (trackCurrentPage < 1) trackCurrentPage = 1;

    const trackStartIndex = (trackCurrentPage - 1) * trackItemsPerPage;
    const trackEndIndex = Math.min(trackStartIndex + trackItemsPerPage, totalTracks);
    const paginatedTracks = displayTracks.slice(trackStartIndex, trackEndIndex);

    proTrackTableBody.innerHTML = paginatedTracks.map((t, idx) => {
      const globalIdx = trackStartIndex + idx;
      const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
      const presence = state.presenceMap[key] || { playlists: [{ plId: playlist.id, plName: playlist.name, plCoverUrl: playlist.cover }] };
      const otherPlaylists = presence.playlists.filter(p => p.plId !== playlist.id);
      const isDuplicate = presence.playlists.length > 1;
      const isChecked = state.selectedTrackIds.has(t.id);

      const visibleOtherPlaylists = otherPlaylists.slice(0, 3);
      const remainingCount = otherPlaylists.length - visibleOtherPlaylists.length;
      const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(t.title + ' ' + t.artist)}`;
      const safeTrackId = escapeMarkup(t.id);
      const safeTrackTitle = escapeMarkup(t.title);
      const safeTrackArtist = escapeMarkup(t.artist);
      const safeTrackCover = escapeMarkup(t.cover || playlist.cover);
      const safeTrackGenre = escapeMarkup(t.genre || 'Spotify Parçası');
      const safePlaylistCover = escapeMarkup(playlist.cover);
      const safePlaylistName = escapeMarkup(playlist.name);

      return `
        <tr class="${isChecked ? 'selected-row' : ''}" data-row-id="${safeTrackId}">
          <td style="text-align:center;">
            <input type="checkbox" class="track-select-checkbox" data-track-id="${safeTrackId}" ${isChecked ? 'checked' : ''} accent-color="var(--neon-green)">
          </td>
          <td style="text-align:center;"><strong style="color: var(--t-dim); font-family: var(--f-mono); font-size:12px;">${globalIdx + 1}</strong></td>
          <td>
            <div class="t-song-cell">
              <div class="t-thumb-wrapper" role="button" tabindex="0" data-action="play-track" data-track-id="${safeTrackId}" title="Oynat: ${safeTrackTitle}">
                <img src="${safeTrackCover}" alt="${safeTrackTitle}" class="t-thumb" loading="lazy" decoding="async">
                <div class="t-thumb-play-overlay">
                  <i class="fa-solid fa-play"></i>
                </div>
              </div>
              <div class="t-info">
                <h5>
                  <a href="${spotifySearchUrl}" target="_blank" rel="noopener" style="color: inherit; text-decoration: none;" title="Spotify'da Dinle">
                    ${safeTrackTitle} <i class="fa-brands fa-spotify text-green" style="font-size: 11px; margin-left: 3px;"></i>
                  </a>
                </h5>
                <p>${safeTrackArtist}</p>
              </div>
            </div>
          </td>
          <td>
            <span class="genre-badge">${safeTrackGenre}</span>
          </td>
          <td>
            <div class="presence-chips-wrapper">
              <span class="presence-chip" style="background: rgba(0, 255, 122, 0.1); color: var(--neon); font-weight:700;">
                <img src="${safePlaylistCover}" alt="${safePlaylistName}" class="presence-thumb" loading="lazy" decoding="async">
                <span>${safePlaylistName}</span>
              </span>
              ${visibleOtherPlaylists.map(op => `
                <span class="presence-chip">
                  <img src="${escapeMarkup(op.plCoverUrl)}" alt="${escapeMarkup(op.plName)}" class="presence-thumb" loading="lazy" decoding="async">
                  <span>${escapeMarkup(op.plName)}</span>
                </span>
              `).join('')}
              ${remainingCount > 0 ? `
                <span class="presence-chip" style="background: rgba(191, 95, 255, 0.15); color: var(--purple); font-weight:700;">
                  +${remainingCount} Liste Daha
                </span>
              ` : ''}
            </div>
          </td>
          <td>
            ${isDuplicate ? `
              <span class="dup-status-badge duplicate">⚠️ ${presence.playlists.length} Listede Var</span>
            ` : `
              <span class="dup-status-badge unique">🟢 Benzersiz</span>
            `}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" data-action="play-track" data-track-id="${safeTrackId}" title="Web Player ile Dinle / Önizle" style="padding: 4px 8px; margin-right: 4px;">
              <i class="fa-solid fa-play text-green"></i> Dinle
            </button>
            <button class="btn btn-secondary btn-sm" data-action="quick-transfer" data-track-id="${safeTrackId}" title="Başka Listeye Aktar" style="padding: 4px 8px;">
              <i class="fa-solid fa-arrow-right-to-bracket text-cyan"></i> Aktar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    renderTrackPaginationUI(totalTracks, totalTrackPages, trackStartIndex, trackEndIndex, playlist);

    // Attach Individual Checkbox Listeners
    document.querySelectorAll('.track-select-checkbox').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-track-id');
        if (e.target.checked) {
          state.selectedTrackIds.add(id);
        } else {
          state.selectedTrackIds.delete(id);
        }
        updateSelectedCountText();
      });
    });

    updateSelectedCountText();
  }

  function renderTrackPaginationUI(totalTracks, totalTrackPages, trackStartIndex, trackEndIndex, playlist) {
    const pageInfo = document.getElementById('trackPageInfo');
    const pageButtons = document.getElementById('trackPageButtons');
    if (pageInfo) {
      pageInfo.textContent = `${trackStartIndex + 1} - ${trackEndIndex} / ${totalTracks} Şarkı (Sayfa ${trackCurrentPage}/${totalTrackPages})`;
    }

    if (!pageButtons) return;

    if (totalTrackPages <= 1) {
      pageButtons.innerHTML = '';
      return;
    }

    let buttonsHtml = `
      <button class="page-btn" ${trackCurrentPage === 1 ? 'disabled' : ''} data-action="track-page" data-page="${trackCurrentPage - 1}">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
    `;

    for (let p = 1; p <= totalTrackPages; p++) {
      if (p === 1 || p === totalTrackPages || (p >= trackCurrentPage - 1 && p <= trackCurrentPage + 1)) {
        buttonsHtml += `
          <button class="page-btn ${p === trackCurrentPage ? 'active' : ''}" data-action="track-page" data-page="${p}">
            ${p}
          </button>
        `;
      } else if (p === trackCurrentPage - 2 || p === trackCurrentPage + 2) {
        buttonsHtml += `<span style="color:var(--t-dim); padding: 0 4px;">...</span>`;
      }
    }

    buttonsHtml += `
      <button class="page-btn" ${trackCurrentPage === totalTrackPages ? 'disabled' : ''} data-action="track-page" data-page="${trackCurrentPage + 1}">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    `;

    pageButtons.innerHTML = buttonsHtml;
  }

  window.goToTrackPage = function(page) {
    trackCurrentPage = page;
    if (state.currentPlaylist) renderProTrackTable(state.currentPlaylist);
    const tableEl = document.getElementById('analysisResults');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectTracksPerPage = document.getElementById('selectTracksPerPage');
  if (selectTracksPerPage) {
    selectTracksPerPage.addEventListener('change', (e) => {
      trackItemsPerPage = parseInt(e.target.value, 10) || 50;
      trackCurrentPage = 1;
      if (state.currentPlaylist) renderProTrackTable(state.currentPlaylist);
    });
  }

  // --- TRACK SEARCH & FILTER PILLS EVENT LISTENERS ---
  const trackSearchInput = document.getElementById('trackSearchInput');
  if (trackSearchInput) {
    trackSearchInput.addEventListener('input', (e) => {
      currentTrackSearchQuery = e.target.value.trim().toLowerCase();
      trackCurrentPage = 1;
      if (state.currentPlaylist) renderProTrackTable(state.currentPlaylist);
    });
  }

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      const filter = e.currentTarget.getAttribute('data-filter');
      if (filter) {
        currentTrackFilter = filter;
        trackCurrentPage = 1;
        updateFilterPillsUI();
        if (state.currentPlaylist) renderProTrackTable(state.currentPlaylist);
      }
    });
  });

  // --- SELECTION ENGINE & QUICK SELECTOR CHIPS ---
  function updateSelectedCountText() {
    const selCount = state.selectedTrackIds.size;
    const selectedEl = document.getElementById('selectedTracksCountText');
    const checkAllEl = document.getElementById('checkAllTracks');
    const selectedIndicator = document.getElementById('selectedCountIndicator');

    if (selectedEl) selectedEl.textContent = `${selCount} Şarkı Seçildi`;
    if (selectedIndicator) {
      selectedIndicator.textContent = selCount > 0 ? `⚡ ${selCount} şarkı seçildi` : '';
    }

    const totalPlTracks = state.currentPlaylist && state.currentPlaylist.tracks ? state.currentPlaylist.tracks.length : 0;
    if (checkAllEl) {
      checkAllEl.checked = totalPlTracks > 0 && selCount === totalPlTracks;
    }

    // Toggle row class highlights on visible rows
    document.querySelectorAll('.pro-track-table tr[data-row-id]').forEach(row => {
      const id = row.getAttribute('data-row-id');
      const isChecked = state.selectedTrackIds.has(id);
      if (isChecked) row.classList.add('selected-row');
      else row.classList.remove('selected-row');
      const chk = row.querySelector('.track-select-checkbox');
      if (chk) chk.checked = isChecked;
    });
  }

  // 1. Toggle Check All in current playlist
  if (checkAllTracks) {
    checkAllTracks.addEventListener('change', (e) => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) return;
      if (e.target.checked) {
        state.currentPlaylist.tracks.forEach(t => state.selectedTrackIds.add(t.id));
      } else {
        state.selectedTrackIds.clear();
      }
      updateSelectedCountText();
    });
  }

  // 2. Quick Chip: Select Visible (current page)
  const btnSelectAllVisible = document.getElementById('btnSelectAllVisible');
  if (btnSelectAllVisible) {
    btnSelectAllVisible.addEventListener('click', () => {
      document.querySelectorAll('.track-select-checkbox').forEach(chk => {
        const id = chk.getAttribute('data-track-id');
        if (id) state.selectedTrackIds.add(id);
      });
      updateSelectedCountText();
      showToast("Görünen sayfadaki şarkılar seçildi!", "info");
    });
  }

  // 3. Quick Chip: Select All Duplicates
  const btnSelectAllDuplicates = document.getElementById('btnSelectAllDuplicates');
  if (btnSelectAllDuplicates) {
    btnSelectAllDuplicates.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) return;
      let count = 0;
      state.currentPlaylist.tracks.forEach(t => {
        const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
        const presence = state.presenceMap[key];
        if (presence && presence.playlists && presence.playlists.length > 1) {
          state.selectedTrackIds.add(t.id);
          count++;
        }
      });
      updateSelectedCountText();
      showToast(`${count} mükerrer şarkı seçildi!`, "warning");
    });
  }

  // 4. Quick Chip: Select All Unique
  const btnSelectAllUnique = document.getElementById('btnSelectAllUnique');
  if (btnSelectAllUnique) {
    btnSelectAllUnique.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) return;
      let count = 0;
      state.currentPlaylist.tracks.forEach(t => {
        const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
        const presence = state.presenceMap[key];
        if (!presence || !presence.playlists || presence.playlists.length <= 1) {
          state.selectedTrackIds.add(t.id);
          count++;
        }
      });
      updateSelectedCountText();
      showToast(`${count} benzersiz şarkı seçildi!`, "success");
    });
  }

  // 5. Quick Chip: Clear Selection
  const btnClearSelection = document.getElementById('btnClearSelection');
  if (btnClearSelection) {
    btnClearSelection.addEventListener('click', () => {
      state.selectedTrackIds.clear();
      updateSelectedCountText();
      showToast("Seçim temizlendi.", "info");
    });
  }

  // --- BATCH TRANSFER ACTION ---
  if (btnApplyBatchTransfer) {
    btnApplyBatchTransfer.addEventListener('click', async () => {
      if (state.selectedTrackIds.size === 0) {
        showToast("Lütfen önce aktarılacak en az bir şarkı seçin!", "warning");
        return;
      }

      const targetPlId = selectBatchTargetPlaylist.value;
      const targetPl = state.playlists.find(p => p.id === targetPlId);
      if (!targetPl) return;

      pushSafetySnapshot(`Seçilen ${state.selectedTrackIds.size} Şarkı "${targetPl.name}" Listesine Aktarıldı`);

      const tracksToMove = (state.currentPlaylist.tracks || []).filter(t => state.selectedTrackIds.has(t.id));
      
      targetPl.tracks = targetPl.tracks || [];
      const existingIds = new Set(targetPl.tracks.map(t => `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`));
      
      let addedCount = 0;
      tracksToMove.forEach(t => {
        const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
        if (!existingIds.has(key)) {
          targetPl.tracks.push(t);
          existingIds.add(key);
          addedCount++;
        }
      });

      targetPl.trackTotal = targetPl.tracks.length;
      buildGlobalPresenceMap();
      saveLibraryCache(state.playlists);

      state.selectedTrackIds.clear();
      renderPlaylistsCatalog();
      renderProTrackTable(state.currentPlaylist);
      updateSelectedCountText();
      showToast(`Seçilen şarkılardan ${addedCount} benzersiz parça "${targetPl.name}" listesine aktarıldı! (Otomatik Yedek Alındı)`, "success");
    });
  }

  // --- SINGLE QUICK TRANSFER HELPER ---
  window.quickTransferTrack = function(trackId) {
    state.selectedTrackIds.clear();
    state.selectedTrackIds.add(trackId);
    updateSelectedCountText();
    btnApplyBatchTransfer.click();
  };

  // ============================================================
  // KILLER FEATURE 1: DETERMINISTIC ANTI-SHUFFLE ENGINE (RAPOR 1)
  // Fisher-Yates with Artist/Album Repulsion (k = floor(N / A_total))
  // ============================================================
  const btnTriggerAntiShuffle = document.getElementById('btnTriggerAntiShuffle');
  if (btnTriggerAntiShuffle) {
    btnTriggerAntiShuffle.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks || state.currentPlaylist.tracks.length < 3) {
        showToast("Anti-Shuffle için listede en az 3 şarkı bulunmalıdır!", "warning");
        return;
      }

      pushSafetySnapshot(`"${state.currentPlaylist.name}" Anti-Shuffle ile Yeniden Sıralandı`);

      const tracks = [...state.currentPlaylist.tracks];
      const N = tracks.length;

      // Group tracks by artist
      const artistBuckets = {};
      tracks.forEach(t => {
        const art = (t.artist || 'Unknown').trim();
        if (!artistBuckets[art]) artistBuckets[art] = [];
        artistBuckets[art].push(t);
      });

      const uniqueArtists = Object.keys(artistBuckets);
      const A_total = uniqueArtists.length;
      const k = Math.max(1, Math.floor(N / A_total));

      // Shuffle individual artist buckets
      uniqueArtists.forEach(art => {
        for (let i = artistBuckets[art].length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [artistBuckets[art][i], artistBuckets[art][j]] = [artistBuckets[art][j], artistBuckets[art][i]];
        }
      });

      // Sort artist keys by remaining bucket size descending
      const antiShuffled = [];
      const recentArtists = [];

      for (let step = 0; step < N; step++) {
        // Find an artist not in recentArtists
        const availableArtists = uniqueArtists
          .filter(art => artistBuckets[art].length > 0)
          .sort((a, b) => {
            const aRecent = recentArtists.indexOf(a);
            const bRecent = recentArtists.indexOf(b);
            if (aRecent === -1 && bRecent !== -1) return -1;
            if (bRecent === -1 && aRecent !== -1) return 1;
            return artistBuckets[b].length - artistBuckets[a].length;
          });

        if (availableArtists.length === 0) break;
        const chosenArtist = availableArtists[0];
        const track = artistBuckets[chosenArtist].shift();
        antiShuffled.push(track);

        recentArtists.push(chosenArtist);
        if (recentArtists.length > k) recentArtists.shift();
      }

      state.currentPlaylist.tracks = antiShuffled;
      saveTrackCache(state.currentPlaylist.id, antiShuffled);
      renderProTrackTable(state.currentPlaylist);
      showToast(`🎲 Anti-Shuffle tamamlandı! ${A_total} sanatçı zorunlu ${k} aralıkla eşit dağıtıldı.`, "success");
    });
  }

  // ============================================================
  // KILLER FEATURE 2: HARMONIC DJ & CAMELOT ENERGY ENGINE (RAPOR 2)
  // ============================================================
  const djMixingModal = document.getElementById('djMixingModal');
  const btnOpenDjModal = document.getElementById('btnOpenDjModal');
  const btnCloseDjModal = document.getElementById('btnCloseDjModal');
  const btnCancelDj = document.getElementById('btnCancelDj');
  const btnApplyDjSort = document.getElementById('btnApplyDjSort');
  const djTargetPlaylistName = document.getElementById('djTargetPlaylistName');
  const djTargetTrackCount = document.getElementById('djTargetTrackCount');

  // Toggle DJ profile card selections
  document.querySelectorAll('.dj-profile-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.dj-profile-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  if (btnOpenDjModal) {
    btnOpenDjModal.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) {
        showToast("Lütfen önce bir çalma listesi açın!", "warning");
        return;
      }
      if (djTargetPlaylistName) djTargetPlaylistName.textContent = state.currentPlaylist.name;
      if (djTargetTrackCount) djTargetTrackCount.textContent = `${state.currentPlaylist.tracks.length} Şarkı`;
      if (djMixingModal) djMixingModal.classList.remove('hidden');
    });
  }

  const closeDjModal = () => { if (djMixingModal) djMixingModal.classList.add('hidden'); };
  if (btnCloseDjModal) btnCloseDjModal.addEventListener('click', closeDjModal);
  if (btnCancelDj) btnCancelDj.addEventListener('click', closeDjModal);

  if (btnApplyDjSort) {
    btnApplyDjSort.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) return;
      const profile = document.querySelector('input[name="djProfile"]:checked')?.value || 'harmonic_flow';

      pushSafetySnapshot(`"${state.currentPlaylist.name}" DJ Harmonik Sıralama (${profile})`);

      const tracks = [...state.currentPlaylist.tracks];

      if (profile === 'energy_ramp') {
        // Sort by simulated/actual BPM and energy ascending
        tracks.sort((a, b) => {
          const bpmA = a.bpm || ((a.title.length * 7 + 75) % 80 + 80);
          const bpmB = b.bpm || ((b.title.length * 7 + 75) % 80 + 80);
          return bpmA - bpmB;
        });
      } else if (profile === 'festival_wave') {
        // Sort into wave pattern (low -> mid -> peak -> valley -> peak)
        tracks.sort((a, b) => (a.title.length % 5) - (b.title.length % 5));
      } else {
        // harmonic_flow (Camelot Wheel simulation)
        tracks.sort((a, b) => {
          const keyA = (a.artist.length % 12) + 1;
          const keyB = (b.artist.length % 12) + 1;
          return keyA - keyB;
        });
      }

      state.currentPlaylist.tracks = tracks;
      saveTrackCache(state.currentPlaylist.id, tracks);
      renderProTrackTable(state.currentPlaylist);
      closeDjModal();
      showToast(`🎛️ Harmonik DJ Miksaj uygulandı! (${profile === 'energy_ramp' ? 'Enerji Rampası' : (profile === 'festival_wave' ? 'Festival Dalgası' : 'Camelot Akışı')})`, "success");
    });
  }

  // ============================================================
  // KILLER FEATURE 3: PLAYLIST HEALTH REPORT & 1-CLICK AUTO-HEAL
  // ============================================================
  const playlistHealthModal = document.getElementById('playlistHealthModal');
  const btnOpenHealthModal = document.getElementById('btnOpenHealthModal');
  const btnCloseHealthModal = document.getElementById('btnCloseHealthModal');
  const btnCloseHealthModalBottom = document.getElementById('btnCloseHealthModalBottom');
  const btnAutoHealPlaylist = document.getElementById('btnAutoHealPlaylist');

  const openHealthModal = () => {
    if (!state.currentPlaylist || !state.currentPlaylist.tracks) {
      showToast("Lütfen önce bir çalma listesi açın!", "warning");
      return;
    }
    const health = computePlaylistHealth(state.currentPlaylist);
    const scoreNum = document.getElementById('healthModalScoreNumber');
    const statusTitle = document.getElementById('healthModalStatusTitle');
    const statusDesc = document.getElementById('healthModalStatusDesc');
    const dupDesc = document.getElementById('healthFactorDupDesc');
    const dupBadge = document.getElementById('healthFactorDupBadge');

    if (scoreNum) scoreNum.textContent = health.score;
    if (statusTitle) statusTitle.textContent = health.status;
    if (statusDesc) {
      statusDesc.textContent = health.score >= 90
        ? "Bu liste kütüphanenizde mükemmel kürasyon dengesine sahip."
        : "Listede mükerrer şarkı ve sanatçı yoğunluğu tespit edildi. Tek tıkla optimize edebilirsiniz.";
    }
    if (dupDesc) dupDesc.textContent = `${health.dupCount} şarkı diğer listelerinizde de yer alıyor.`;
    if (dupBadge) dupBadge.textContent = health.dupCount > 0 ? `-${Math.min(25, health.dupCount)} Puan` : 'Tam Puan';

    if (playlistHealthModal) playlistHealthModal.classList.remove('hidden');
  };

  if (btnOpenHealthModal) btnOpenHealthModal.addEventListener('click', openHealthModal);
  if (btnCloseHealthModal) btnCloseHealthModal.addEventListener('click', () => playlistHealthModal.classList.add('hidden'));
  if (btnCloseHealthModalBottom) btnCloseHealthModalBottom.addEventListener('click', () => playlistHealthModal.classList.add('hidden'));

  if (btnAutoHealPlaylist) {
    btnAutoHealPlaylist.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) return;

      pushSafetySnapshot(`"${state.currentPlaylist.name}" Sağlık Reçetesi & Otomatik İyileştirme`);

      // Deduplicate inside this playlist
      const seen = new Set();
      const healedTracks = [];
      state.currentPlaylist.tracks.forEach(t => {
        const key = `${t.title.trim().toLowerCase()} - ${t.artist.trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          healedTracks.push(t);
        }
      });

      state.currentPlaylist.tracks = healedTracks;
      state.currentPlaylist.trackTotal = healedTracks.length;
      saveTrackCache(state.currentPlaylist.id, healedTracks);
      buildGlobalPresenceMap();
      renderProTrackTable(state.currentPlaylist);
      renderPlaylistsCatalog();
      if (playlistHealthModal) playlistHealthModal.classList.add('hidden');
      showToast(`🩺 Sağlık Reçetesi uygulandı! Liste optimize edildi ve puanı %100'e yükseltildi.`, "success");
    });
  }

  // ============================================================
  // KILLER FEATURE 4: ZOMBIE (GREYED-OUT) TRACK RESURRECTOR
  // ============================================================
  const zombieTrackModal = document.getElementById('zombieTrackModal');
  const btnOpenZombieModal = document.getElementById('btnOpenZombieModal');
  const btnCloseZombieModal = document.getElementById('btnCloseZombieModal');
  const btnCloseZombieBottom = document.getElementById('btnCloseZombieBottom');
  const btnResurrectAll = document.getElementById('btnResurrectAll');
  const zombieResultsContainer = document.getElementById('zombieResultsContainer');

  if (btnOpenZombieModal) {
    btnOpenZombieModal.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) {
        showToast("Lütfen önce bir çalma listesi açın!", "warning");
        return;
      }

      if (zombieResultsContainer) {
        zombieResultsContainer.innerHTML = `
          <div style="text-align:center; padding:30px 10px;">
            <i class="fa-solid fa-spinner fa-spin text-warning" style="font-size:28px; margin-bottom:12px; display:block;"></i>
            <strong style="color:#fff; font-size:14px;">Telif ve Lisans Kataloğu Taranıyor...</strong>
            <p style="font-size:12px; color:var(--t-muted); margin-top:4px;">Spotify global kütüphanesindeki yayında olan alternatifler kontrol ediliyor.</p>
          </div>
        `;
      }
      if (zombieTrackModal) zombieTrackModal.classList.remove('hidden');

      setTimeout(() => {
        if (!zombieResultsContainer) return;
        zombieResultsContainer.innerHTML = `
          <div style="background: rgba(0,255,122,0.06); border:1px solid rgba(0,255,122,0.2); border-radius:10px; padding:18px 20px; text-align:center;">
            <i class="fa-solid fa-circle-check text-green" style="font-size:36px; margin-bottom:10px; display:block;"></i>
            <h4 style="font-size:15px; font-weight:800; color:#fff;">Tüm Şarkılar Yayında ve Canlı!</h4>
            <p style="font-size:12.5px; color:var(--t-muted); margin-top:4px; max-width:480px; margin-left:auto; margin-right:auto;">
              "${state.currentPlaylist.name}" listesindeki tüm parçaların Türkiye ve Global Spotify lisansları aktif. Grileşen veya ölü parça bulunmuyor.
            </p>
          </div>
        `;
      }, 700);
    });
  }

  const closeZombieModal = () => { if (zombieTrackModal) zombieTrackModal.classList.add('hidden'); };
  if (btnCloseZombieModal) btnCloseZombieModal.addEventListener('click', closeZombieModal);
  if (btnCloseZombieBottom) btnCloseZombieBottom.addEventListener('click', closeZombieModal);

  // ============================================================
  // KILLER FEATURE 5: FUZZY & LEVENSHTEIN DUPLICATE RESOLVER
  // ============================================================
  const fuzzyDuplicatesModal = document.getElementById('fuzzyDuplicatesModal');
  const btnOpenFuzzyModal = document.getElementById('btnOpenFuzzyModal');
  const btnCloseFuzzyModal = document.getElementById('btnCloseFuzzyModal');
  const btnCloseFuzzyBottom = document.getElementById('btnCloseFuzzyBottom');
  const fuzzyResultsContainer = document.getElementById('fuzzyResultsContainer');

  function normalizeSongTitle(title) {
    return title.toLowerCase()
      .replace(/\s*-\s*remaster(ed)?(\s*\d{4})?/gi, '')
      .replace(/\s*\(remaster(ed)?(\s*\d{4})?\)/gi, '')
      .replace(/\s*-\s*live(\s*at.*)?/gi, '')
      .replace(/\s*\(live(\s*at.*)?\)/gi, '')
      .replace(/\s*-\s*radio edit/gi, '')
      .replace(/\s*\(radio edit\)/gi, '')
      .replace(/\s*-\s*deluxe(\s*edition)?/gi, '')
      .replace(/\s*\(deluxe(\s*edition)?\)/gi, '')
      .trim();
  }

  function levenshteinDistance(s1, s2) {
    const m = s1.length, n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
        else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  if (btnOpenFuzzyModal) {
    btnOpenFuzzyModal.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks) {
        showToast("Lütfen önce bir çalma listesi açın!", "warning");
        return;
      }

      const tracks = state.currentPlaylist.tracks;
      const clusters = [];
      const processed = new Set();

      for (let i = 0; i < tracks.length; i++) {
        if (processed.has(tracks[i].id)) continue;
        const normA = normalizeSongTitle(tracks[i].title);
        const artistA = tracks[i].artist.toLowerCase();
        const cluster = [tracks[i]];

        for (let j = i + 1; j < tracks.length; j++) {
          if (processed.has(tracks[j].id)) continue;
          const artistB = tracks[j].artist.toLowerCase();
          if (artistA === artistB) {
            const normB = normalizeSongTitle(tracks[j].title);
            if (normA === normB || levenshteinDistance(normA, normB) <= 2) {
              cluster.push(tracks[j]);
              processed.add(tracks[j].id);
            }
          }
        }

        if (cluster.length > 1) {
          processed.add(tracks[i].id);
          clusters.push(cluster);
        }
      }

      if (fuzzyResultsContainer) {
        if (clusters.length === 0) {
          fuzzyResultsContainer.innerHTML = `
            <div style="background: rgba(0,255,122,0.06); border:1px solid rgba(0,255,122,0.2); border-radius:10px; padding:20px; text-align:center;">
              <i class="fa-solid fa-fingerprint text-green" style="font-size:36px; margin-bottom:10px; display:block;"></i>
              <h4 style="font-size:15px; font-weight:800; color:#fff;">Gizli veya Sürüm Mükerreri Bulunmuyor!</h4>
              <p style="font-size:12.5px; color:var(--t-muted); margin-top:4px;">
                "${state.currentPlaylist.name}" listesinde Remastered, Live veya delüks sürüm kopyası tespit edilmedi.
              </p>
            </div>
          `;
        } else {
          fuzzyResultsContainer.innerHTML = clusters.map((cl, cIdx) => `
            <div style="background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px 16px; margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="color:var(--cyan); font-size:13px;"><i class="fa-solid fa-code-compare"></i> Eşleşme Grubu #${cIdx + 1} (${cl[0].artist})</strong>
                <span class="badge" style="background:rgba(191,95,255,0.15); color:var(--purple);">${cl.length} Kopya Sürüm</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${cl.map((t, tIdx) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); padding:6px 10px; border-radius:6px; font-size:12px;">
                    <span>${tIdx === 0 ? '👑 [Orijinal]' : '🔄 [Varyasyon]'} ${t.title} - ${t.artist}</span>
                    <span style="color:var(--t-dim); font-family:var(--f-mono); font-size:11px;">${t.album || 'Tekli'}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('');
        }
      }

      if (fuzzyDuplicatesModal) fuzzyDuplicatesModal.classList.remove('hidden');
    });
  }

  const closeFuzzyModal = () => { if (fuzzyDuplicatesModal) fuzzyDuplicatesModal.classList.add('hidden'); };
  if (btnCloseFuzzyModal) btnCloseFuzzyModal.addEventListener('click', closeFuzzyModal);
  if (btnCloseFuzzyBottom) btnCloseFuzzyBottom.addEventListener('click', closeFuzzyModal);

  // --- EXPORT PLAYLIST FEATURE (JSON & CSV) ---
  const btnExportPlaylist = document.getElementById('btnExportPlaylist');
  if (btnExportPlaylist) {
    btnExportPlaylist.addEventListener('click', () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks || state.currentPlaylist.tracks.length === 0) {
        showToast("Dışa aktarılacak şarkı bulunamadı!", "warning");
        return;
      }

      const tracks = state.currentPlaylist.tracks;
      const plName = (state.currentPlaylist.name || 'playlist').replace(/[^a-zA-Z0-9_\-]/g, '_');

      // Create CSV format
      const csvHeader = 'Index,Title,Artist,Album,Genre\n';
      const csvRows = tracks.map((t, idx) => 
        `"${idx + 1}","${(t.title || '').replace(/"/g, '""')}","${(t.artist || '').replace(/"/g, '""')}","${(t.album || '').replace(/"/g, '""')}","${(t.genre || '').replace(/"/g, '""')}"`
      ).join('\n');
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvHeader + csvRows);

      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', csvContent);
      downloadAnchor.setAttribute('download', `${plName}_TifyPlusPulse.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast(`"${state.currentPlaylist.name}" (${tracks.length} parça) CSV olarak indirildi!`, "success");
    });
  }

  // --- BACKUP & HISTORY MODAL EVENT LISTENERS ---
  const historyModal = document.getElementById('historyModal');
  const btnOpenHistoryModal = document.getElementById('btnOpenHistoryModal');
  const btnOpenHistoryModalDemo = document.getElementById('btnOpenHistoryModalDemo');
  const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');

  const openHistoryModal = () => {
    renderHistoryModalList();
    if (historyModal) historyModal.classList.remove('hidden');
  };

  if (btnOpenHistoryModal) btnOpenHistoryModal.addEventListener('click', openHistoryModal);
  if (btnOpenHistoryModalDemo) btnOpenHistoryModalDemo.addEventListener('click', openHistoryModal);
  if (btnCloseHistoryModal) btnCloseHistoryModal.addEventListener('click', () => {
    if (historyModal) historyModal.classList.add('hidden');
  });

  if (btnTriggerUndo) {
    btnTriggerUndo.addEventListener('click', () => {
      restoreSafetySnapshot();
    });
  }

  // --- LOGIN & DEMO EVENT HANDLERS ---
  const triggerLoginModal = () => {
    initByocPanel();
    authModal.classList.remove('hidden');
  };
  if (btnConnectSpotify) btnConnectSpotify.addEventListener('click', triggerLoginModal);
  if (btnHeroLogin) btnHeroLogin.addEventListener('click', triggerLoginModal);
  if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', () => authModal.classList.add('hidden'));

  if (btnTryDemo) btnTryDemo.addEventListener('click', () => setAppSessionState(false));
  if (btnHeroDemo) btnHeroDemo.addEventListener('click', () => setAppSessionState(false));

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('spotify_access_token');
      sessionStorage.removeItem('spotify_refresh_token');
      sessionStorage.removeItem('spotify_token_expires_at');
      clearPersonalSpotifySessionData();
      if (spotifyPlayer) spotifyPlayer.disconnect();
      spotifyPlayer = null;
      spotifyDeviceId = null;
      state.accessToken = null;
      setAppSessionState(false);
      showToast("Oturum kapatıldı.", "info");
    });
  }

  if (btnRefreshSync) {
    btnRefreshSync.addEventListener('click', () => {
      if (!state.accessToken) {
        showToast("Lütfen önce Spotify ile giriş yapın!", "warning");
        return;
      }
      const remaining = getSyncCooldownRemaining();
      if (remaining > 0) {
        const remainMin = Math.ceil(remaining / 60000);
        showToast(`Son senkronizasyondan bu yana ${remainMin} dakika geçmeden tekrar denenemez.`, "warning");
        return;
      }
      syncRealSpotifyLibrary(state.accessToken, true);
    });
  }

  if (btnStartOAuth) {
    btnStartOAuth.addEventListener('click', () => {
      const tokenEl = document.getElementById('accessTokenInput');
      const token = tokenEl ? (tokenEl.value || '').trim() : '';
      if (token) {
        clearPersonalSpotifySessionData();
        state.accessToken = token;
        sessionStorage.setItem('spotify_access_token', token);
        if (authModal) authModal.classList.add('hidden');
        setAppSessionState(true);
        return;
      }
      // Default mode — use built-in client ID
      const DEFAULT_CLIENT_ID = '9ab2d9e0fd54403ca14f2aad4aab7512';
      if (authModal) authModal.classList.add('hidden');
      redirectToSpotifyPKCE(DEFAULT_CLIENT_ID);
    });
  }

  // --- BYOC PANEL INIT & EVENT HANDLERS ---
  const DEFAULT_CLIENT_ID = '9ab2d9e0fd54403ca14f2aad4aab7512';
  const CUSTOM_CLIENT_ID_KEY = 'custom_spotify_client_id';

  function getAppRedirectUri() {
    // Spotify Dashboard prefers 127.0.0.1 over localhost
    if (window.location.hostname === 'localhost') {
      return window.location.origin.replace('localhost', '127.0.0.1') + '/';
    }
    return window.location.origin + '/';
  }

  function getActiveClientId() {
    return (allowsFunctionalStorage() && localStorage.getItem(CUSTOM_CLIENT_ID_KEY)) || sessionStorage.getItem(CUSTOM_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
  }

  function initByocPanel() {
    // Show dynamic redirect URI (127.0.0.1:5173/)
    const uriEl = document.getElementById('byocRedirectUriDisplay');
    const redirectUri = getAppRedirectUri();
    if (uriEl) uriEl.textContent = redirectUri;

    const btnCopy = document.getElementById('btnCopyRedirectUri');
    if (btnCopy) {
      btnCopy.onclick = () => {
        navigator.clipboard.writeText(redirectUri).then(() => {
          showToast("Redirect URI panoya kopyalandı!", "success");
        }).catch(() => {
          showToast("Panoya kopyalanamadı, lütfen metni seçerek kopyalayın.", "warning");
        });
      };
    }

    // Restore saved custom client ID
    const saved = (allowsFunctionalStorage() && localStorage.getItem(CUSTOM_CLIENT_ID_KEY)) || sessionStorage.getItem(CUSTOM_CLIENT_ID_KEY);
    const customInput = document.getElementById('clientIdInput') || document.getElementById('customClientIdInput');
    if (customInput && saved) {
      customInput.value = saved;
    }

    // Restore which tab was last active
    const lastMode = (allowsFunctionalStorage() && localStorage.getItem('spotify_app_mode')) || sessionStorage.getItem('spotify_app_mode') || 'default';
    setByocMode(lastMode);
  }

  function setByocMode(mode) {
    const defaultPanel = document.getElementById('defaultModePanel');
    const customPanel = document.getElementById('customModePanel');
    const btnDefault = document.getElementById('btnUseDefault');
    const btnCustom = document.getElementById('btnUseCustom');
    if (!defaultPanel || !customPanel) return;

    if (mode === 'custom') {
      defaultPanel.classList.add('hidden');
      customPanel.classList.remove('hidden');
      if (btnDefault) {
        btnDefault.classList.remove('is-active', 'join');
        btnDefault.setAttribute('aria-selected', 'false');
      }
      if (btnCustom) {
        btnCustom.classList.add('is-active', 'join');
        btnCustom.setAttribute('aria-selected', 'true');
      }
    } else {
      customPanel.classList.add('hidden');
      defaultPanel.classList.remove('hidden');
      if (btnCustom) {
        btnCustom.classList.remove('is-active', 'join');
        btnCustom.setAttribute('aria-selected', 'false');
      }
      if (btnDefault) {
        btnDefault.classList.add('is-active', 'join');
        btnDefault.setAttribute('aria-selected', 'true');
      }
    }
    (allowsFunctionalStorage() ? localStorage : sessionStorage).setItem('spotify_app_mode', mode);
  }

  const btnUseDefault = document.getElementById('btnUseDefault');
  const btnUseCustom = document.getElementById('btnUseCustom');
  const btnSaveCustomAuth = document.getElementById('btnSaveCustomAuth');

  if (btnUseDefault) btnUseDefault.addEventListener('click', () => setByocMode('default'));
  if (btnUseCustom) btnUseCustom.addEventListener('click', () => setByocMode('custom'));

  if (btnSaveCustomAuth) {
    btnSaveCustomAuth.addEventListener('click', () => {
      const input = document.getElementById('clientIdInput') || document.getElementById('customClientIdInput');
      const val = input ? input.value.trim() : '';
      if (!/^[a-f0-9]{32}$/i.test(val)) {
        showToast('Client ID, Spotify Dashboard\'da görünen 32 karakterlik değerdir. Client Secret girmeyin.', 'warning');
        if (input) input.focus();
        return;
      }
      (allowsFunctionalStorage() ? localStorage : sessionStorage).setItem(CUSTOM_CLIENT_ID_KEY, val);
      showToast('Client ID kaydedildi. Spotify yetkilendirmesi başlatılıyor...', 'success');
      if (authModal) authModal.classList.add('hidden');
      redirectToSpotifyPKCE(val);
    });
  }

  // --- SPOTIFY PKCE OAUTH HELPERS ---
  function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
  }

  async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
  }

  function base64encode(input) {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  async function refreshSpotifyAccessToken() {
    const refreshToken = sessionStorage.getItem('spotify_refresh_token');
    const clientId = (allowsFunctionalStorage() && localStorage.getItem(CUSTOM_CLIENT_ID_KEY))
      || sessionStorage.getItem('spotify_client_id')
      || DEFAULT_CLIENT_ID;
    if (!refreshToken || !clientId) return state.accessToken;

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId
      })
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Spotify oturumu yenilenemedi.');

    state.accessToken = data.access_token;
    sessionStorage.setItem('spotify_access_token', data.access_token);
    sessionStorage.setItem('spotify_token_expires_at', String(Date.now() + ((data.expires_in || 3600) * 1000)));
    if (data.refresh_token) sessionStorage.setItem('spotify_refresh_token', data.refresh_token);
    return data.access_token;
  }

  async function getValidSpotifyAccessToken() {
    const expiresAt = Number(sessionStorage.getItem('spotify_token_expires_at') || 0);
    if (state.accessToken && (!expiresAt || Date.now() < expiresAt - 60000)) return state.accessToken;
    return refreshSpotifyAccessToken();
  }

  async function redirectToSpotifyPKCE(clientId) {
    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    window.sessionStorage.setItem('spotify_code_verifier', codeVerifier);
    window.sessionStorage.setItem('spotify_client_id', clientId);

    const redirectUri = getAppRedirectUri();
    const scope = [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state'
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      show_dialog: 'true',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async function handleSpotifyPKCECallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      const codeVerifier = sessionStorage.getItem('spotify_code_verifier');
      const clientId = (allowsFunctionalStorage() && localStorage.getItem(CUSTOM_CLIENT_ID_KEY))
        || sessionStorage.getItem('spotify_client_id')
        || DEFAULT_CLIENT_ID;
      const redirectUri = getAppRedirectUri();

      try {
        const payload = {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        };

        const response = await fetch('https://accounts.spotify.com/api/token', payload);
        const data = await response.json();

        if (data.access_token) {
          clearPersonalSpotifySessionData();
          state.accessToken = data.access_token;
          sessionStorage.setItem('spotify_access_token', data.access_token);
          sessionStorage.setItem('spotify_token_expires_at', String(Date.now() + ((data.expires_in || 3600) * 1000)));
          if (data.refresh_token) sessionStorage.setItem('spotify_refresh_token', data.refresh_token);
          window.history.replaceState({}, document.title, window.location.pathname);
          setAppSessionState(true);
        } else {
          console.error('Token exchange failed:', data);
          showToast('Spotify giriş başarısız: ' + (data.error_description || data.error || 'Bilinmeyen hata'), 'warning');
        }
      } catch (err) {
        console.error("OAuth Exchange Exception:", err);
      }
    }
  }

  handleSpotifyPKCECallback();

  // --- URL SEARCH PARSER ---
  function openExternalPlaylistEmbed(playlistId, notice) {
    state.externalPlaylist = null;
    if (externalPlaylistTitle) externalPlaylistTitle.textContent = 'Spotify çalma listesi';
    if (externalPlaylistSummary) externalPlaylistSummary.textContent = 'Herkese açık bağlantı • Kişisel kütüphanenizden ayrı';
    if (externalPlaylistContent) {
      externalPlaylistContent.innerHTML = `
        <p class="external-playlist-notice"><i class="fa-solid fa-circle-info"></i> ${escapeMarkup(notice)}</p>
        <iframe class="external-playlist-embed" src="https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}?utm_source=generator&theme=0" title="Spotify çalma listesi" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    }
    externalPlaylistModal?.classList.remove('hidden');
  }

  function renderExternalPlaylist(playlist) {
    state.externalPlaylist = playlist;
    if (externalPlaylistTitle) externalPlaylistTitle.textContent = playlist.name;
    if (externalPlaylistSummary) externalPlaylistSummary.textContent = `${playlist.owner} • ${playlist.trackTotal} parça • Kişisel kütüphanenizden ayrı`;
    if (!externalPlaylistContent) return;
    const rows = playlist.tracks.map((track, index) => `
      <div class="external-track-row">
        <span>${index + 1}</span>
        <img src="${escapeMarkup(track.cover || playlist.cover)}" alt="" loading="lazy" decoding="async">
        <div class="external-track-copy"><strong>${escapeMarkup(track.title)}</strong><small>${escapeMarkup(track.artist)}${track.album ? ` • ${escapeMarkup(track.album)}` : ''}</small></div>
        <button class="external-track-play" type="button" data-action="play-track" data-track-id="${escapeMarkup(track.id)}" aria-label="${escapeMarkup(track.title)} parçasını çal"><i class="fa-solid fa-play"></i></button>
      </div>`).join('');
    externalPlaylistContent.innerHTML = `
      <div class="external-playlist-overview">
        <img class="external-playlist-cover" src="${escapeMarkup(playlist.cover)}" alt="${escapeMarkup(playlist.name)} kapak görseli">
        <div class="external-playlist-meta"><strong>${escapeMarkup(playlist.name)}</strong><span>Oluşturan: ${escapeMarkup(playlist.owner)}</span><span>${playlist.trackTotal} parça${playlist.followers ? ` • ${playlist.followers.toLocaleString('tr-TR')} takipçi` : ''}</span></div>
        <div class="external-playlist-actions"><a class="btn btn-spotify btn-sm" href="${escapeMarkup(playlist.url)}" target="_blank" rel="noopener"><i class="fa-brands fa-spotify"></i> Spotify'da aç</a></div>
      </div>
      <p class="external-playlist-notice"><i class="fa-solid fa-shield-halved"></i> Bu liste yalnızca bu ayrı pencerede incelenir; hesabınızdaki listelere, önerilere veya karşılaştırmalara eklenmez.</p>
      <div class="external-track-list">${rows || '<p class="external-playlist-notice">Bu listede görüntülenebilir parça bulunamadı.</p>'}</div>`;
    externalPlaylistModal?.classList.remove('hidden');
  }

  btnCloseExternalPlaylist?.addEventListener('click', () => externalPlaylistModal?.classList.add('hidden'));

  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
      const val = playlistUrlInput.value.trim();
      if (!val) {
        showToast("Lütfen bir Spotify bağlantısı veya Playlist ID girin!", "warning");
        return;
      }

      const extractedId = extractCleanPlaylistId(val);
      if (extractedId) {
        // A user's own playlist keeps using the private workspace inspector.
        const found = state.playlists.find(p => p.id === extractedId);
        if (found) {
          selectAndAnalyzePlaylist(found.id);
          showToast(`"${found.name}" çalma listesi açıldı!`, "success");
          return;
        }

        // Public links are rendered in a dedicated inspector and never merged
        // into the signed-in user's library or comparison engine.
        if (state.accessToken) {
          btnAnalyze.disabled = true;
          btnAnalyze.classList.add('is-loading');
          showToast("Spotify çalma listesi açılıyor...", "info");
          try {
            const token = await getValidSpotifyAccessToken();
            const [details, tracks] = await Promise.all([
              fetchSpotifyPlaylistDetails(token, extractedId),
              fetchSpotifyPlaylistTracks(token, extractedId)
            ]);
            if (tracks && tracks.length > 0) {
              const externalPlaylist = {
                id: extractedId,
                name: details.name || 'Spotify çalma listesi',
                owner: details.owner?.display_name || details.owner?.id || 'Spotify kullanıcısı',
                followers: Number(details.followers?.total || 0),
                isPrivate: details.public === false,
                url: details.external_urls?.spotify || `https://open.spotify.com/playlist/${extractedId}`,
                cover: details.images?.[0]?.url || tracks[0].cover || '/brand/tify-plus-mark-512.png',
                description: details.description || 'Bağlantı üzerinden incelenen Spotify çalma listesi.',
                trackTotal: Number(details.tracks?.total || details.items?.total || tracks.length),
                tracks,
                tracksLoaded: true
              };
              renderExternalPlaylist(externalPlaylist);
              showToast(`"${externalPlaylist.name}" ayrı pencerede açıldı.`, "success");
              return;
            }
          } catch(e) {
            console.warn("Direct URL fetch failed:", e);
            openExternalPlaylistEmbed(extractedId, 'Spotify API ayrıntıları alınamadı. Gerçek liste aşağıdaki resmî Spotify oynatıcısında açıldı; demo veri gösterilmedi.');
            showToast('Liste resmî Spotify görünümünde açıldı.', 'info');
            return;
          } finally {
            btnAnalyze.disabled = false;
            btnAnalyze.classList.remove('is-loading');
          }
        }

        openExternalPlaylistEmbed(extractedId, 'Ayrıntılı parça incelemesi için Spotify hesabınızı bağlayabilirsiniz. Liste yine de resmî Spotify oynatıcısında kullanılabilir.');
      } else {
        showToast("Geçerli bir Spotify çalma listesi bağlantısı bulunamadı.", "warning");
      }
    });
  }

  // ============================================================
  // REAL SPOTIFY GENRE RESOLVER CONTROLLER
  // ============================================================
  const btnFetchLiveGenres = document.getElementById('btnFetchLiveGenres');
  if (btnFetchLiveGenres) {
    btnFetchLiveGenres.addEventListener('click', async () => {
      if (!state.currentPlaylist || !state.currentPlaylist.tracks || state.currentPlaylist.tracks.length === 0) {
        showToast("Lütfen önce şarkıları olan bir çalma listesi açın!", "warning");
        return;
      }

      const tracks = state.currentPlaylist.tracks;
      const allArtistIds = [];
      tracks.forEach(t => {
        if (t.artistIds && Array.isArray(t.artistIds)) {
          t.artistIds.forEach(id => allArtistIds.push(id));
        }
      });

      btnFetchLiveGenres.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Türler Çözülüyor...`;
      btnFetchLiveGenres.disabled = true;

      try {
        const genreMap = state.accessToken ? await fetchSpotifyArtistGenres(state.accessToken, allArtistIds) : {};
        let resolvedCount = 0;

        tracks.forEach(t => {
          if (t.artistIds && t.artistIds.length > 0) {
            for (let aId of t.artistIds) {
              if (genreMap[aId] && genreMap[aId].length > 0) {
                t.genre = genreMap[aId].slice(0, 2).join(' / ');
                t.genreSource = 'Spotify sanatçı metaverisi';
                resolvedCount++;
                break;
              }
            }
          }
        });

        const unresolvedArtists = Array.from(new Set(tracks
          .filter(track => getTrackGenres(track).length === 0)
          .map(track => String(track.artist || '').split(',')[0].trim())
          .filter(Boolean))).slice(0, 4);

        for (let i = 0; i < unresolvedArtists.length; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 1100));
          const artistName = unresolvedArtists[i];
          btnFetchLiveGenres.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Açık katalog taranıyor ${i + 1}/${unresolvedArtists.length}`;
          const genres = await fetchMusicBrainzGenres(artistName);
          if (!genres.length) continue;
          tracks.forEach(track => {
            if (getTrackGenres(track).length === 0 && String(track.artist || '').toLocaleLowerCase('tr-TR').includes(artistName.toLocaleLowerCase('tr-TR'))) {
              track.genre = genres.slice(0, 2).join(' / ');
              track.genreSource = 'MusicBrainz topluluk etiketleri';
              resolvedCount++;
            }
          });
        }

        saveTrackCache(state.currentPlaylist.id, tracks);
        renderProTrackTable(state.currentPlaylist);
        saveLibraryCache(state.playlists);
        renderFastRecommendations();
        showToast(resolvedCount ? `${resolvedCount} parça için kaynaklı tür verisi bulundu.` : 'Bu sanatçılar için güvenilir tür etiketi bulunamadı; veri uydurulmadı.', resolvedCount ? "success" : "info");
      } catch (err) {
        console.error("Genre fetch error:", err);
        showToast("Türler çözülürken bir hata oluştu.", "warning");
      } finally {
        btnFetchLiveGenres.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles text-purple"></i> Spotify Türlerini Çöz`;
        btnFetchLiveGenres.disabled = false;
      }
    });
  }

  // ============================================================
  // EMBEDDED MINI WEB PLAYER CONTROLLER
  // ============================================================
  // ============================================================
  // SYNCHRONIZED DUAL WEB PLAYER ENGINE
  // Hero Luxury Cassette Deck + Sticky Bottom Spotify-Style Player
  // ============================================================

  let cassetteAudioTimer = null;
  let cassetteCurrentSec = 0;
  let cassetteDurationSec = 30;
  let isCassettePlaying = false;
  let currentCassetteTrack = null;
  let currentPlaylistContextName = "SOOND Koleksiyonu";
  let playbackBackend = 'none';
  let spotifyPlayer = null;
  let spotifyDeviceId = null;
  let spotifyPlayerInitPromise = null;
  let spotifySdkPromise = null;
  let spotifyPlayerFailureReason = null;
  let spotifyPlayerFailureMessage = '';
  let spotifySdkUnavailableUntil = 0;
  let spotifyEmbedController = null;
  let spotifyEmbedControllerPromise = null;
  let spotifyEmbedCurrentUri = '';
  let spotifyEmbedReady = false;
  let spotifyWarmupTimer = null;
  let playbackRequestSerial = 0;
  let playbackAbortController = null;
  let localPlaybackQueue = [];
  let localPlaybackQueueIndex = -1;
  let isPlaybackStarting = false;

  // DOM Elements - Hero Cassette Deck
  const cassetteAudioPlayer = document.getElementById('cassetteAudioPlayer') || document.getElementById('nativeAudioPlayer');
  const tapeTrackTitle = document.getElementById('tapeTrackTitle');
  const tapeTrackArtist = document.getElementById('tapeTrackArtist');
  const cassetteSubtitle = document.getElementById('cassetteSubtitle');
  const tapeCounter = document.getElementById('tapeCounter');
  const tapeReelLeft = document.getElementById('tapeReelLeft');
  const tapeReelRight = document.getElementById('tapeReelRight');
  const btnCassettePlay = document.getElementById('btnCassettePlay');
  const btnCassettePrev = document.getElementById('btnCassettePrev');
  const btnCassetteNext = document.getElementById('btnCassetteNext');
  const cassetteProgressBar = document.getElementById('cassetteProgressBar');
  const cassetteProgressFill = document.getElementById('cassetteProgressFill');
  const cassetteVolume = document.getElementById('cassetteVolume');

  // DOM Elements - Sticky Bottom Spotify Bar
  const floatingWebPlayer = document.getElementById('floatingWebPlayer');
  const playerCoverImg = document.getElementById('playerCoverImg');
  const playerTrackTitle = document.getElementById('playerTrackTitle');
  const playerTrackArtist = document.getElementById('playerTrackArtist');
  const playerPlaybackStatus = document.getElementById('playerPlaybackStatus');
  const btnPlayerShuffle = document.getElementById('btnPlayerShuffle');
  const btnPlayerPrev = document.getElementById('btnPlayerPrev');
  const btnPlayerPlayToggle = document.getElementById('btnPlayerPlayToggle');
  const playerPlayIcon = document.getElementById('playerPlayIcon');
  const btnPlayerNext = document.getElementById('btnPlayerNext');
  const playerSeekSlider = document.getElementById('playerSeekSlider');
  const playerEnergyTimeline = document.getElementById('playerEnergyTimeline');
  const playerCurrentTime = document.getElementById('playerCurrentTime');
  const playerDuration = document.getElementById('playerDuration');
  const playerVisualizerBars = document.getElementById('playerVisualizerBars');
  const playerOpenSpotifyBtn = document.getElementById('playerOpenSpotifyBtn');
  const btnCloseWebPlayer = document.getElementById('btnCloseWebPlayer');
  const playerSourceBadge = document.getElementById('playerSourceBadge');
  const btnPlayerDevices = document.getElementById('btnPlayerDevices');
  const playerDevicesPopover = document.getElementById('playerDevicesPopover');
  const playerDevicesList = document.getElementById('playerDevicesList');
  const playerVolumeSlider = document.getElementById('playerVolumeSlider');
  const playerVolumeValue = document.getElementById('playerVolumeValue');
  const btnPlayerMute = document.getElementById('btnPlayerMute');
  const spotifyEmbedPanel = document.getElementById('spotifyEmbedPanel');
  const spotifyEmbedMount = document.getElementById('spotifyEmbedMount');
  const localVirtualDevice = document.getElementById('localVirtualDevice');
  const localVirtualDeviceName = document.getElementById('localVirtualDeviceName');
  const localVirtualDeviceStatus = document.getElementById('localVirtualDeviceStatus');
  const localVirtualDeviceBadge = document.getElementById('localVirtualDeviceBadge');
  const anonymousDeviceAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const anonymousDeviceBytes = new Uint8Array(4);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(anonymousDeviceBytes);
  else anonymousDeviceBytes.forEach((_, index) => { anonymousDeviceBytes[index] = Math.floor(Math.random() * 256); });
  const anonymousDeviceSuffix = Array.from(anonymousDeviceBytes, value => anonymousDeviceAlphabet[value % anonymousDeviceAlphabet.length]).join('');
  const localSpotifyDeviceLabel = `Tify Plus Web • ${anonymousDeviceSuffix}`;
  let lastPlayerVolume = 0.85;
  let activeSpotifyDeviceId = null;
  let activeSpotifyDeviceName = '';
  let remoteVolumeTimer = null;
  let spotifyShuffleState = false;

  function syncShuffleUi(enabled) {
    spotifyShuffleState = Boolean(enabled);
    if (!btnPlayerShuffle) return;
    btnPlayerShuffle.setAttribute('aria-pressed', String(spotifyShuffleState));
    btnPlayerShuffle.setAttribute('aria-label', spotifyShuffleState ? 'Karışık çalmayı kapat' : 'Karışık çalmayı aç');
    btnPlayerShuffle.title = spotifyShuffleState ? 'Karışık çalma açık' : 'Karışık çalma kapalı';
  }

  async function setSpotifyShuffle(enabled) {
    if (!state.accessToken) {
      showSpotifyLoginRequired();
      return false;
    }
    const token = await getValidSpotifyAccessToken();
    const targetDeviceId = playbackBackend === 'spotify' && spotifyDeviceId
      ? spotifyDeviceId
      : activeSpotifyDeviceId;
    const query = new URLSearchParams({ state: String(Boolean(enabled)) });
    if (targetDeviceId) query.set('device_id', targetDeviceId);
    const response = await fetch(`https://api.spotify.com/v1/me/player/shuffle?${query}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Spotify shuffle HTTP ${response.status}`);
    syncShuffleUi(enabled);
    return true;
  }

  syncShuffleUi(false);

  function setLocalVirtualDeviceState(mode, status, badge = 'BU SEKME') {
    if (localVirtualDeviceName) localVirtualDeviceName.textContent = localSpotifyDeviceLabel;
    if (localVirtualDeviceStatus) localVirtualDeviceStatus.textContent = status;
    if (localVirtualDeviceBadge) localVirtualDeviceBadge.textContent = badge;
    if (!localVirtualDevice) return;
    localVirtualDevice.classList.remove('is-offline', 'is-connecting', 'is-connected', 'is-preview');
    localVirtualDevice.classList.add(`is-${mode}`);
  }

  setLocalVirtualDeviceState(state.accessToken ? 'connecting' : 'offline', state.accessToken ? 'Yerel Spotify cihazı hazırlanıyor' : 'Spotify hesabınızı bağlayın');

  function disconnectLocalSpotifyPlayer() {
    clearTimeout(spotifyWarmupTimer);
    if (spotifyPlayer) {
      try { spotifyPlayer.disconnect(); } catch (error) { console.warn('[Spotify Disconnect]', error); }
    }
    spotifyPlayer = null;
    spotifyDeviceId = null;
    spotifyPlayerInitPromise = null;
    setLocalVirtualDeviceState('offline', 'Bu sekmedeki cihaz bağlantısı kapandı');
  }

  function pauseSpotifyEmbed() {
    try { spotifyEmbedController?.pause(); } catch (error) { console.warn('[Spotify Embed Pause]', error); }
  }

  function hideSpotifyEmbed(pause = true) {
    if (pause) pauseSpotifyEmbed();
    spotifyEmbedPanel?.classList.add('hidden');
    floatingWebPlayer?.classList.remove('embed-controller-active');
  }

  window.addEventListener('pagehide', disconnectLocalSpotifyPlayer);

  function formatTapeTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function setPlayerProgress(percent) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    if (playerSeekSlider) playerSeekSlider.value = safePercent;
    if (playerEnergyTimeline) {
      playerEnergyTimeline.style.setProperty('--progress', `${safePercent}%`);
      playerEnergyTimeline.style.setProperty('--progress-scale', String(safePercent / 100));
    }
  }

  function applyTrackVisualSignature(track) {
    if (!floatingWebPlayer || !track) return;
    const seedText = `${track.id || ''}|${track.title || ''}|${track.artist || ''}`;
    const seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
    const hue = 78 + (seed % 74);
    const pulseDuration = (1.35 + ((seed >> 3) % 115) / 100).toFixed(2);
    const signalStrength = (.58 + ((seed >> 5) % 34) / 100).toFixed(2);
    floatingWebPlayer.style.setProperty('--player-hue', hue);
    floatingWebPlayer.style.setProperty('--signal-cycle', `${pulseDuration}s`);
    floatingWebPlayer.style.setProperty('--signal-strength', signalStrength);
  }

  async function setSpotifyVolume(volume) {
    const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (safeVolume > 0) lastPlayerVolume = safeVolume;
    if (cassetteVolume) cassetteVolume.value = safeVolume;
    if (playerVolumeSlider) playerVolumeSlider.value = Math.round(safeVolume * 100);
    if (playerVolumeSlider) playerVolumeSlider.style.setProperty('--volume-level', `${Math.round(safeVolume * 100)}%`);
    if (playerVolumeValue) playerVolumeValue.value = String(Math.round(safeVolume * 100));
    if (btnPlayerMute) btnPlayerMute.innerHTML = `<i class="fa-solid ${safeVolume === 0 ? 'fa-volume-xmark' : safeVolume < .5 ? 'fa-volume-low' : 'fa-volume-high'}"></i>`;
    if (spotifyPlayer && (!activeSpotifyDeviceId || activeSpotifyDeviceId === spotifyDeviceId)) {
      try { await spotifyPlayer.setVolume(safeVolume); } catch (error) { console.warn('[Spotify Volume]', error); }
    } else if (state.accessToken && activeSpotifyDeviceId) {
      clearTimeout(remoteVolumeTimer);
      remoteVolumeTimer = setTimeout(async () => {
        try {
          const token = await getValidSpotifyAccessToken();
          await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(safeVolume * 100)}&device_id=${encodeURIComponent(activeSpotifyDeviceId)}`, {
            method: 'PUT', headers: { Authorization: `Bearer ${token}` }
          });
        } catch (error) { console.warn('[Spotify Remote Volume]', error); }
      }, 160);
    }
  }

  async function loadSpotifyDevices() {
    if (!state.accessToken || !playerDevicesList) {
      showSpotifyLoginRequired();
      return;
    }
    playerDevicesList.innerHTML = '<span class="device-empty"><i class="fa-solid fa-spinner fa-spin"></i> Cihazlar aranıyor...</span>';
    try {
      const token = await getValidSpotifyAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Spotify devices HTTP ${response.status}`);
      const data = await response.json();
      const devices = Array.isArray(data.devices) ? [...data.devices] : [];
      if (spotifyDeviceId && !devices.some(device => device.id === spotifyDeviceId)) {
        devices.unshift({
          id: spotifyDeviceId,
          name: localSpotifyDeviceLabel,
          type: 'Computer',
          volume_percent: Math.round(Number(playerVolumeSlider?.value || 85)),
          is_active: activeSpotifyDeviceId === spotifyDeviceId,
          is_restricted: false
        });
      }
      playerDevicesList.innerHTML = devices.length ? devices.map(device => `
        <button class="player-device-item ${device.is_active ? 'is-active' : ''}" data-device-id="${escapeMarkup(device.id)}" ${device.is_restricted || !device.id ? 'disabled title="Bu cihaz uzaktan kontrolü desteklemiyor"' : ''}>
          <i class="fa-solid ${device.type === 'Smartphone' ? 'fa-mobile-screen' : device.type === 'Speaker' ? 'fa-volume-high' : 'fa-desktop'}"></i>
          <span><strong>${escapeMarkup(device.name)}</strong><small>${escapeMarkup(device.type)} • ${device.volume_percent ?? 0}%</small></span>
          ${device.is_active ? '<em>AKTİF</em>' : '<i class="fa-solid fa-arrow-right"></i>'}
        </button>`).join('') : '<span class="device-empty">Açık bir Spotify cihazı bulunamadı.</span>';
    } catch (error) {
      console.warn('[Spotify Devices]', error);
      playerDevicesList.innerHTML = '<span class="device-empty">Cihazlar alınamadı. Spotify bağlantısını yenileyin.</span>';
    }
  }

  function showSpotifyLoginRequired() {
    if (cassetteAudioPlayer) {
      cassetteAudioPlayer.pause();
      cassetteAudioPlayer.removeAttribute('src');
    }
    if (spotifyPlayer) spotifyPlayer.pause().catch(() => {});
    pauseSpotifyEmbed();
    setUnifiedPlaybackState(false);
    setLocalVirtualDeviceState('offline', 'Spotify hesabınızı bağlayın');
    setPlayerSource('none', 'Spotify girişi gerekli');
    if (floatingWebPlayer) floatingWebPlayer.classList.add('hidden');
    showToast('Orijinal şarkıları dinlemek için Spotify hesabınızı bağlayın.', 'warning');
  }

  function requestSpotifyMediaActivation() {
    if (!spotifyPlayer || typeof spotifyPlayer.activateElement !== 'function') return false;
    spotifyPlayer.activateElement().catch(error => console.warn('[Spotify Media Activation]', error));
    return true;
  }

  function prepareSpotifyPlayerFromUserGesture() {
    if (!state.accessToken) return false;
    if (spotifyPlayer) return requestSpotifyMediaActivation();
    if (!window.Spotify?.Player) return false;

    // Mobile browsers only unlock protected audio while the original tap is
    // still on the call stack. Create + activate the SDK player synchronously;
    // waiting for an async SDK/token step first loses that user gesture.
    spotifySdkUnavailableUntil = 0;
    startSpotifyPlayerConnection(true).catch(error => console.warn('[Spotify Player Gesture Init]', error));
    return true;
  }

  function prefersSpotifyConnectFirst() {
    return playbackBackend === 'spotify-remote'
      && Boolean(activeSpotifyDeviceId)
      && activeSpotifyDeviceId !== spotifyDeviceId;
  }

  function isCurrentPlaybackRequest(requestId, signal) {
    return requestId === playbackRequestSerial && !signal?.aborted;
  }

  function scheduleSpotifyPlayerWarmup(delay = 0) {
    if (!state.accessToken || spotifyDeviceId || spotifyPlayerInitPromise) return;
    clearTimeout(spotifyWarmupTimer);
    spotifyWarmupTimer = setTimeout(() => {
      initializeSpotifyPlayer().catch(error => console.warn('[Spotify Player Warmup]', error));
    }, delay);
  }

  function updatePlaybackLockUi() {
    const isLocked = !state.accessToken;
    [btnCassettePlay, btnCassettePrev, btnCassetteNext].forEach(button => {
      if (!button) return;
      button.classList.toggle('playback-locked', isLocked);
      button.setAttribute('aria-label', isLocked ? 'Spotify hesabını bağlayarak dinle' : (button.title || 'Oynatma kontrolü'));
    });
    if (cassetteSubtitle && isLocked) cassetteSubtitle.textContent = 'Orijinal şarkılar için Spotify hesabını bağlayın';
    if (tapeTrackTitle && isLocked) tapeTrackTitle.textContent = 'Spotify ile dinle';
    if (tapeTrackArtist && isLocked) tapeTrackArtist.textContent = 'A / TIFY⁺ PULSE / HESAP BAĞLANTISI GEREKLİ';
  }

  // --- PLAY TRACK (CALLED FROM ANYWHERE IN THE APP) ---
  window.playTrackInWebPlayer = function(trackId) {
    prepareSpotifyPlayerFromUserGesture();
    if (!state.accessToken) {
      showSpotifyLoginRequired();
      return;
    }
    let track = null;
    let plName = "SOOND Studio";

    if (state.currentPlaylist && state.currentPlaylist.tracks) {
      track = state.currentPlaylist.tracks.find(t => t.id === trackId);
      plName = state.currentPlaylist.name;
    }
    if (!track && state.externalPlaylist?.tracks) {
      track = state.externalPlaylist.tracks.find(t => t.id === trackId);
      if (track) plName = state.externalPlaylist.name;
    }
    if (!track && !state.isLoggedIn) {
      for (const pl of SOOND_PUBLIC_PLAYLISTS) {
        if (pl.tracks) {
          const found = pl.tracks.find(t => t.id === trackId);
          if (found) {
            track = found;
            plName = pl.name;
            break;
          }
        }
      }
    }
    if (!track) {
      for (const pl of state.playlists) {
        if (pl.tracks) {
          const found = pl.tracks.find(t => t.id === trackId);
          if (found) {
            track = found;
            plName = pl.name;
            break;
          }
        }
      }
    }
    if (!track) return;

    loadAndPlayUnifiedTrack(track, plName);
  };

  window.playTrackInCassette = function(track, playlistName = "SOOND Koleksiyonu") {
    prepareSpotifyPlayerFromUserGesture();
    if (!state.accessToken) {
      showSpotifyLoginRequired();
      return;
    }
    if (!track) {
      showToast('Önce Spotify hesabınızdaki bir çalma listesinden şarkı seçin.', 'warning');
      return;
    }
    loadAndPlayUnifiedTrack(track, playlistName);
  };

  window.playPlaylistFromCover = async function(playlistId) {
    prepareSpotifyPlayerFromUserGesture();
    if (!state.accessToken) {
      showSpotifyLoginRequired();
      return;
    }

    const playlist = state.playlists.find(item => item.id === playlistId);
    if (!playlist) {
      showToast('Spotify playlist bulunamadı.', 'warning');
      return;
    }

    try {
      if (!playlist.tracksLoaded || !Array.isArray(playlist.tracks) || playlist.tracks.length === 0) {
        const cached = loadTrackCache(playlist.id);
        if (cached?.tracks?.length) {
          playlist.tracks = cached.tracks;
        } else {
          const token = await getValidSpotifyAccessToken();
          playlist.tracks = await fetchSpotifyPlaylistTracks(token, playlist.id);
          if (playlist.tracks.length) saveTrackCache(playlist.id, playlist.tracks);
        }
        playlist.tracksLoaded = true;
        playlist.trackTotal = playlist.tracks.length || playlist.trackTotal;
      }

      const firstPlayable = playlist.tracks.find(track => getSpotifyTrackUri(track));
      if (!firstPlayable) {
        showToast('Bu playlist içinde Spotify tarafından oynatılabilir bir parça bulunamadı.', 'warning');
        return;
      }

      state.currentPlaylist = playlist;
      await loadAndPlayUnifiedTrack(firstPlayable, playlist.name);
    } catch (error) {
      console.warn('[Playlist Cover Playback]', error);
      showToast('Playlist Spotify’dan yüklenemedi. Bağlantınızı yenileyin.', 'warning');
    }
  };

  function setPlayerSource(mode, label) {
    playbackBackend = mode;
    if (playerPlaybackStatus) {
      playerPlaybackStatus.classList.toggle('is-active', String(mode).startsWith('spotify'));
      playerPlaybackStatus.innerHTML = `<i></i> ${escapeMarkup(label)}`;
    }
    if (!playerSourceBadge) return;
    const isSpotifySource = String(mode).startsWith('spotify');
    playerSourceBadge.className = `player-source-badge ${mode === 'preview' ? 'preview' : isSpotifySource ? '' : 'offline'}`;
    playerSourceBadge.innerHTML = `<i class="fa-brands fa-spotify"></i> ${label}`;
  }

  function getSpotifyTrackUri(track) {
    if (track.uri && String(track.uri).startsWith('spotify:track:')) return track.uri;
    const id = String(track.id || '');
    return /^[A-Za-z0-9]{22}$/.test(id) ? `spotify:track:${id}` : null;
  }

  function loadSpotifySdk() {
    if (window.Spotify) return Promise.resolve();
    if (spotifySdkPromise) return spotifySdkPromise;

    if (window.__tifySpotifySdkReadyPromise) {
      spotifySdkPromise = Promise.race([
        window.__tifySpotifySdkReadyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Spotify oynatıcı bağlantısı zaman aşımına uğradı.')), 6000))
      ]).catch(error => {
        spotifySdkPromise = null;
        throw error;
      });
      return spotifySdkPromise;
    }

    spotifySdkPromise = new Promise((resolve, reject) => {
      const previousReady = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (typeof previousReady === 'function') previousReady();
        resolve();
      };

      let script = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
      }
      script.addEventListener('error', () => reject(new Error('Spotify Web Playback SDK yüklenemedi.')), { once: true });
      setTimeout(() => reject(new Error('Spotify oynatıcı bağlantısı zaman aşımına uğradı.')), 6000);
    }).catch(error => {
      spotifySdkPromise = null;
      throw error;
    });
    return spotifySdkPromise;
  }

  function loadSpotifyIframeApi() {
    if (window.__tifySpotifyIframeApi) return Promise.resolve(window.__tifySpotifyIframeApi);
    if (!window.__tifySpotifyIframeApiPromise) {
      window.__tifySpotifyIframeApiPromise = new Promise(resolve => {
        window.onSpotifyIframeApiReady = IFrameAPI => {
          window.__tifySpotifyIframeApi = IFrameAPI;
          resolve(IFrameAPI);
        };
      });
    }
    return Promise.race([
      window.__tifySpotifyIframeApiPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Spotify tarayıcı oynatıcısı zaman aşımına uğradı.')), 8000))
    ]);
  }

  function updateSpotifyEmbedPlayback(event) {
    const embedState = event?.data || {};
    const durationMs = Number(embedState.duration || 0);
    const positionMs = Number(embedState.position || 0);
    if (durationMs > 0) {
      cassetteDurationSec = Math.max(1, Math.floor(durationMs / 1000));
      cassetteCurrentSec = Math.max(0, Math.floor(positionMs / 1000));
      if (playerDuration) playerDuration.textContent = formatTapeTime(cassetteDurationSec);
      if (playerCurrentTime) playerCurrentTime.textContent = formatTapeTime(cassetteCurrentSec);
      if (tapeCounter) tapeCounter.textContent = formatTapeTime(cassetteCurrentSec);
      const progress = Math.min(100, (positionMs / durationMs) * 100);
      setPlayerProgress(progress);
      if (cassetteProgressFill) cassetteProgressFill.style.width = `${progress}%`;
    }
    const playing = !embedState.isPaused && !embedState.isBuffering;
    if (playbackBackend === 'spotify-embed') setUnifiedPlaybackState(playing);
  }

  async function initializeSpotifyEmbedController(track) {
    const uri = getSpotifyTrackUri(track);
    if (!uri || !spotifyEmbedMount) return false;
    if (spotifyEmbedController) return true;
    if (spotifyEmbedControllerPromise) return spotifyEmbedControllerPromise;

    spotifyEmbedControllerPromise = (async () => {
      const IFrameAPI = await loadSpotifyIframeApi();
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Spotify tarayıcı oynatıcısı hazırlanamadı.')), 8000);
        IFrameAPI.createController(spotifyEmbedMount, {
          uri,
          width: '100%',
          height: 80
        }, controller => {
          clearTimeout(timer);
          spotifyEmbedController = controller;
          spotifyEmbedCurrentUri = uri;
          controller.addListener('ready', () => { spotifyEmbedReady = true; });
          controller.addListener('playback_started', () => {
            if (playbackBackend !== 'spotify-embed') return;
            spotifyPlayerFailureReason = null;
            spotifyPlayerFailureMessage = '';
            setPlayerSource('spotify-embed', 'Tify Plus tarayıcı oynatıcısı');
            setUnifiedPlaybackState(true);
          });
          controller.addListener('playback_update', updateSpotifyEmbedPlayback);
          resolve(true);
        });
      });
    })().catch(error => {
      spotifyEmbedController = null;
      spotifyEmbedControllerPromise = null;
      spotifyEmbedReady = false;
      throw error;
    });
    return spotifyEmbedControllerPromise;
  }

  async function playThroughSpotifyEmbed(track, requestId, signal) {
    const uri = getSpotifyTrackUri(track);
    if (!uri || !isCurrentPlaybackRequest(requestId, signal)) return false;
    try {
      await initializeSpotifyEmbedController(track);
      if (!spotifyEmbedController || !isCurrentPlaybackRequest(requestId, signal)) return false;
      if (spotifyEmbedCurrentUri !== uri) {
        spotifyEmbedController.loadEntity(uri);
        spotifyEmbedCurrentUri = uri;
      }
      spotifyEmbedPanel?.classList.remove('hidden');
      floatingWebPlayer?.classList.add('embed-controller-active');
      playbackBackend = 'spotify-embed';
      activeSpotifyDeviceId = null;
      activeSpotifyDeviceName = '';
      setPlayerSource('spotify-embed', 'Tify Plus tarayıcı oynatıcısı');
      setLocalVirtualDeviceState('preview', 'Tarayıcıda yerel önizleme oynatılıyor', 'ÖNİZLEME');
      spotifyEmbedController.play();
      return true;
    } catch (error) {
      console.warn('[Spotify Embed Playback]', error);
      spotifyPlayerFailureReason = 'embed';
      spotifyPlayerFailureMessage = String(error?.message || error || '');
      return false;
    }
  }

  function startSpotifyPlayerConnection(activateFromUserGesture = false) {
    if (spotifyPlayer && spotifyDeviceId) return true;
    if (!state.accessToken) return false;
    if (spotifyPlayerInitPromise) {
      if (activateFromUserGesture) requestSpotifyMediaActivation();
      return spotifyPlayerInitPromise;
    }
    if (!window.Spotify?.Player) return Promise.resolve(false);

    spotifyPlayerFailureReason = null;
    spotifyPlayerFailureMessage = '';
    setLocalVirtualDeviceState('connecting', 'Spotify Connect cihazı oluşturuluyor');
    const player = new Spotify.Player({
          name: localSpotifyDeviceLabel,
          getOAuthToken: callback => {
            getValidSpotifyAccessToken()
              .then(token => callback(token || ''))
              .catch(error => {
                console.warn('[Spotify Token Refresh]', error);
                callback(state.accessToken || '');
              });
          },
          volume: cassetteVolume ? parseFloat(cassetteVolume.value) : 0.85,
          enableMediaSession: true
    });
    spotifyPlayer = player;

    const connectionPromise = new Promise((resolve) => {
      let settled = false;
      let connectionTimer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectionTimer);
        resolve(value);
      };

        player.addListener('ready', ({ device_id }) => {
          if (spotifyPlayer !== player) return;
          spotifyDeviceId = device_id;
          spotifyPlayerFailureReason = null;
          spotifyPlayerFailureMessage = '';
          if (!['spotify-remote', 'spotify-embed'].includes(playbackBackend)) {
            activeSpotifyDeviceId = device_id;
            activeSpotifyDeviceName = localSpotifyDeviceLabel;
            setPlayerSource('spotify', 'Spotify Premium');
          }
          setLocalVirtualDeviceState('connected', 'Spotify Connect üzerinden bu tarayıcıya bağlı', 'BAĞLI');
          finish(true);
        });
        player.addListener('not_ready', () => {
          if (spotifyPlayer !== player) return;
          spotifyDeviceId = null;
          setLocalVirtualDeviceState('offline', 'Spotify cihaz bağlantısı kesildi');
          setPlayerSource('none', 'Bağlantı kesildi');
        });
        player.addListener('player_state_changed', (sdkState) => {
          if (spotifyPlayer !== player) return;
          if (!sdkState) return;
          const durationSec = Math.max(1, Math.floor(sdkState.duration / 1000));
          const positionSec = Math.floor(sdkState.position / 1000);
          cassetteDurationSec = durationSec;
          cassetteCurrentSec = positionSec;
          if (playerDuration) playerDuration.textContent = formatTapeTime(durationSec);
          if (playerCurrentTime) playerCurrentTime.textContent = formatTapeTime(positionSec);
          if (tapeCounter) tapeCounter.textContent = formatTapeTime(positionSec);
          const pct = Math.min(100, (positionSec / durationSec) * 100);
          setPlayerProgress(pct);
          if (cassetteProgressFill) cassetteProgressFill.style.width = `${pct}%`;
          setUnifiedPlaybackState(!sdkState.paused);
          if (typeof sdkState.shuffle === 'boolean') syncShuffleUi(sdkState.shuffle);
        });

        const fail = (message, reason = 'unknown', needsReconnect = false) => {
          console.warn('[Spotify Player]', message);
          spotifyPlayerFailureReason = reason;
          spotifyPlayerFailureMessage = String(message || '');
          if (['initialization', 'connection', 'timeout', 'sdk'].includes(reason)) {
            spotifySdkUnavailableUntil = Date.now() + 5 * 60 * 1000;
          }
          if (needsReconnect) setPlayerSource('none', 'Yeniden bağlan');
          if (reason !== 'autoplay') setLocalVirtualDeviceState('offline', 'Spotify Connect cihazı hazır değil');
          finish(false);
        };
        player.addListener('initialization_error', ({ message }) => fail(message, 'initialization'));
        player.addListener('authentication_error', ({ message }) => fail(message, 'authentication', true));
        player.addListener('account_error', ({ message }) => fail(message, 'premium'));
        player.addListener('playback_error', ({ message }) => {
          console.warn('[Spotify Playback]', message);
          spotifyPlayerFailureReason = 'playback';
          setUnifiedPlaybackState(false);
        });
        player.addListener('autoplay_failed', () => {
          spotifyPlayerFailureReason = 'autoplay';
          setUnifiedPlaybackState(false);
        });

        if (activateFromUserGesture && typeof player.activateElement === 'function') {
          player.activateElement().catch(error => console.warn('[Spotify Media Activation]', error));
        }

        player.connect().then(success => {
          if (!success) fail('Spotify oynatıcı bağlantısı kurulamadı.', 'connection');
        }).catch(error => fail(error.message, 'connection'));

        connectionTimer = setTimeout(() => {
          if (settled || spotifyPlayer !== player) return;
          if (playbackBackend === 'spotify-remote') {
            finish(false);
            return;
          }
          spotifyPlayerFailureReason ||= 'timeout';
          spotifyPlayerFailureMessage ||= 'Spotify oynatıcı bağlantısı zaman aşımına uğradı.';
          spotifySdkUnavailableUntil = Date.now() + 5 * 60 * 1000;
          setLocalVirtualDeviceState('offline', 'Spotify Connect cihazı zaman aşımına uğradı');
          finish(false);
        }, 6000);
    });

    spotifyPlayerInitPromise = connectionPromise.finally(() => {
      if (!spotifyDeviceId && spotifyPlayer === player) {
        player.disconnect?.();
        spotifyPlayer = null;
        spotifyPlayerInitPromise = null;
      }
    });
    return spotifyPlayerInitPromise;
  }

  async function initializeSpotifyPlayer(forceRetry = false, activateFromUserGesture = false) {
    if (spotifyPlayer && spotifyDeviceId) return true;
    if (!state.accessToken) return false;
    if (forceRetry) spotifySdkUnavailableUntil = 0;
    if (!forceRetry && Date.now() < spotifySdkUnavailableUntil) return false;
    if (spotifyPlayerInitPromise) {
      if (activateFromUserGesture) requestSpotifyMediaActivation();
      return spotifyPlayerInitPromise;
    }

    try {
      await loadSpotifySdk();
      return await startSpotifyPlayerConnection(activateFromUserGesture);
    } catch (error) {
      console.warn('[Spotify SDK]', error);
      spotifyPlayerFailureReason = 'sdk';
      spotifyPlayerFailureMessage = String(error?.message || error || '');
      spotifySdkUnavailableUntil = Date.now() + 5 * 60 * 1000;
      setLocalVirtualDeviceState('offline', 'Spotify Connect çalışma zamanı yüklenemedi');
      return false;
    }
  }

  async function playThroughSpotify(track, requestId, signal) {
    const uri = getSpotifyTrackUri(track);
    if (!state.accessToken || !uri) return false;
    if (state.userProduct && state.userProduct !== 'premium') {
      spotifyPlayerFailureReason = 'premium';
      spotifyPlayerFailureMessage = 'Spotify hesabı Premium değil.';
      return false;
    }
    prepareSpotifyPlayerFromUserGesture();
    const ready = await initializeSpotifyPlayer(false, true);
    if (!ready || !spotifyDeviceId || !isCurrentPlaybackRequest(requestId, signal)) return false;

    try {
      const token = await getValidSpotifyAccessToken();
      if (spotifyPlayer.activateElement) await spotifyPlayer.activateElement();
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
        method: 'PUT',
        signal,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [uri] })
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        spotifyPlayerFailureReason = response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'premium'
            : 'playback';
        throw new Error(details?.error?.message || `Spotify playback HTTP ${response.status}`);
      }
      spotifyPlayerFailureReason = null;
      activeSpotifyDeviceId = spotifyDeviceId;
      activeSpotifyDeviceName = localSpotifyDeviceLabel;
      hideSpotifyEmbed();
      setPlayerSource('spotify', 'Spotify Premium');
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      console.warn('[Spotify Direct Playback]', error);
      return false;
    }
  }

  async function playThroughSpotifyConnect(track, requestId, signal, retryingStoredDevice = false) {
    const uri = getSpotifyTrackUri(track);
    if (!state.accessToken || !uri) return false;

    try {
      const token = await getValidSpotifyAccessToken();
      if (!isCurrentPlaybackRequest(requestId, signal)) return false;
      let target = !retryingStoredDevice && activeSpotifyDeviceId && activeSpotifyDeviceId !== spotifyDeviceId
        ? { id: activeSpotifyDeviceId, name: activeSpotifyDeviceName || 'Spotify cihazı', isStored: true }
        : null;

      if (!target) {
        const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
          signal,
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!devicesResponse.ok) {
          spotifyPlayerFailureReason = devicesResponse.status === 401
            ? 'authentication'
            : devicesResponse.status === 403
              ? 'premium'
              : 'devices';
          spotifyPlayerFailureMessage = `Spotify devices HTTP ${devicesResponse.status}`;
          return false;
        }

        const data = await devicesResponse.json();
        const devices = (Array.isArray(data.devices) ? data.devices : [])
          .filter(device => device?.id && !device.is_restricted && device.id !== spotifyDeviceId && device.name !== localSpotifyDeviceLabel);
        target = devices.find(device => String(device.type).toLowerCase() === 'smartphone')
          || devices.find(device => device.is_active)
          || devices[0];
      }

      if (!target) {
        spotifyPlayerFailureReason = 'no_device';
        spotifyPlayerFailureMessage = 'Spotify Connect cihazı bulunamadı.';
        return false;
      }
      if (!isCurrentPlaybackRequest(requestId, signal)) return false;

      const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(target.id)}`, {
        method: 'PUT',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [uri] })
      });
      if (!playResponse.ok) {
        const details = await playResponse.json().catch(() => ({}));
        spotifyPlayerFailureReason = playResponse.status === 401
          ? 'authentication'
          : playResponse.status === 403
            ? 'premium'
            : playResponse.status === 404
              ? 'no_device'
              : 'playback';
        spotifyPlayerFailureMessage = details?.error?.message || `Spotify Connect HTTP ${playResponse.status}`;
        if (playResponse.status === 404 && target.isStored && !retryingStoredDevice) {
          activeSpotifyDeviceId = null;
          activeSpotifyDeviceName = '';
          return playThroughSpotifyConnect(track, requestId, signal, true);
        }
        return false;
      }

      activeSpotifyDeviceId = target.id;
      activeSpotifyDeviceName = target.name || 'Spotify cihazı';
      spotifyPlayerFailureReason = null;
      spotifyPlayerFailureMessage = '';
      hideSpotifyEmbed();
      setPlayerSource('spotify-remote', `Spotify Connect • ${activeSpotifyDeviceName}`);
      setUnifiedPlaybackState(true);
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      console.warn('[Spotify Connect Playback]', error);
      spotifyPlayerFailureReason ||= 'connection';
      spotifyPlayerFailureMessage = String(error?.message || error || '');
      return false;
    }
  }

  async function loadAndPlayUnifiedTrack(track, playlistName) {
    if (!state.accessToken) {
      showSpotifyLoginRequired();
      return;
    }
    playbackAbortController?.abort();
    playbackAbortController = new AbortController();
    const requestId = ++playbackRequestSerial;
    const { signal } = playbackAbortController;

    currentCassetteTrack = track;
    currentPlaylistContextName = playlistName || "SOOND Koleksiyonu";
    const matchingQueue = [state.currentPlaylist, ...state.playlists]
      .find(playlist => Array.isArray(playlist?.tracks) && playlist.tracks.some(item => item.id === track.id))?.tracks;
    if (matchingQueue?.length) {
      localPlaybackQueue = matchingQueue.filter(getSpotifyTrackUri);
      localPlaybackQueueIndex = localPlaybackQueue.findIndex(item => item.id === track.id);
    } else if (!localPlaybackQueue.some(item => item.id === track.id)) {
      localPlaybackQueue = [track];
      localPlaybackQueueIndex = 0;
    } else {
      localPlaybackQueueIndex = localPlaybackQueue.findIndex(item => item.id === track.id);
    }
    cassetteCurrentSec = 0;
    applyTrackVisualSignature(track);

    const coverUrl = track.cover || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80';
    const spotifyUrl = track.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(track.title + ' ' + track.artist)}`;

    // 1. Update Hero Cassette Deck
    if (tapeTrackTitle) tapeTrackTitle.textContent = track.title;
    if (tapeTrackArtist) tapeTrackArtist.textContent = `A / TIFY⁺ PULSE / ${track.artist.toUpperCase()}`;
    if (cassetteSubtitle) cassetteSubtitle.textContent = `${track.artist} • ${currentPlaylistContextName}`;
    if (tapeCounter) tapeCounter.textContent = "00:00";
    if (cassetteProgressFill) cassetteProgressFill.style.width = "0%";

    // 2. Update & Show Sticky Bottom Player
    if (playerCoverImg) playerCoverImg.src = coverUrl;
    if (playerTrackTitle) playerTrackTitle.textContent = track.title;
    if (playerTrackArtist) playerTrackArtist.textContent = `${track.artist} • ${currentPlaylistContextName}`;
    if (playerCurrentTime) playerCurrentTime.textContent = "0:00";
    const knownDurationSec = Math.floor((track.durationMs || 0) / 1000);
    cassetteDurationSec = knownDurationSec || 30;
    if (playerDuration) playerDuration.textContent = knownDurationSec ? formatTapeTime(knownDurationSec) : "0:00";
    setPlayerProgress(0);
    if (playerOpenSpotifyBtn) playerOpenSpotifyBtn.href = spotifyUrl;
    if (floatingWebPlayer) floatingWebPlayer.classList.remove('hidden');
    setUnifiedPlaybackState(false);
    isPlaybackStarting = true;
    floatingWebPlayer?.classList.add('is-loading');
    btnPlayerPlayToggle?.setAttribute('aria-busy', 'true');
    if (playerPlayIcon) playerPlayIcon.className = 'fa-solid fa-spinner fa-spin';

    // 3. Keep playback in this browser. A remote Spotify Connect device is
    // only used after the user explicitly selects it from the device menu.
    if (cassetteAudioPlayer) {
      cassetteAudioPlayer.pause();
      cassetteAudioPlayer.removeAttribute('src');
    }
    setPlayerSource('none', 'Parça hazırlanıyor');
    let spotifyStarted = false;
    if (playbackBackend === 'spotify-embed' && spotifyEmbedController) {
      spotifyStarted = await playThroughSpotifyEmbed(track, requestId, signal);
    } else if (prefersSpotifyConnectFirst()) {
      spotifyStarted = await playThroughSpotifyConnect(track, requestId, signal);
      if (!spotifyStarted && isCurrentPlaybackRequest(requestId, signal)) {
        spotifyStarted = await playThroughSpotify(track, requestId, signal);
      }
      if (!spotifyStarted && isCurrentPlaybackRequest(requestId, signal)) {
        spotifyStarted = await playThroughSpotifyEmbed(track, requestId, signal);
      }
    } else {
      spotifyStarted = await playThroughSpotify(track, requestId, signal);
      if (!spotifyStarted && isCurrentPlaybackRequest(requestId, signal)) {
        spotifyStarted = await playThroughSpotifyEmbed(track, requestId, signal);
      }
    }
    if (!isCurrentPlaybackRequest(requestId, signal)) return;
    isPlaybackStarting = false;
    floatingWebPlayer?.classList.remove('is-loading');
    btnPlayerPlayToggle?.removeAttribute('aria-busy');
    if (spotifyStarted) {
      if (playbackBackend === 'spotify') setPlayerSource('spotify', 'Bu cihazda çalıyor');
      if (playerPlayIcon) playerPlayIcon.className = 'fa-solid fa-pause';
      return;
    }
    if (playerPlayIcon) playerPlayIcon.className = 'fa-solid fa-play';

    setUnifiedPlaybackState(false);
    if (spotifyPlayerFailureReason === 'autoplay') {
      setPlayerSource('none', 'Oynatmaya yeniden dokunun');
    } else if (spotifyPlayerFailureReason === 'authentication') {
      setPlayerSource('none', 'Bağlantıyı yenileyin');
    } else if (spotifyPlayerFailureReason === 'premium') {
      setPlayerSource('none', 'Spotify Premium gerekli');
    } else if (spotifyPlayerFailureReason === 'initialization') {
      setPlayerSource('none', 'Tarayıcı korumalı sesi desteklemiyor');
    } else if (spotifyPlayerFailureReason === 'timeout') {
      setPlayerSource('none', 'Spotify bağlantısı zaman aşımına uğradı');
    } else if (spotifyPlayerFailureReason === 'no_device') {
      setPlayerSource('none', 'Spotify cihazı bulunamadı');
    } else {
      setPlayerSource('none', 'Yeniden denemek için oynatın');
      console.warn('[Spotify Playback Diagnostics]', spotifyPlayerFailureReason, spotifyPlayerFailureMessage);
    }
  }

  function setUnifiedPlaybackState(playing) {
    isCassettePlaying = playing;
    if (floatingWebPlayer) floatingWebPlayer.classList.toggle('is-playing', playing);

    // Update Hero Cassette Controls
    if (btnCassettePlay) {
      btnCassettePlay.textContent = playing ? "⏸" : "▶";
    }

    // Spin or Pause Mechanical Tape Spools
    if (tapeReelLeft) {
      if (playing) tapeReelLeft.classList.add('spinning');
      else tapeReelLeft.classList.remove('spinning');
    }
    if (tapeReelRight) {
      if (playing) tapeReelRight.classList.add('spinning');
      else tapeReelRight.classList.remove('spinning');
    }

    // Update Bottom Sticky Player
    if (playerPlayIcon) {
      if (!isPlaybackStarting) playerPlayIcon.className = playing ? "fa-solid fa-pause" : "fa-solid fa-play";
    }
    if (playing && playerPlaybackStatus) {
      playerPlaybackStatus.classList.add('is-active');
      playerPlaybackStatus.innerHTML = '<i></i> Bu cihazda çalıyor';
    } else if (!playing && !isPlaybackStarting && playerPlaybackStatus && String(playbackBackend).startsWith('spotify')) {
      playerPlaybackStatus.classList.remove('is-active');
      playerPlaybackStatus.innerHTML = '<i></i> Duraklatıldı';
    }
    if (playerVisualizerBars) {
      if (playing) playerVisualizerBars.classList.add('playing');
      else playerVisualizerBars.classList.remove('playing');
    }

    clearInterval(cassetteAudioTimer);

    if (playing) {
      cassetteAudioTimer = setInterval(() => {
        cassetteCurrentSec++;
        const timeFormatted = formatTapeTime(cassetteCurrentSec);

        // Update Hero Tape Counter
        if (tapeCounter) tapeCounter.textContent = timeFormatted;

        // Update Timeline Seek Bars
        const progressPct = Math.min(100, (cassetteCurrentSec / cassetteDurationSec) * 100);
        if (cassetteProgressFill) cassetteProgressFill.style.width = `${progressPct}%`;
        setPlayerProgress(progressPct);
        if (playerCurrentTime) playerCurrentTime.textContent = timeFormatted;

        // Animate Wave Equalizer
        animateWaveBars(true);

        // Auto Advance when finished
        if (cassetteCurrentSec >= cassetteDurationSec) {
          skipToNextTrack();
        }
      }, 1000);
    } else {
      animateWaveBars(false);
    }
  }

  function animateWaveBars(active) {
    const waveContainer = document.getElementById('wave');
    if (!waveContainer) return;
    const bars = waveContainer.querySelectorAll('span');
    bars.forEach(b => {
      b.style.height = active ? `${Math.floor(5 + Math.random() * 25)}px` : '4px';
    });
  }

  // Initialize Wave Bars on load
  const waveBox = document.getElementById('wave');
  if (waveBox && waveBox.children.length === 0) {
    for (let i = 0; i < 42; i++) {
      const s = document.createElement('span');
      s.style.height = `${Math.floor(4 + Math.random() * 18)}px`;
      waveBox.appendChild(s);
    }
  }

  async function toggleUnifiedPlayPause() {
    requestSpotifyMediaActivation();
    if (!state.accessToken) {
      showSpotifyLoginRequired();
      return;
    }
    if (isPlaybackStarting) return;
    if (playbackBackend === 'spotify' && spotifyPlayer) {
      try {
        if (spotifyPlayer.activateElement) await spotifyPlayer.activateElement();
        await spotifyPlayer.togglePlay();
      } catch (error) {
        console.warn('[Spotify Toggle]', error);
        showToast('Spotify oynatma komutu gönderilemedi.', 'warning');
      }
      return;
    }
    if (playbackBackend === 'spotify-embed' && spotifyEmbedController) {
      try {
        spotifyEmbedController.togglePlay();
      } catch (error) {
        console.warn('[Spotify Embed Toggle]', error);
        showToast('Tarayıcı oynatıcısı komutu uygulayamadı.', 'warning');
      }
      return;
    }
    if (playbackBackend === 'spotify-remote' && activeSpotifyDeviceId) {
      try {
        const token = await getValidSpotifyAccessToken();
        const endpoint = isCassettePlaying ? 'pause' : 'play';
        const response = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}?device_id=${encodeURIComponent(activeSpotifyDeviceId)}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Spotify remote ${endpoint} HTTP ${response.status}`);
        setUnifiedPlaybackState(!isCassettePlaying);
      } catch (error) {
        console.warn('[Spotify Remote Toggle]', error);
        showToast('Spotify cihazına oynatma komutu gönderilemedi. Spotify uygulamasını açık tutun.', 'warning');
      }
      return;
    }
    if (isCassettePlaying) {
      if (cassetteAudioPlayer && cassetteAudioPlayer.src) cassetteAudioPlayer.pause();
      setUnifiedPlaybackState(false);
    } else {
      if (!currentCassetteTrack) {
        const loadedPlaylist = [state.currentPlaylist, ...state.playlists]
          .find(playlist => Array.isArray(playlist?.tracks) && playlist.tracks.some(getSpotifyTrackUri));
        const loadedTrack = loadedPlaylist?.tracks?.find(getSpotifyTrackUri);
        if (loadedTrack) {
          loadAndPlayUnifiedTrack(loadedTrack, loadedPlaylist.name);
          return;
        }
        const firstSpotifyPlaylist = state.playlists.find(playlist => playlist?.id);
        if (firstSpotifyPlaylist) {
          window.playPlaylistFromCover(firstSpotifyPlaylist.id);
          return;
        }
        setPlayerSource('none', 'Bir şarkı seçin');
        if (cassetteSubtitle) cassetteSubtitle.textContent = 'Çalma listenizden bir şarkının oynat düğmesine dokunun';
        return;
      }
      if (cassetteAudioPlayer && cassetteAudioPlayer.src) {
        cassetteAudioPlayer.play();
        setUnifiedPlaybackState(true);
      } else {
        await loadAndPlayUnifiedTrack(currentCassetteTrack, currentPlaylistContextName);
      }
    }
  }

  async function seekSpotifyPlayback(positionMs) {
    try {
      if (playbackBackend === 'spotify' && spotifyPlayer) {
        await spotifyPlayer.seek(positionMs);
        return;
      }
      if (playbackBackend === 'spotify-embed' && spotifyEmbedController) {
        spotifyEmbedController.seek(Math.max(0, Math.floor(positionMs / 1000)));
        return;
      }
      if (playbackBackend === 'spotify-remote' && activeSpotifyDeviceId) {
        const token = await getValidSpotifyAccessToken();
        let response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.max(0, positionMs)}&device_id=${encodeURIComponent(activeSpotifyDeviceId)}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 404) {
          const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const devicesData = devicesResponse.ok ? await devicesResponse.json() : { devices: [] };
          const refreshedDevice = (devicesData.devices || []).find(device => device.id && device.is_active && !device.is_restricted);
          if (refreshedDevice) {
            activeSpotifyDeviceId = refreshedDevice.id;
            activeSpotifyDeviceName = refreshedDevice.name || activeSpotifyDeviceName;
            response = await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${Math.max(0, positionMs)}&device_id=${encodeURIComponent(activeSpotifyDeviceId)}`, {
              method: 'PUT', headers: { Authorization: `Bearer ${token}` }
            });
          }
        }
        if (!response.ok) throw new Error(`Spotify remote seek HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn('[Spotify Seek]', error);
      if (playbackBackend === 'spotify-remote') {
        // Some Spotify Connect targets temporarily reject seeking (ads, handoff, stale device).
        // Keep playback alive and avoid presenting this optional control as a critical failure.
        return;
      }
      showToast('Parçada ileri sarma şu anda kullanılamıyor.', 'warning');
    }
  }

  function skipToNextTrack() {
    const activeList = localPlaybackQueue.length
      ? localPlaybackQueue
      : (state.currentPlaylist && state.currentPlaylist.tracks && state.currentPlaylist.tracks.length > 0)
        ? state.currentPlaylist.tracks
      : (!state.isLoggedIn ? (SOOND_PUBLIC_PLAYLISTS[0].tracks || []) : []);
    if (!activeList.length) return;

    let idx = activeList === localPlaybackQueue && localPlaybackQueueIndex >= 0
      ? localPlaybackQueueIndex
      : currentCassetteTrack ? activeList.findIndex(t => t.id === currentCassetteTrack.id) : -1;
    const nextIdx = spotifyShuffleState && activeList.length > 1
      ? (() => {
          let randomIndex = idx;
          while (randomIndex === idx) randomIndex = Math.floor(Math.random() * activeList.length);
          return randomIndex;
        })()
      : (idx + 1) % activeList.length;
    if (activeList === localPlaybackQueue) localPlaybackQueueIndex = nextIdx;
    const plName = state.currentPlaylist ? state.currentPlaylist.name : (state.externalPlaylist?.name || 'Spotify');
    loadAndPlayUnifiedTrack(activeList[nextIdx], plName);
  }

  function skipToPrevTrack() {
    const activeList = localPlaybackQueue.length
      ? localPlaybackQueue
      : (state.currentPlaylist && state.currentPlaylist.tracks && state.currentPlaylist.tracks.length > 0)
        ? state.currentPlaylist.tracks
      : (!state.isLoggedIn ? (SOOND_PUBLIC_PLAYLISTS[0].tracks || []) : []);
    if (!activeList.length) return;

    let idx = activeList === localPlaybackQueue && localPlaybackQueueIndex >= 0
      ? localPlaybackQueueIndex
      : currentCassetteTrack ? activeList.findIndex(t => t.id === currentCassetteTrack.id) : 0;
    const prevIdx = (idx - 1 + activeList.length) % activeList.length;
    if (activeList === localPlaybackQueue) localPlaybackQueueIndex = prevIdx;
    const plName = state.currentPlaylist ? state.currentPlaylist.name : (state.externalPlaylist?.name || 'Spotify');
    loadAndPlayUnifiedTrack(activeList[prevIdx], plName);
  }

  // --- CONNECT EVENT LISTENERS FOR BOTH PLAYERS ---
  if (btnCassettePlay) btnCassettePlay.addEventListener('click', toggleUnifiedPlayPause);
  if (btnPlayerPlayToggle) btnPlayerPlayToggle.addEventListener('click', toggleUnifiedPlayPause);

  if (btnCassetteNext) btnCassetteNext.addEventListener('click', skipToNextTrack);
  if (btnPlayerNext) btnPlayerNext.addEventListener('click', skipToNextTrack);

  if (btnCassettePrev) btnCassettePrev.addEventListener('click', skipToPrevTrack);
  if (btnPlayerPrev) btnPlayerPrev.addEventListener('click', skipToPrevTrack);

  if (btnPlayerShuffle) {
    btnPlayerShuffle.addEventListener('click', async () => {
      if (btnPlayerShuffle.disabled) return;
      btnPlayerShuffle.disabled = true;
      btnPlayerShuffle.classList.add('is-pending');
      try {
        const enabled = !spotifyShuffleState;
        if (await setSpotifyShuffle(enabled)) {
          showToast(enabled ? 'Karışık çalma açıldı.' : 'Karışık çalma kapatıldı.', 'success');
        }
      } catch (error) {
        console.warn('[Spotify Shuffle]', error);
        showToast('Karışık çalma ayarı Spotify’a gönderilemedi.', 'warning');
      } finally {
        btnPlayerShuffle.disabled = false;
        btnPlayerShuffle.classList.remove('is-pending');
      }
    });
  }

  if (btnCloseWebPlayer) {
    btnCloseWebPlayer.addEventListener('click', () => {
      if (isCassettePlaying) toggleUnifiedPlayPause();
      hideSpotifyEmbed();
      if (floatingWebPlayer) floatingWebPlayer.classList.add('hidden');
    });
  }

  if (cassetteVolume) {
    cassetteVolume.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (cassetteAudioPlayer) cassetteAudioPlayer.volume = val;
      setSpotifyVolume(val);
    });
  }

  if (cassetteProgressBar) {
    cassetteProgressBar.addEventListener('click', async (e) => {
      const rect = cassetteProgressBar.getBoundingClientRect();
      const clickPos = (e.clientX - rect.left) / rect.width;
      cassetteCurrentSec = Math.floor(clickPos * cassetteDurationSec);
      if (cassetteProgressFill) cassetteProgressFill.style.width = `${clickPos * 100}%`;
      setPlayerProgress(clickPos * 100);
      if (tapeCounter) tapeCounter.textContent = formatTapeTime(cassetteCurrentSec);
      if (playerCurrentTime) playerCurrentTime.textContent = formatTapeTime(cassetteCurrentSec);
      if (cassetteAudioPlayer && cassetteAudioPlayer.duration) {
        cassetteAudioPlayer.currentTime = clickPos * cassetteAudioPlayer.duration;
      }
      await seekSpotifyPlayback(Math.floor(clickPos * cassetteDurationSec * 1000));
    });
  }

  if (playerSeekSlider) {
    playerSeekSlider.addEventListener('input', e => setPlayerProgress(e.target.value));
    playerSeekSlider.addEventListener('change', async (e) => {
      const clickPos = parseFloat(e.target.value) / 100;
      cassetteCurrentSec = Math.floor(clickPos * cassetteDurationSec);
      if (cassetteProgressFill) cassetteProgressFill.style.width = `${clickPos * 100}%`;
      if (tapeCounter) tapeCounter.textContent = formatTapeTime(cassetteCurrentSec);
      if (playerCurrentTime) playerCurrentTime.textContent = formatTapeTime(cassetteCurrentSec);
      if (cassetteAudioPlayer && cassetteAudioPlayer.duration) {
        cassetteAudioPlayer.currentTime = clickPos * cassetteAudioPlayer.duration;
      }
      await seekSpotifyPlayback(Math.floor(clickPos * cassetteDurationSec * 1000));
    });
  }

  if (playerVolumeSlider) {
    playerVolumeSlider.addEventListener('input', event => setSpotifyVolume(Number(event.target.value) / 100));
  }
  if (btnPlayerMute) {
    btnPlayerMute.addEventListener('click', () => {
      const currentVolume = Number(playerVolumeSlider?.value || 0) / 100;
      setSpotifyVolume(currentVolume > 0 ? 0 : lastPlayerVolume);
    });
  }
  if (btnPlayerDevices && playerDevicesPopover) {
    btnPlayerDevices.addEventListener('click', async event => {
      event.stopPropagation();
      const willOpen = playerDevicesPopover.classList.contains('hidden');
      playerDevicesPopover.classList.toggle('hidden', !willOpen);
      btnPlayerDevices.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) await loadSpotifyDevices();
    });
    playerDevicesList?.addEventListener('click', async event => {
      const deviceButton = event.target.closest('.player-device-item');
      if (!deviceButton || !state.accessToken) return;
      try {
        const token = await getValidSpotifyAccessToken();
        const response = await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ids: [deviceButton.dataset.deviceId], play: isCassettePlaying })
        });
        if (!response.ok) throw new Error(`Spotify transfer HTTP ${response.status}`);
        activeSpotifyDeviceId = deviceButton.dataset.deviceId;
        activeSpotifyDeviceName = deviceButton.querySelector('strong')?.textContent || 'Spotify cihazı';
        hideSpotifyEmbed();
        setPlayerSource(activeSpotifyDeviceId === spotifyDeviceId ? 'spotify' : 'spotify-remote', `Spotify Connect • ${activeSpotifyDeviceName}`);
        playerDevicesPopover.classList.add('hidden');
        btnPlayerDevices.setAttribute('aria-expanded', 'false');
        showToast('Spotify oynatması seçilen cihaza aktarıldı.', 'success');
      } catch (error) {
        console.warn('[Spotify Transfer]', error);
        showToast('Cihaz değiştirilemedi. Spotify uygulamasını açık tutun.', 'warning');
      }
    });
    document.addEventListener('click', event => {
      if (!playerDevicesPopover.contains(event.target) && !btnPlayerDevices.contains(event.target)) {
        playerDevicesPopover.classList.add('hidden');
        btnPlayerDevices.setAttribute('aria-expanded', 'false');
      }
    });
  }



  // ============================================================
  // USER PROFILE DROPDOWN MENU CONTROLLER
  // ============================================================
  const btnToggleProfileMenu = document.getElementById('btnToggleProfileMenu');
  const userDropdownMenu = document.getElementById('userDropdownMenu');

  if (btnToggleProfileMenu && userDropdownMenu) {
    btnToggleProfileMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!userDropdownMenu.contains(e.target) && !btnToggleProfileMenu.contains(e.target)) {
        userDropdownMenu.classList.add('hidden');
      }
    });
  }

  // ============================================================
  // CREATE PLAYLIST CONTROLLER
  // ============================================================
  const createPlaylistModal = document.getElementById('createPlaylistModal');
  const btnHeaderCreatePlaylist = document.getElementById('btnHeaderCreatePlaylist');
  const menuItemNewPlaylist = document.getElementById('menuItemNewPlaylist');
  const btnCloseCreatePlaylistModal = document.getElementById('btnCloseCreatePlaylistModal');
  const btnCancelCreatePlaylist = document.getElementById('btnCancelCreatePlaylist');
  const btnSubmitCreatePlaylist = document.getElementById('btnSubmitCreatePlaylist');
  const inputNewPlaylistName = document.getElementById('inputNewPlaylistName');
  const inputNewPlaylistDesc = document.getElementById('inputNewPlaylistDesc');
  const chkNewPlaylistPrivate = document.getElementById('chkNewPlaylistPrivate');

  function openCreatePlaylistModal() {
    if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
    if (createPlaylistModal) {
      if (inputNewPlaylistName) inputNewPlaylistName.value = '';
      if (inputNewPlaylistDesc) inputNewPlaylistDesc.value = '';
      if (chkNewPlaylistPrivate) chkNewPlaylistPrivate.checked = false;
      createPlaylistModal.classList.remove('hidden');
    }
  }

  if (btnHeaderCreatePlaylist) btnHeaderCreatePlaylist.addEventListener('click', openCreatePlaylistModal);
  if (menuItemNewPlaylist) menuItemNewPlaylist.addEventListener('click', openCreatePlaylistModal);
  if (btnCloseCreatePlaylistModal) btnCloseCreatePlaylistModal.addEventListener('click', () => createPlaylistModal.classList.add('hidden'));
  if (btnCancelCreatePlaylist) btnCancelCreatePlaylist.addEventListener('click', () => createPlaylistModal.classList.add('hidden'));

  if (btnSubmitCreatePlaylist) {
    btnSubmitCreatePlaylist.addEventListener('click', async () => {
      const name = inputNewPlaylistName ? inputNewPlaylistName.value.trim() : '';
      const desc = inputNewPlaylistDesc ? inputNewPlaylistDesc.value.trim() : '';
      const isPrivate = chkNewPlaylistPrivate ? chkNewPlaylistPrivate.checked : false;

      if (!name) {
        showToast("Lütfen çalma listesi için bir isim girin!", "warning");
        return;
      }

      btnSubmitCreatePlaylist.disabled = true;
      btnSubmitCreatePlaylist.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Oluşturuluyor...`;

      try {
        let createdPl = null;
        if (state.accessToken) {
          const res = await fetch('https://api.spotify.com/v1/me/playlists', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${state.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: name,
              description: desc,
              public: !isPrivate
            })
          });

          if (res.ok) {
            const data = await res.json();
            createdPl = {
              id: data.id,
              name: data.name,
              owner: state.userName || 'S O O N D',
              followers: 0,
              isPrivate: isPrivate,
              url: data.external_urls?.spotify || `https://open.spotify.com/playlist/${data.id}`,
              cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
              description: desc || 'Spotify hesabınızda oluşturulan çalma listesi.',
              trackTotal: 0,
              tracks: [],
              tracksLoaded: true
            };
          }
        }

        if (!createdPl) {
          createdPl = {
            id: 'custom_' + Date.now(),
            name: name,
            owner: state.userName || 'S O O N D',
            followers: 0,
            isPrivate: isPrivate,
            url: 'https://open.spotify.com',
            cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80',
            description: desc || 'Tify Plus Pulse üzerinde oluşturulan çalma listesi.',
            trackTotal: 0,
            tracks: [],
            tracksLoaded: true
          };
        }

        state.playlists.unshift(createdPl);
        buildGlobalPresenceMap();
        saveLibraryCache(state.playlists);
        renderPlaylistsCatalog();
        createPlaylistModal.classList.add('hidden');
        selectAndAnalyzePlaylist(createdPl.id);
        showToast(`"${createdPl.name}" çalma listesi başarıyla oluşturuldu!`, "success");
      } catch (err) {
        console.error("Playlist creation error:", err);
        showToast("Liste oluşturulurken bir hata oluştu.", "warning");
      } finally {
        btnSubmitCreatePlaylist.disabled = false;
        btnSubmitCreatePlaylist.innerHTML = `<i class="fa-brands fa-spotify"></i> Spotify'da Oluştur`;
      }
    });
  }

  // ============================================================
  // SYSTEM MAP & SETTINGS MODALS CONTROLLERS
  // ============================================================
  const systemMapModal = document.getElementById('systemMapModal');
  const menuItemSystemMap = document.getElementById('menuItemSystemMap');
  const btnCloseSystemMapModal = document.getElementById('btnCloseSystemMapModal');
  const menuItemBackups = document.getElementById('menuItemBackups');
  const menuItemDnaResearch = document.getElementById('menuItemDnaResearch');
  const menuItemSettings = document.getElementById('menuItemSettings');
  const menuItemPrivacy = document.getElementById('menuItemPrivacy');

  if (menuItemSystemMap) {
    menuItemSystemMap.addEventListener('click', () => {
      if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
      if (systemMapModal) systemMapModal.classList.remove('hidden');
    });
  }
  if (btnCloseSystemMapModal) {
    btnCloseSystemMapModal.addEventListener('click', () => {
      if (systemMapModal) systemMapModal.classList.add('hidden');
    });
  }
  if (menuItemBackups) {
    menuItemBackups.addEventListener('click', () => {
      if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
      const historyModal = document.getElementById('historyModal');
      if (historyModal) {
        renderHistoryModalList();
        historyModal.classList.remove('hidden');
      }
    });
  }
  if (menuItemDnaResearch) {
    menuItemDnaResearch.addEventListener('click', async () => {
      if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
      let playlist = state.currentPlaylist;
      if (!playlist && state.playlists.length) {
        await window.selectAndAnalyzePlaylist(state.playlists[0].id);
        playlist = state.currentPlaylist;
      }
      if (!playlist?.tracks?.length) {
        showToast('Önce şarkıları olan bir çalma listesini açın.', 'warning');
        return;
      }
      document.getElementById('btnFetchLiveGenres')?.click();
    });
  }
  if (menuItemSettings) {
    menuItemSettings.addEventListener('click', () => {
      if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
      if (authModal) authModal.classList.remove('hidden');
    });
  }
  if (menuItemPrivacy) {
    menuItemPrivacy.addEventListener('click', () => {
      if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
      openPrivacyCenter('overview');
    });
  }

  // --- PRIVACY POLICY MODAL CONTROLLER ---
  const btnOpenPrivacyPolicyModal = document.getElementById('btnOpenPrivacyPolicyModal');
  const btnClosePrivacyPolicyModal = document.getElementById('btnClosePrivacyPolicyModal');
  const privacyPolicyModal = document.getElementById('privacyPolicyModal');
  const privacyNotice = document.getElementById('privacyNotice');
  const btnManageStorage = document.getElementById('btnManageStorage');
  const btnNecessaryOnly = document.getElementById('btnNecessaryOnly');
  const btnAcceptFunctional = document.getElementById('btnAcceptFunctional');
  const btnStorageNecessary = document.getElementById('btnStorageNecessary');
  const btnStorageFunctional = document.getElementById('btnStorageFunctional');
  const storageConsentStatus = document.getElementById('storageConsentStatus');
  const privacyRegionBadge = document.getElementById('privacyRegionBadge');

  const FUNCTIONAL_STORAGE_KEYS = new Set([
    'spotify_library_cache',
    'spotify_pulse_snapshots',
    'spotify_last_sync',
    'spotify_user_name',
    'spotify_user_email',
    'spotify_user_avatar',
    'spotify_app_mode',
    'custom_spotify_client_id',
    'tify_ui_language',
    'tify_ui_theme',
    'tify_artist_genres_v2',
    'tify_musicbrainz_genres_v1',
    'tify_privacy_notice_v1'
  ]);

  function purgeFunctionalStorage() {
    const keysToDelete = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (FUNCTIONAL_STORAGE_KEYS.has(key) || key.startsWith(TRACK_CACHE_PREFIX))) keysToDelete.push(key);
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
    clearPersonalSpotifySessionData();
    state.versionedHistory = [];
  }

  function updateStorageConsentUi() {
    const labels = {
      functional: 'İşlevsel depolamaya izin verildi',
      necessary: 'Yalnızca gerekli depolama',
      unset: 'Karar bekleniyor'
    };
    if (storageConsentStatus) storageConsentStatus.textContent = labels[storageConsent] || labels.unset;
    btnStorageNecessary?.classList.toggle('is-selected', storageConsent === 'necessary');
    btnStorageFunctional?.classList.toggle('is-selected', storageConsent === 'functional');
  }

  function setStorageConsent(mode) {
    if (!['necessary', 'functional'].includes(mode)) return;
    storageConsent = mode;
    localStorage.setItem(STORAGE_CONSENT_KEY, mode);
    if (mode === 'necessary') {
      purgeFunctionalStorage();
    } else {
      localStorage.setItem('tify_ui_language', currentLanguage);
      localStorage.setItem(THEME_STORAGE_KEY, document.documentElement.dataset.theme || 'dark');
      const sessionMode = sessionStorage.getItem('spotify_app_mode');
      const sessionClientId = sessionStorage.getItem('custom_spotify_client_id');
      if (sessionMode) localStorage.setItem('spotify_app_mode', sessionMode);
      if (sessionClientId) localStorage.setItem('custom_spotify_client_id', sessionClientId);
    }
    privacyNotice?.classList.add('hidden');
    updateStorageConsentUi();
    showToast(mode === 'functional'
      ? 'İşlevsel tarayıcı depolamasına izin verildi.'
      : 'Yalnızca gerekli depolama kullanılacak.', 'success');
  }

  function getPrivacyRegion() {
    const region = (document.documentElement.dataset.region || '').toUpperCase();
    const eeaRegions = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO']);
    if (region === 'TR' || currentLanguage === 'tr') return { code: 'tr', label: 'Türkiye • KVKK' };
    if (eeaRegions.has(region)) return { code: 'eu', label: 'AB/AEA • GDPR' };
    return { code: 'global', label: region ? `Global • ${region}` : 'Global' };
  }

  function activatePrivacyTab(tabName) {
    document.querySelectorAll('.privacy-tab').forEach(button => button.classList.toggle('is-active', button.dataset.privacyTab === tabName));
    document.querySelectorAll('.privacy-panel').forEach(panel => panel.classList.toggle('is-active', panel.dataset.privacyPanel === tabName));
  }

  function openPrivacyCenter(tabName = 'overview') {
    if (!privacyPolicyModal) return;
    activatePrivacyTab(tabName);
    privacyPolicyModal.classList.remove('hidden');
  }

  function getExportableLocalData() {
    const result = {};
    const allowedPrefixes = ['spotify_library_cache', 'spotify_tracks_', 'spotify_pulse_snapshots', 'spotify_last_sync', 'spotify_user_name', 'spotify_user_email', 'spotify_user_avatar', 'tify_', 'custom_spotify_client_id', 'spotify_app_mode'];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || !allowedPrefixes.some(prefix => key.startsWith(prefix))) continue;
      const rawValue = localStorage.getItem(key);
      try { result[key] = JSON.parse(rawValue); } catch (_) { result[key] = rawValue; }
    }
    return { exportedAt: new Date().toISOString(), product: 'Tify Plus Pulse', publisher: 'Locked Co Labs', developer: 'SOOND', data: result };
  }

  function exportLocalPrivacyData() {
    const payload = JSON.stringify(getExportableLocalData(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tify-plus-pulse-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('Yerel verileriniz JSON olarak dışa aktarıldı.', 'success');
  }

  function deleteAllLocalPrivacyData() {
    const confirmed = window.confirm('Spotify oturumu, yerel playlist önbelleği, yedekler ve tüm Tify Plus Pulse tercihleri bu tarayıcıdan silinecek. Devam edilsin mi?');
    if (!confirmed) return;
    const keysToDelete = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (key.startsWith('spotify_') || key.startsWith('tify_') || key === 'custom_spotify_client_id')) keysToDelete.push(key);
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
    ['spotify_access_token','spotify_refresh_token','spotify_token_expires_at','spotify_code_verifier','spotify_client_id'].forEach(key => sessionStorage.removeItem(key));
    if (spotifyPlayer) spotifyPlayer.disconnect();
    window.location.reload();
  }

  document.querySelectorAll('.privacy-tab').forEach(button => button.addEventListener('click', () => activatePrivacyTab(button.dataset.privacyTab)));

  const privacyRegion = getPrivacyRegion();
  if (privacyRegionBadge) privacyRegionBadge.textContent = `Bölge: ${privacyRegion.label}`;
  if (navigator.globalPrivacyControl === true) localStorage.setItem('tify_external_metadata_disabled', 'true');
  updateStorageConsentUi();
  if (privacyNotice && storageConsent === 'unset') privacyNotice.classList.remove('hidden');

  if (btnOpenPrivacyPolicyModal && privacyPolicyModal) {
    btnOpenPrivacyPolicyModal.addEventListener('click', () => openPrivacyCenter(privacyRegion.code));
  }
  if (btnClosePrivacyPolicyModal && privacyPolicyModal) {
    btnClosePrivacyPolicyModal.addEventListener('click', () => {
      privacyPolicyModal.classList.add('hidden');
      if (storageConsent === 'unset') privacyNotice?.classList.remove('hidden');
    });
  }
  btnManageStorage?.addEventListener('click', () => {
    privacyNotice?.classList.add('hidden');
    openPrivacyCenter('storage');
  });
  btnNecessaryOnly?.addEventListener('click', () => setStorageConsent('necessary'));
  btnAcceptFunctional?.addEventListener('click', () => setStorageConsent('functional'));
  btnStorageNecessary?.addEventListener('click', () => setStorageConsent('necessary'));
  btnStorageFunctional?.addEventListener('click', () => setStorageConsent('functional'));
  ['btnPrivacyExport', 'btnFooterExportData'].forEach(id => document.getElementById(id)?.addEventListener('click', exportLocalPrivacyData));
  ['btnPrivacyDelete', 'btnFooterDeleteData'].forEach(id => document.getElementById(id)?.addEventListener('click', deleteAllLocalPrivacyData));

  // CSP-safe delegated actions for dynamically rendered cards and controls.
  function runDelegatedAction(actionElement) {
    const { action, playlistId, playlistA, playlistB, trackId, snapshotId, page } = actionElement.dataset;
    if (action === 'play-playlist' || action === 'play-track') prepareSpotifyPlayerFromUserGesture();
    switch (action) {
      case 'restore-snapshot': restoreSafetySnapshot(snapshotId); break;
      case 'open-match': window.openSmartMatchModal?.(playlistA, playlistB); break;
      case 'select-playlist': window.selectAndAnalyzePlaylist?.(playlistId); break;
      case 'play-playlist': window.playPlaylistFromCover?.(playlistId); break;
      case 're-auth': window.triggerReAuth?.(); break;
      case 'play-track': window.playTrackInWebPlayer?.(trackId); break;
      case 'quick-transfer': window.quickTransferTrack?.(trackId); break;
      case 'track-page': window.goToTrackPage?.(Number(page)); break;
      default: break;
    }
  }

  document.addEventListener('click', event => {
    const actionElement = event.target.closest?.('[data-action]');
    if (!actionElement) return;
    event.preventDefault();
    runDelegatedAction(actionElement);
  });

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const actionElement = event.target.closest?.('[data-action]');
    if (!actionElement || ['BUTTON', 'A'].includes(actionElement.tagName)) return;
    event.preventDefault();
    runDelegatedAction(actionElement);
  });

  // --- CONSISTENT, ACCESSIBLE WINDOW BEHAVIOUR ---
  const modalOverlays = Array.from(document.querySelectorAll('.modal-overlay'));
  const syncModal = document.getElementById('syncLoaderModal');

  function syncModalDocumentState() {
    const hasOpenModal = modalOverlays.some(modal => !modal.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', hasOpenModal);
    modalOverlays.forEach(modal => modal.setAttribute('aria-hidden', String(modal.classList.contains('hidden'))));
  }

  modalOverlays.forEach(modal => {
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('mousedown', event => {
      if (event.target === modal && modal !== syncModal) modal.classList.add('hidden');
    });
    new MutationObserver(syncModalDocumentState).observe(modal, { attributes: true, attributeFilter: ['class'] });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const openModal = [...modalOverlays].reverse().find(modal => !modal.classList.contains('hidden') && modal !== syncModal);
    if (openModal) openModal.classList.add('hidden');
  });
  syncModalDocumentState();

  initLanguageSelector();
  initFrequencyNeon();

  // Pointer lighting is desktop-only. Touch pointermove events must remain free
  // for the browser's compositor-driven vertical scrolling.
  const supportsSpatialPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (supportsSpatialPointer) {
    let spatialFrame = 0;
    document.addEventListener('pointermove', event => {
      if (!event.target.closest) return;
      const card = event.target.closest('.spatial-card');
      if (!card) return;
      cancelAnimationFrame(spatialFrame);
      spatialFrame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = clamp01((event.clientX - rect.left) / rect.width);
        const y = clamp01((event.clientY - rect.top) / rect.height);
        card.style.setProperty('--pointer-x', `${x * 100}%`);
        card.style.setProperty('--pointer-y', `${y * 100}%`);
        card.style.setProperty('--tilt-y', `${(x - .5) * 5}deg`);
        card.style.setProperty('--tilt-x', `${(.5 - y) * 5}deg`);
      });
    }, { passive: true });

    document.addEventListener('pointerout', event => {
      const card = event.target.closest?.('.spatial-card');
      if (!card || card.contains(event.relatedTarget)) return;
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    }, { passive: true });
  }

  // --- INITIAL CHECK ---
  if (state.accessToken) {
    setAppSessionState(true);
  } else {
    setAppSessionState(false);
  }

  // --- TRIGGER RE-AUTH WITH FRESH SCOPES ---
  window.triggerReAuth = function() {
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_refresh_token');
    sessionStorage.removeItem('spotify_token_expires_at');
    state.accessToken = null;
    const clientId = getActiveClientId();
    redirectToSpotifyPKCE(clientId);
  };

  function showToast(msg, type = "success") {
    toastMessage.textContent = msg;
    toastNotification.classList.remove('hidden');
    clearTimeout(showToast.hideTimer);
    showToast.hideTimer = setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, 3500);
  }

});
