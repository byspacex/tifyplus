import { comparePlaylists, createMergePlan, planArtistSpacedOrder, planDurationBuckets } from '../rules/library-rules.js';
import { createOperation, readOperations, recoverInterruptedOperations, writeOperations } from '../operations/journal.js';
import { executePlaylistAddOperation, undoPlaylistAddOperation } from '../operations/spotify-executor.js';

const COPY = {
  tr: {
    kicker:'AKILLI ASİSTAN · KURAL TABANLI', title:'Listeleri karşılaştır ve düzenle', subtitle:'Kuralları seç, sonucu incele; Spotify listen değişmeden önce sen onayla.', local:'Harici AI yok · Spotify içeriği modele gönderilmez',
    sources:'Kaynak listeleri', sourcesHelp:'Karşılaştırmak için en az iki liste, diğer işlemler için bir liste seç.', actions:'Bir işlem seç', actionsHelp:'Önce sonuç hazırlanır. Spotify’a yalnızca onayladığında yazılır.',
    compare:'Karşılaştır', compareHelp:'Ortakları ve listeye özgü parçaları gör', merge:'Yeni listede birleştir', mergeHelp:'Kaynakları koru, sıralarını takip et', split:'Süreye göre böl', splitHelp:'Bir listeyi hedef süreli parçalara ayır',
    order:'Sanatçı aralığı kur', orderHelp:'Aynı sanatçının art arda gelmesini azalt', mergeName:'Yeni listenin adı', targetMinutes:'Bölüm başına hedef dakika', pinnedFirst:'Sıralamada sabitlenecek ilk parça sayısı',
    dedupe:'Birleştirirken aynı Spotify kaydını bir kez ekle', private:'Yeni listeyi gizli oluştur', preview:'ÖNİZLEME', view:'Görünüm', apply:'Spotify’da uygula', undo:'Bu işlemi geri al', close:'Kapat', previous:'Önceki', next:'Sonraki', history:'Son işlemler',
    common:'Ortak parçalar', onlyPrefix:'Yalnızca: ', unverified:'Kimliği doğrulanamayan', toAdd:'Eklenecek', skipped:'Atlananlar', segmentPrefix:'Bölüm ', ordered:'Yeni sıra', empty:'Bu görünümde parça yok.',
    selectTwo:'En az iki kaynak liste seç.', selectOne:'Bu işlem için tek liste seç.', connect:'Önce Spotify hesabını bağla.', noTracks:'Listelerde karşılaştırılabilir parça bulunamadı.',
    loading:'Listeler Spotify’dan güncel olarak okunuyor…', stale:'Liste okunurken değişti. Yeniden önizleme hazırla.', mismatch:'Spotify tüm liste girişlerini döndürmedi; eksik veriyle işlem yapılmadı.',
    summaryCompare:(common, unique, unknown) => common + ' ortak Spotify kaydı · ' + unique + ' listeye özgü kayıt · ' + unknown + ' kimliği doğrulanamayan giriş',
    summaryMerge:(add, skip, unknown) => add + ' kayıt eklenecek · ' + skip + ' tekrar atlanacak · ' + unknown + ' yerel veya desteklenmeyen giriş dışarıda',
    summarySplit:(count, unknown, oversized) => count + ' bölüm hazır · ' + unknown + ' süresi bilinmiyor · ' + oversized + ' hedef süreden uzun',
    summaryOrder:(count, violations) => count + ' kayıt yeniden sıralandı · ' + violations + ' yerde sanatçı aralığı kuralı sağlanamadı',
    totalPage:(from, to, total, page, pages) => from + '–' + to + ' / ' + total + ' · Sayfa ' + page + '/' + pages,
    added:'Spotify listesi oluşturuldu ve parçalar eklendi.', partial:'İşlem kısmi kaldı; geçmişte tamamlanan ve bekleyen adımlar gösteriliyor.', unknown:'Spotify yanıtı kayboldu. Yinelenme riskine karşı ekleme otomatik tekrarlanmadı; Spotify listesini kontrol et.',
    undone:'Eklenen parçalar geri alındı. Oluşturulan liste Spotify’da boş olarak kaldı.', confirmUndo:'Bu işlemle oluşturulan listedeki eklenen parçalar Spotify’dan kaldırılacak. Liste Spotify’da boş kalır. Devam edilsin?',
    conflict:'Liste işlemden sonra değişmiş. Başka değişiklikleri ezmemek için geri alma durduruldu.', noHistory:'Bu Spotify hesabı için henüz işlem kaydı yok.',
    nameDefault:'Tify Plus Mix', playlistSuffix:'Bölüm ', titleCompare:'Liste karşılaştırması', titleMerge:'Birleştirme önizlemesi', titleSplit:'Süreye göre bölme', titleOrder:'Yeni sıra önizlemesi',
    playlistCreateError:'Yeni Spotify listesi oluşturulamadı.', invalidDuration:'Hedef süre 10–600 dakika arasında olmalı.', writeError:'İşlem kaydı kaydedilemedi; Spotify’da değişiklik yapılmadı.',
    emptyDuration:'Hedef süreye sığan kayıt yok.', unknownUndo:'Geri alma yanıtı kayboldu. Yeniden denemeden önce Spotify listesini kontrol et.', failedUndo:'Geri alma tamamlanmadı. Kalan kayıtlar işlem geçmişinde tutuluyor.', retry:'Başarısız eklemeleri yeniden dene', retryDone:'Başarısız kalan kayıtlar yeniden gönderildi.', interrupted:'Sekme işlem sırasında kapandı. Belirsiz adımlar tekrar gönderilmedi; Spotify’ı kontrol edin.', personalTitle:'Kişisel düzen ve tarifler', personalHelp:'Etiket ve notlar bu tarayıcıda, bağlı hesaba özel saklanır. Otomatik tür veya ruh hâli tahmini yapılmaz.', tagsLabel:'Seçili listelerin etiketleri (virgülle ayırın)', notesLabel:'Liste notu', recipeName:'Tarif adı', recipeAction:'Tarif işlemi', savePersonal:'Etiket ve notları kaydet', saveRecipe:'Tarifi kaydet', noSelection:'Önce bir veya daha fazla kaynak liste seçin.', saved:'Bu tarayıcıdaki hesaba özel düzen kaydedildi.', recipeSaved:'Tarif kaydedildi; çalıştırılınca Spotify verisi yeniden okunup yeni önizleme oluşturulur.', filterTags:'Etiket veya liste adıyla filtrele'
  },
  en: {
    kicker:'SMART ASSISTANT · RULE-BASED', title:'Compare and organize playlists', subtitle:'Choose rules, review the result, and approve before Spotify changes.', local:'No external AI · Spotify content is never sent to a model',
    sources:'Source playlists', sourcesHelp:'Choose at least two for comparison, or one for the other tools.', actions:'Choose an action', actionsHelp:'Results are prepared first. Spotify is only changed after approval.',
    compare:'Compare playlists', compareHelp:'See shared and playlist-specific tracks', merge:'Merge into a new playlist', mergeHelp:'Keep sources and follow their order', split:'Split by duration', splitHelp:'Divide one playlist into target-length sets',
    order:'Space out artists', orderHelp:'Reduce consecutive tracks by one artist', mergeName:'New playlist name', targetMinutes:'Target minutes per set', pinnedFirst:'Keep the first tracks in place',
    dedupe:'Add each Spotify recording once', private:'Create the new playlist as private', preview:'PREVIEW', view:'View', apply:'Apply to Spotify', undo:'Undo this operation', close:'Close', previous:'Previous', next:'Next', history:'Recent operations',
    common:'Shared tracks', onlyPrefix:'Only in: ', unverified:'Unverified identity', toAdd:'To add', skipped:'Skipped', segmentPrefix:'Set ', ordered:'New order', empty:'No tracks in this view.',
    selectTwo:'Select at least two source playlists.', selectOne:'Select one playlist for this action.', connect:'Connect your Spotify account first.', noTracks:'No comparable tracks were found.',
    loading:'Reading the latest playlists from Spotify…', stale:'A playlist changed while it was being read. Prepare a new preview.', mismatch:'Spotify did not return every playlist entry; no partial-data operation was prepared.',
    summaryCompare:(common, unique, unknown) => common + ' shared Spotify recordings · ' + unique + ' playlist-specific recordings · ' + unknown + ' unverified entries',
    summaryMerge:(add, skip, unknown) => add + ' recordings will be added · ' + skip + ' repeats skipped · ' + unknown + ' local or unsupported entries excluded',
    summarySplit:(count, unknown, oversized) => count + ' sets ready · ' + unknown + ' durations unknown · ' + oversized + ' tracks longer than the target',
    summaryOrder:(count, violations) => count + ' tracks reordered · artist spacing could not be met at ' + violations + ' positions',
    totalPage:(from, to, total, page, pages) => from + '–' + to + ' / ' + total + ' · Page ' + page + '/' + pages,
    added:'Spotify playlist created and tracks added.', partial:'Operation is partial; completed and pending steps are recorded in history.', unknown:'Spotify response was lost. The add was not retried to avoid duplicates; check the playlist in Spotify.',
    undone:'Added tracks were removed. The created playlist remains empty in Spotify.', confirmUndo:'This removes the tracks added by this operation. The created playlist will remain empty in Spotify. Continue?',
    conflict:'The playlist changed after this operation. Undo stopped to protect later edits.', noHistory:'No operations recorded for this Spotify account yet.',
    nameDefault:'Tify Plus Mix', playlistSuffix:'Set ', titleCompare:'Playlist comparison', titleMerge:'Merge preview', titleSplit:'Duration split preview', titleOrder:'Reordered playlist preview',
    playlistCreateError:'Could not create a new Spotify playlist.', invalidDuration:'Target duration must be between 10 and 600 minutes.', writeError:'Could not save the operation record; Spotify was not changed.',
    emptyDuration:'No tracks fit within the target duration.', unknownUndo:'Undo response was lost. Inspect the Spotify playlist before trying again.', failedUndo:'Undo is incomplete. Remaining entries are recorded in operation history.', retry:'Retry failed additions', retryDone:'Failed entries were submitted again.', interrupted:'The tab closed during an operation. Uncertain steps were not retried; check Spotify.', personalTitle:'Personal organization and recipes', personalHelp:'Tags and notes stay in this browser, scoped to the connected account. No genre or mood is guessed.', tagsLabel:'Tags for selected playlists (comma separated)', notesLabel:'Playlist note', recipeName:'Recipe name', recipeAction:'Recipe action', savePersonal:'Save tags and notes', saveRecipe:'Save recipe', noSelection:'Select one or more source playlists first.', saved:'Personal details saved for this account in this browser.', recipeSaved:'Recipe saved. Running it reads fresh Spotify data and prepares a new preview.', filterTags:'Filter by playlist name or tag'
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

export function initializeLibraryWorkbench(dependencies) {
  const {
    state, getLanguage, getToken, getPlaylistDetails, getPlaylistTracks, createResponseError,
    allowsFunctionalStorage, showLoader, showToast, renderPlaylists, buildPresence,
    saveTrackCache, saveLibraryCache
  } = dependencies;
  const $ = id => document.getElementById(id);
  const sourceList = $('workbenchSourceList');
  const resultPanel = $('workbenchResultPanel');
  const resultMode = $('workbenchResultMode');
  const resultRows = $('workbenchResultRows');
  const resultSummary = $('workbenchResultSummary');
  const historyList = $('workbenchHistoryList');
  const applyButton = $('btnWorkbenchApply');
  const undoButton = $('btnWorkbenchUndo');
  let views = {};
  let plan = null;
  let page = 0;
  let applying = false;
  let shownOperationId = null;
  let undoOperationIds = [];
  let operationGroupId = null;

  const text = key => (COPY[getLanguage()] || COPY.en)[key] ?? COPY.en[key] ?? key;
  const storage = () => allowsFunctionalStorage() ? localStorage : sessionStorage;

  function saveOperation(operation) {
    const store = storage();
    const operations = readOperations(store, state.userId);
    const index = operations.findIndex(item => item.id === operation.id);
    if (index >= 0) operations[index] = operation;
    else operations.unshift(operation);
    const result = writeOperations(store, state.userId, operations);
    if (result) renderHistory();
    return result;
  }

  function personalKey() { return 'tify.workbench.personal.v1.' + encodeURIComponent(state.userId || 'anonymous'); }
  function readPersonal() {
    try { return JSON.parse(storage().getItem(personalKey()) || '{"playlists":{},"recipes":[]}'); }
    catch { return { playlists: {}, recipes: [] }; }
  }
  function writePersonal(value) {
    try { storage().setItem(personalKey(), JSON.stringify(value)); return true; }
    catch { showToast(text('writeError'), 'warning'); return false; }
  }
  function renderPersonal() {
    const data = readPersonal();
    const selected = selectedPlaylists();
    const personal = selected.length === 1 ? data.playlists[selected[0].id] || {} : {};
    $('workbenchTags').value = (personal.tags || []).join(', ');
    $('workbenchNote').value = personal.note || '';
    $('workbenchRecipes').innerHTML = (data.recipes || []).map(recipe =>
      '<span class="workbench-recipe-chip"><button type="button" data-run-recipe="' + escapeHtml(recipe.id) + '">' + escapeHtml(recipe.name) + ' · ' + escapeHtml(recipe.action) + '</button><button type="button" data-delete-recipe="' + escapeHtml(recipe.id) + '" aria-label="' + escapeHtml(text('close')) + '">×</button></span>').join('');
  }

  function renderSources() {
    if (!sourceList) return;
    const checked = new Set(Array.from(sourceList.querySelectorAll('input:checked')).map(input => input.value));
    const personalData = readPersonal();
    sourceList.innerHTML = state.playlists.map(playlist => {
      const tags = personalData.playlists?.[playlist.id]?.tags || [];
      return '<label class="workbench-source-option"><input type="checkbox" value="' + escapeHtml(playlist.id) + '" aria-label="' + escapeHtml(playlist.name) + '">' +
      '<img src="' + escapeHtml(playlist.cover || '') + '" alt=""><span><strong>' + escapeHtml(playlist.name) +
      '</strong><small>' + escapeHtml([playlist.owner, tags.join(' · ')].filter(Boolean).join(' · ')) + '</small></span><span class="workbench-source-count">' +
      (Number(playlist.trackTotal) || 0) + '</span></label>'; }).join('') ||
      '<p class="workbench-status">' + (state.isLoggedIn ? text('noTracks') : text('connect')) + '</p>';
    sourceList.querySelectorAll('input').forEach(input => { input.checked = checked.has(input.value); });
    const status = $('workbenchSourceStatus');
    if (status) status.textContent = state.playlists.length
      ? state.playlists.length + ' ' + text('sources').toLocaleLowerCase()
      : '';
    renderHistory();
    renderPersonal();
  }

  function selectedPlaylists() {
    const selected = new Set(Array.from(sourceList.querySelectorAll('input:checked')).map(input => input.value));
    return state.playlists.filter(playlist => selected.has(String(playlist.id)));
  }

  async function readFreshPlaylist(playlist, token) {
    const first = await getPlaylistDetails(token, playlist.id);
    const tracks = await getPlaylistTracks(token, playlist.id);
    const last = await getPlaylistDetails(token, playlist.id);
    if (first.snapshot_id && last.snapshot_id && first.snapshot_id !== last.snapshot_id) throw new Error(text('stale'));
    const total = first.items?.total ?? first.tracks?.total ?? playlist.trackTotal ?? 0;
    if (total > tracks.length) throw new Error(text('mismatch'));
    return { ...playlist, tracks, tracksLoaded: true, snapshotId: last.snapshot_id || first.snapshot_id || null, trackTotal: total || tracks.length };
  }

  function renderResultRows() {
    const rows = views[resultMode.value]?.rows || [];
    const size = 50;
    const pages = Math.max(1, Math.ceil(rows.length / size));
    page = Math.min(page, pages - 1);
    const start = page * size;
    resultRows.innerHTML = rows.slice(start, start + size).map(row =>
      '<div class="workbench-result-row"><img src="' + escapeHtml(row.track?.cover || '') + '" alt="">' +
      '<span><strong>' + escapeHtml(row.track?.title || '—') + '</strong><small>' + escapeHtml(row.track?.artist || '') + '</small></span>' +
      '<small>' + escapeHtml(row.track?.album || '') + '</small><em>' + escapeHtml(row.location || '') + '</em></div>').join('') ||
      '<p class="workbench-status">' + text('empty') + '</p>';
    $('workbenchPageStatus').textContent = text('totalPage')(rows.length ? start + 1 : 0, Math.min(start + size, rows.length), rows.length, page + 1, pages);
    $('btnWorkbenchPrev').disabled = page <= 0;
    $('btnWorkbenchNext').disabled = page >= pages - 1;
  }

  function showPlan({ title, summary, nextViews, actions = [], sources = [], rules = {}, canApply = false }) {
    plan = { actions, sources, rules };
    operationGroupId = 'group_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36));
    undoOperationIds = [];
    $('workbenchResultTitle').textContent = title;
    resultSummary.textContent = summary;
    views = nextViews;
    resultMode.innerHTML = Object.entries(views).map(([key, value]) =>
      '<option value="' + escapeHtml(key) + '">' + escapeHtml(value.label) + '</option>').join('');
    page = 0;
    resultPanel.classList.remove('hidden');
    applyButton.disabled = !canApply || !actions.length;
    undoButton.classList.add('hidden');
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    renderResultRows();
  }

  async function prepare(kind) {
    if (applying) return;
    if (!state.accessToken || !state.userId) { showToast(text('connect'), 'warning'); return; }
    const selected = selectedPlaylists();
    const validCount = kind === 'compare' || kind === 'merge' ? selected.length >= 2 : selected.length === 1;
    if (!validCount) { showToast(text(kind === 'compare' || kind === 'merge' ? 'selectTwo' : 'selectOne'), 'warning'); return; }
    showLoader(true, text('loading'), 20);
    const fresh = [];
    try {
      const token = await getToken();
      for (let index = 0; index < selected.length; index++) {
        showLoader(true, text('loading') + ' ' + (index + 1) + '/' + selected.length, 20 + Math.round(index / selected.length * 60));
        fresh.push(await readFreshPlaylist(selected[index], token));
      }
    } catch (error) {
      showToast(error.message || text('mismatch'), 'warning');
      showLoader(false);
      return;
    }
    showLoader(false);
    const comparison = comparePlaylists(fresh);
    const sources = fresh.map(playlist => ({ id: playlist.id, name: playlist.name, snapshotId: playlist.snapshotId }));
    if (kind === 'compare') {
      const nextViews = {
        common: {
          label: text('common'),
          rows: comparison.common.map(record => {
            const locations = [...new Set(record.occurrences.map(item => item.playlist.name))].join(' · ');
            return { track: record.track, location: locations };
          })
        }
      };
      comparison.byPlaylist.forEach(({ playlist, onlyHere }) => {
        nextViews['only:' + playlist.id] = { label: text('onlyPrefix') + playlist.name, rows: onlyHere.map(record => ({ track: record.track, location: playlist.name })) };
      });
      nextViews.unverified = { label: text('unverified'), rows: comparison.unverifiable.map(item => ({ track: item.track, location: item.playlist.name })) };
      showPlan({
        title: text('titleCompare'),
        summary: text('summaryCompare')(comparison.common.length, comparison.unique.length, comparison.unverifiable.length),
        nextViews, sources, canApply: false
      });
      return;
    }
    if (kind === 'merge') {
      const deduplicate = $('workbenchDedupe').checked;
      const merge = createMergePlan(fresh, { deduplicate });
      const supported = merge.items.filter(item => /^spotify:track:[A-Za-z0-9]+$/.test(item.track.uri || '') && !item.track.isLocal);
      const excluded = merge.items.filter(item => !supported.includes(item));
      const skipped = [...merge.skipped, ...excluded.map(item => ({ ...item, reason: 'unsupported' }))];
      const name = $('workbenchMergeName').value.trim() || text('nameDefault');
      showPlan({
        title: text('titleMerge'),
        summary: text('summaryMerge')(supported.length, merge.skipped.length, excluded.length),
        nextViews: {
          add: { label: text('toAdd'), rows: supported.map(item => ({ track: item.track, location: item.source.name })) },
          skipped: { label: text('skipped'), rows: skipped.map(item => ({ track: item.track, location: item.reason === 'duplicate' ? item.source.name + ' · repeat' : item.source.name + ' · unsupported' })) },
          unverified: { label: text('unverified'), rows: comparison.unverifiable.map(item => ({ track: item.track, location: item.playlist.name })) }
        },
        actions: supported.length ? [{ name, items: supported }] : [],
        sources, rules: { deduplicate, name, private: $('workbenchPrivate').checked }, canApply: supported.length > 0
      });
      return;
    }
    if (kind === 'split') {
      const minutes = Number($('workbenchTargetMinutes').value);
      if (!Number.isFinite(minutes) || minutes < 10 || minutes > 600) { showToast(text('invalidDuration'), 'warning'); return; }
      const result = planDurationBuckets(fresh[0].tracks.filter(track => /^spotify:track:[A-Za-z0-9]+$/.test(track.uri || '') && !track.isLocal), minutes);
      const nextViews = {};
      result.buckets.forEach((bucket, index) => {
        nextViews['bucket:' + index] = {
          label: text('segmentPrefix') + (index + 1) + ' · ' + Math.floor(bucket.durationMs / 60000) + ' min',
          rows: bucket.items.map(item => ({ track: item.track, location: fresh[0].name }))
        };
      });
      nextViews.unknown = { label: text('unverified'), rows: result.unknown.map(item => ({ track: item.track, location: fresh[0].name })) };
      const actions = result.buckets.map((bucket, index) => ({
        name: text('playlistSuffix') + (index + 1) + ' — ' + fresh[0].name,
        items: bucket.items.map(item => ({ track: item.track, source: fresh[0] }))
      }));
      showPlan({
        title: text('titleSplit'), summary: text('summarySplit')(result.buckets.length, result.unknown.length, result.oversized.length),
        nextViews, actions, sources,
        rules: { targetMinutes: minutes, sourcePlaylistId: fresh[0].id, private: $('workbenchPrivate').checked },
        canApply: actions.length > 0
      });
      return;
    }
    if (kind === 'order') {
      const requestedPins = Math.max(0, Math.min(50, Number($('workbenchPinnedFirst').value) || 0));
      const eligible = fresh[0].tracks.filter(track => /^spotify:track:[A-Za-z0-9]+$/.test(track.uri || '') && !track.isLocal);
      const pins = Object.fromEntries(Array.from({ length: Math.min(requestedPins, eligible.length) }, (_, index) => [index, index]));
      const sorted = planArtistSpacedOrder(eligible, { pinned: pins });
      const ordered = sorted.tracks.filter(Boolean);
      if (!ordered.length) { showToast(text('noTracks'), 'warning'); return; }
      showPlan({
        title: text('titleOrder'), summary: text('summaryOrder')(ordered.length, sorted.violations.length),
        nextViews: { order: { label: text('ordered'), rows: ordered.map(track => ({ track, location: track.artist })) } },
        actions: [{ name: fresh[0].name + ' — Tify Plus', items: ordered.map(track => ({ track, source: fresh[0] })) }],
        sources, rules: { maxConsecutive: 1, pinnedFirst: requestedPins, sourcePlaylistId: fresh[0].id, private: $('workbenchPrivate').checked },
        canApply: true
      });
    }
  }

  async function applyPlan() {
    if (applying || !plan?.actions?.length) return;
    applying = true;
    applyButton.disabled = true;
    $('btnWorkbenchClose').disabled = true;
    let completed = 0;
    try {
      const token = await getToken();
      for (const action of plan.actions) {
        const operation = createOperation({
          type: plan.rules.sourcePlaylistId ? 'playlist-transform' : 'merge',
          userId: state.userId, sourcePlaylists: plan.sources,
          rules: { ...plan.rules, targetName: action.name, batchId: operationGroupId },
          items: action.items.map(item => ({ uri: item.track.uri, track: item.track, source: item.source || null }))
        });
        operation.status = 'applying';
        if (!saveOperation(operation)) throw new Error(text('writeError'));
        shownOperationId = operation.id;
        showLoader(true, text('loading'), 35);
        let response;
        try {
          response = await fetch('https://api.spotify.com/v1/me/playlists', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: action.name, public: !plan.rules.private,
              description: 'Created with Tify Plus. Source playlists are unchanged.'
            })
          });
        } catch (error) {
          operation.status = 'unknown'; operation.error = error?.message || 'network_unknown';
          saveOperation(operation);
          resultSummary.textContent = text('unknown');
          undoButton.classList.add('hidden');
          return;
        }
        if (!response.ok) {
          const error = await createResponseError(response, text('playlistCreateError'));
          operation.status = 'failed'; operation.error = error.message;
          saveOperation(operation);
          throw error;
        }
        const created = await response.json();
        operation.targetPlaylistId = created.id;
        operation.targetPlaylistName = created.name || action.name;
        operation.latestSnapshotId = created.snapshot_id || null;
        if (!saveOperation(operation)) { showToast(text('writeError'), 'warning'); return; }
        const result = await executePlaylistAddOperation({
          operation, playlistId: created.id, token, persist: saveOperation
        });
        if (result.results.added.length && !undoOperationIds.includes(result.id)) undoOperationIds.push(result.id);
        let target = state.playlists.find(playlist => playlist.id === created.id);
        if (!target) {
          target = {
            id: created.id, name: created.name || action.name, owner: state.userName, ownerId: state.userId,
            isEditable: true, isCollaborative: false, isPrivate: !!plan.rules.private, url: created.external_urls?.spotify || 'https://open.spotify.com/playlist/' + created.id,
            cover: '', description: created.description || '', trackTotal: 0, tracks: [], tracksLoaded: true
          };
          state.playlists.unshift(target);
        }
        const addedUris = new Set(result.results.added.map(item => item.uri));
        target.tracks = action.items.filter(item => addedUris.has(item.track.uri)).map(item => item.track);
        target.trackTotal = target.tracks.length;
        target.tracksLoaded = result.status === 'completed';
        saveTrackCache(target.id, target.tracks);
        buildPresence();
        saveLibraryCache(state.playlists);
        renderPlaylists();
        completed += result.status === 'completed' ? 1 : 0;
        if (result.status !== 'completed') {
          resultSummary.textContent = result.items.some(item => item.status === 'unknown') ? text('unknown') : text('partial');
          undoButton.classList.toggle('hidden', !['available', 'failed'].includes(result.undo.status));
          break;
        }
      }
      if (completed === plan.actions.length) {
        resultSummary.textContent = text('added');
        plan.actions = [];
        renderPlaylists();
        undoButton.classList.toggle('hidden', !undoOperationIds.length);
      }
    } catch (error) {
      resultSummary.textContent = error.message || text('partial');
      showToast(error.message || text('partial'), 'warning');
    } finally {
      showLoader(false);
      applyButton.disabled = !plan?.actions?.length;
      $('btnWorkbenchClose').disabled = false;
      applying = false;
      renderHistory();
    }
  }

  async function undoOperation(operationId) {
    if (applying) return;
    const allOperations = readOperations(storage(), state.userId);
    const selectedOperation = allOperations.find(item => item.id === operationId);
    if (!selectedOperation?.results?.added?.length) return;
    const related = selectedOperation.rules?.batchId
      ? allOperations.filter(item => item.rules?.batchId === selectedOperation.rules.batchId && item.results?.added?.length && item.undo?.status !== 'undone')
      : [selectedOperation];
    if (!window.confirm(text('confirmUndo'))) return;
    applying = true;
    undoButton.disabled = true;
    try {
      const token = await getToken();
      let conflict = false, unknown = false, incomplete = false;
      for (const operation of related) {
        const result = await undoPlaylistAddOperation({
          operation, token,
          getSnapshotId: async playlistId => (await getPlaylistDetails(token, playlistId)).snapshot_id || null,
          persist: saveOperation
        });
        if (result.undo.status === 'undone') {
          const target = state.playlists.find(item => item.id === result.targetPlaylistId);
          if (target) { target.tracks = []; target.trackTotal = 0; target.tracksLoaded = true; saveTrackCache(target.id, []); }
        } else if (result.undo.status === 'conflict') conflict = true;
        else if (result.undo.status === 'unknown' || result.undo.status === 'review_required') unknown = true;
        else incomplete = true;
      }
      buildPresence(); saveLibraryCache(state.playlists); renderPlaylists();
      if (unknown) resultSummary.textContent = text('unknownUndo');
      else if (conflict) resultSummary.textContent = text('conflict');
      else if (incomplete) resultSummary.textContent = text('failedUndo');
      else resultSummary.textContent = text('undone');
      const refreshed = readOperations(storage(), state.userId);
      undoButton.classList.toggle('hidden', !related.some(item => {
        const latest = refreshed.find(entry => entry.id === item.id);
        return latest?.results?.added?.length && ['available', 'failed'].includes(latest.undo?.status);
      }));
    } catch (error) {
      resultSummary.textContent = error.message || text('conflict');
    } finally {
      undoButton.disabled = false;
      applying = false;
      renderHistory();
    }
  }

  function renderHistory() {
    if (!historyList) return;
    const store = storage();
    const all = readOperations(store, state.userId);
    const recovery = recoverInterruptedOperations(all);
    if (recovery.changed) writeOperations(store, state.userId, recovery.operations);
    const operations = recovery.operations.slice(0, 8);
    historyList.innerHTML = operations.map(operation =>
      '<div class="workbench-history-item"><span><strong>' + escapeHtml(operation.rules?.targetName || operation.type) +
      '</strong><small>' + escapeHtml(operation.status) + ' · ' + escapeHtml(new Date(operation.updatedAt).toLocaleString(getLanguage())) +
      '</small></span>' + (operation.items?.some(item => item.status === 'failed') && operation.targetPlaylistId
        ? '<button class="btn btn-secondary btn-sm" type="button" data-workbench-retry="' + escapeHtml(operation.id) + '">' + escapeHtml(text('retry')) + '</button>'
        : '') + (operation.results?.added?.length && ['available', 'failed'].includes(operation.undo?.status)
        ? '<button class="btn btn-secondary btn-sm" type="button" data-workbench-undo="' + escapeHtml(operation.id) + '">' + escapeHtml(text('undo')) + '</button>'
        : '') + '</div>').join('') ||
      '<p class="workbench-status">' + text('noHistory') + '</p>';
  }

  async function retryFailed(operationId) {
    if (applying) return;
    const operation = readOperations(storage(), state.userId).find(item => item.id === operationId);
    if (!operation?.targetPlaylistId || operation.items.some(item => item.status === 'unknown')) return;
    const failed = operation.items.filter(item => item.status === 'failed');
    if (!failed.length) return;
    applying = true;
    try {
      operation.items = operation.items.map(item => item.status === 'failed' ? { ...item, status: 'pending', error: null } : item);
      operation.results.failed = operation.results.failed.filter(item => !failed.some(candidate => candidate.uri === item.uri));
      operation.status = 'applying';
      if (!saveOperation(operation)) throw new Error(text('writeError'));
      const token = await getToken();
      const result = await executePlaylistAddOperation({ operation, playlistId: operation.targetPlaylistId, token, persist: saveOperation });
      shownOperationId = result.id;
      const target = state.playlists.find(item => item.id === result.targetPlaylistId);
      if (target) {
        const present = new Set(target.tracks.map(track => track.uri));
        const added = result.results.added.map(item => item.uri).filter(uri => !present.has(uri));
        const tracks = result.items.filter(item => added.includes(item.uri)).map(item => item.track).filter(Boolean);
        target.tracks = [...target.tracks, ...tracks];
        target.trackTotal = Math.max(target.trackTotal || 0, target.tracks.length);
        target.tracksLoaded = result.status === 'completed';
        saveTrackCache(target.id, target.tracks);
        buildPresence(); saveLibraryCache(state.playlists); renderPlaylists();
      }
      resultSummary.textContent = result.items.some(item => item.status === 'unknown') ? text('unknown') : result.status === 'completed' ? text('retryDone') : text('partial');
      undoButton.classList.toggle('hidden', !['available', 'failed'].includes(result.undo?.status));
    } catch (error) {
      resultSummary.textContent = error.message || text('partial');
    } finally {
      applying = false;
      renderHistory();
    }
  }

  function renderCopy() {
    const copy = COPY[getLanguage()] || COPY.en;
    document.querySelectorAll('[data-workbench-copy]').forEach(node => {
      const value = copy[node.dataset.workbenchCopy];
      if (typeof value === 'string') node.textContent = value;
    });
    const action = $('workbenchRecipeAction');
    if (action) action.innerHTML = getLanguage() === 'tr'
      ? '<option value="merge">Birleştir</option><option value="compare">Karşılaştır</option><option value="split">Süreye göre böl</option><option value="order">Sanatçı aralığı</option>'
      : '<option value="merge">Merge</option><option value="compare">Compare</option><option value="split">Split by duration</option><option value="order">Space artists</option>';
    renderSources();
    renderPersonal();
    if (plan) renderResultRows();
  }

  sourceList?.addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const count = sourceList.querySelectorAll('input:checked').length;
    $('workbenchSourceStatus').textContent = count + ' / ' + state.playlists.length + ' ' + text('sources').toLocaleLowerCase();
    $('workbenchMergeName').value = count ? text('nameDefault') : '';
    renderPersonal();
  });
  $('btnWorkbenchCompare').addEventListener('click', () => prepare('compare'));
  $('workbenchSourceFilter').addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase(getLanguage());
    sourceList.querySelectorAll('.workbench-source-option').forEach(option => { option.hidden = !option.textContent.toLocaleLowerCase(getLanguage()).includes(query); });
  });
  $('btnWorkbenchMerge').addEventListener('click', () => prepare('merge'));
  $('btnWorkbenchSplit').addEventListener('click', () => prepare('split'));
  $('btnWorkbenchOrder').addEventListener('click', () => prepare('order'));
  applyButton.addEventListener('click', applyPlan);
  undoButton.addEventListener('click', () => shownOperationId && undoOperation(shownOperationId));
  resultMode.addEventListener('change', () => { page = 0; renderResultRows(); });
  $('btnWorkbenchPrev').addEventListener('click', () => { page = Math.max(0, page - 1); renderResultRows(); });
  $('btnWorkbenchNext').addEventListener('click', () => { page++; renderResultRows(); });
  $('btnWorkbenchClose').addEventListener('click', () => {
    if (applying) return;
    resultPanel.classList.add('hidden');
    plan = null;
  });
  historyList?.addEventListener('click', event => {
    const retryButton = event.target.closest('[data-workbench-retry]');
    if (retryButton) {
      shownOperationId = retryButton.dataset.workbenchRetry;
      resultPanel.classList.remove('hidden');
      resultRows.innerHTML = '';
      resultSummary.textContent = text('retry');
      undoButton.classList.add('hidden');
      applyButton.disabled = true;
      retryFailed(shownOperationId);
      return;
    }
    const button = event.target.closest('[data-workbench-undo]');
    if (!button) return;
    shownOperationId = button.dataset.workbenchUndo;
    const operation = readOperations(storage(), state.userId).find(item => item.id === shownOperationId);
    resultPanel.classList.remove('hidden');
    resultRows.innerHTML = '';
    resultSummary.textContent = operation?.targetPlaylistName || text('confirmUndo');
    undoButton.classList.remove('hidden');
    applyButton.disabled = true;
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('btnWorkbenchSavePersonal').addEventListener('click', () => {
    const selected = selectedPlaylists();
    if (!selected.length) { showToast(text('noSelection'), 'warning'); return; }
    const data = readPersonal();
    const tags = [...new Set($('workbenchTags').value.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 20);
    selected.forEach(playlist => { data.playlists[playlist.id] = { ...(data.playlists[playlist.id] || {}), tags, note: $('workbenchNote').value.trim().slice(0, 240), protected: data.playlists[playlist.id]?.protected || false }; });
    if (writePersonal(data)) { renderSources(); showToast(text('saved'), 'success'); }
  });
  $('btnWorkbenchSaveRecipe').addEventListener('click', () => {
    const selected = selectedPlaylists();
    if (!selected.length) { showToast(text('noSelection'), 'warning'); return; }
    const name = $('workbenchRecipeName').value.trim();
    if (!name) { $('workbenchRecipeName').focus(); return; }
    const data = readPersonal();
    data.recipes.unshift({ id: 'recipe_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)), name, action: $('workbenchRecipeAction').value, sourceIds: selected.map(playlist => playlist.id), options: { deduplicate: $('workbenchDedupe').checked, isPrivate: $('workbenchPrivate').checked, targetMinutes: Number($('workbenchTargetMinutes').value), pinnedFirst: Number($('workbenchPinnedFirst').value) || 0 }, createdAt: new Date().toISOString() });
    data.recipes = data.recipes.slice(0, 20);
    if (writePersonal(data)) { renderPersonal(); showToast(text('recipeSaved'), 'success'); }
  });
  $('workbenchRecipes').addEventListener('click', event => {
    const run = event.target.closest('[data-run-recipe]');
    const remove = event.target.closest('[data-delete-recipe]');
    const data = readPersonal();
    if (remove) { data.recipes = data.recipes.filter(recipe => recipe.id !== remove.dataset.deleteRecipe); writePersonal(data); renderPersonal(); return; }
    if (!run) return;
    const recipe = data.recipes.find(item => item.id === run.dataset.runRecipe);
    if (!recipe) return;
    const available = new Set(state.playlists.map(item => String(item.id)));
    const sourceIds = recipe.sourceIds.map(String).filter(id => available.has(id));
    sourceList.querySelectorAll('input').forEach(input => { input.checked = sourceIds.includes(input.value); });
    $('workbenchDedupe').checked = !!recipe.options.deduplicate;
    $('workbenchPrivate').checked = !!recipe.options.isPrivate;
    $('workbenchTargetMinutes').value = recipe.options.targetMinutes;
    $('workbenchPinnedFirst').value = recipe.options.pinnedFirst;
    renderPersonal();
    prepare(recipe.action);
  });
  document.addEventListener('tify:languagechange', renderCopy);
  document.addEventListener('tify:librarychange', renderSources);
  renderCopy();
}
