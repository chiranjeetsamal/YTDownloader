const appState = {
  settings: null,
  metadata: null,
  queue: [],
  formatSelection: {
    mode: 'video-audio',
    videoQuality: 'best',
    audioFormat: 'best',
    container: 'mp4'
  }
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function ensureRendererComponents() {
  if (!window.FormatSelector) {
    window.FormatSelector = {
      escapeHtml,
      read: () => ({
        mode: $('#modeSelect')?.value || 'video-audio',
        videoQuality: $('#videoQuality')?.value || 'best',
        videoFormatId: $('#videoFormatId')?.value || '',
        audioFormatId: $('#audioFormatId')?.value || '',
        audioFormat: $('#audioFormat')?.value || 'best',
        container: $('#containerSelect')?.value || 'mp4',
        editingPreset: Boolean($('#editingPreset')?.checked)
      }),
      render: () => '<div class="empty-state error-text">Format selector failed to load. Restart the app and try again.</div>'
    };
  }

  if (!window.DownloadCard) {
    window.DownloadCard = {
      render: (item) => `
        <article class="download-card" data-id="${escapeHtml(item.id)}">
          <div class="download-main">
            <div class="download-topline">
              <div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.selectedFormat || '')}</p>
              </div>
              <span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
            </div>
          </div>
          <div class="download-actions">
            <button data-action="start" ${item.status === 'queued' ? '' : 'disabled'}>Download</button>
            <button data-action="remove">Remove</button>
          </div>
        </article>
      `
    };
  }

  if (!window.SettingsPanel) {
    window.SettingsPanel = {
      render: (settings) => `
        <section class="panel">
          <h2>Settings</h2>
          <div class="folder-path">${escapeHtml(settings.downloadFolder || '')}</div>
          <p class="error-text">Settings panel failed to load. Restart the app and try again.</p>
        </section>
      `
    };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  ensureRendererComponents();
  bindNavigation();
  bindDownloader();
  bindQueueActions();
  appState.settings = await window.api.settings.get();
  applySettingsToForm();
  renderSettings();
  renderFolder();
  renderQueue(await window.api.queue.list());
  window.api.queue.onUpdated(renderQueue);
  checkFfmpegQuickly();
});

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
      button.classList.add('active');
      $(`#page-${button.dataset.page}`).classList.add('active');
    });
  });
}

function bindDownloader() {
  $('#pasteButton').addEventListener('click', async () => {
    $('#urlInput').value = await window.api.clipboard.readText();
  });

  $('#fetchButton').addEventListener('click', fetchFormats);
  $('#chooseFolderButton').addEventListener('click', chooseFolder);
  $('#addQueueButton').addEventListener('click', addCurrentToQueue);

  $('#templatePreset').addEventListener('change', () => {
    const preset = $('#templatePreset').value;
    if (preset !== 'custom') $('#filenameTemplate').value = preset;
    persistOutputSettings();
  });

  [
    '#filenameTemplate',
    '#restrictFilenames',
    '#overwriteFiles',
    '#downloadSubtitles',
    '#subtitleLanguage',
    '#embedSubtitles',
    '#downloadThumbnail',
    '#embedThumbnail',
    '#writeMetadata',
    '#sponsorBlock',
    '#speedLimit',
    '#normalizeAudio'
  ].forEach((selector) => {
    $(selector).addEventListener('change', persistOutputSettings);
  });
}

async function fetchFormats() {
  const url = $('#urlInput').value.trim();
  const message = $('#urlMessage');
  message.textContent = '';
  $('#fetchButton').disabled = true;
  $('#fetchButton').textContent = 'Fetching...';
  $('#addQueueButton').disabled = true;

  try {
    const valid = await window.api.metadata.validateUrl(url);
    if (!valid) throw new Error('Paste a valid YouTube video, Shorts, or playlist URL.');
    appState.metadata = await window.api.metadata.fetch(url, appState.settings);
    appState.formatSelection = {
      mode: 'video-audio',
      videoQuality: appState.settings.defaultVideoQuality,
      audioFormat: appState.settings.defaultAudioFormat,
      container: appState.settings.defaultContainer
    };
    renderMetadata();
    renderFormats();
    $('#addQueueButton').disabled = false;
  } catch (error) {
    message.textContent = error.message || 'Could not fetch video details.';
    message.classList.add('error-text');
  } finally {
    $('#fetchButton').disabled = false;
    $('#fetchButton').textContent = 'Fetch Formats';
  }
}

function renderMetadata() {
  const data = appState.metadata;
  $('#metadataPanel').innerHTML = `
    <div class="thumbnail-wrap">
      ${data.thumbnail ? `<img src="${window.FormatSelector.escapeHtml(data.thumbnail)}" alt="" />` : ''}
    </div>
    <div class="metadata-body">
      <span class="pill">${data.isPlaylist ? 'Playlist' : 'Single video'}</span>
      <h2>${window.FormatSelector.escapeHtml(data.title)}</h2>
      <p>${window.FormatSelector.escapeHtml(data.uploader || 'Unknown channel')}</p>
      <div class="metadata-facts">
        <span>${window.FormatSelector.escapeHtml(data.duration || 'Duration unavailable')}</span>
        <span>${data.isPlaylist ? `${data.playlistCount} videos` : '1 video'}</span>
      </div>
      ${data.isPlaylist ? renderPlaylistOptions(data) : ''}
    </div>
  `;
}

function renderPlaylistOptions(data) {
  const entries = data.playlistEntries.slice(0, 100).map((entry) => `
    <label class="playlist-row">
      <input type="checkbox" class="playlist-entry" value="${entry.index}" />
      <span>${entry.index}. ${window.FormatSelector.escapeHtml(entry.title)}</span>
    </label>
  `).join('');

  return `
    <div class="playlist-options">
      <label class="checkbox-line"><input type="radio" name="playlistMode" value="all" checked /> Download all</label>
      <label class="checkbox-line"><input type="radio" name="playlistMode" value="selected" /> Select videos</label>
      <div class="playlist-list">${entries}</div>
    </div>
  `;
}

function renderFormats() {
  $('#formatPanel').innerHTML = window.FormatSelector.render(appState.metadata, appState.formatSelection);
  $('#formatPanel').querySelectorAll('select,input').forEach((input) => {
    input.addEventListener('change', () => {
      appState.formatSelection = window.FormatSelector.read();
    });
  });
}

async function chooseFolder() {
  const folder = await window.api.dialog.chooseFolder();
  if (folder) {
    appState.settings.downloadFolder = folder;
    renderFolder();
    renderSettings();
  }
}

function renderFolder() {
  $('#folderPath').textContent = appState.settings.downloadFolder;
}

async function persistOutputSettings() {
  appState.settings = await window.api.settings.update({
    filenameTemplate: $('#filenameTemplate').value,
    restrictFilenames: $('#restrictFilenames').checked,
    overwriteFiles: $('#overwriteFiles').checked,
    downloadSubtitles: $('#downloadSubtitles').checked,
    subtitleLanguage: $('#subtitleLanguage').value,
    embedSubtitles: $('#embedSubtitles').checked,
    downloadThumbnail: $('#downloadThumbnail').checked,
    embedThumbnail: $('#embedThumbnail').checked,
    writeMetadata: $('#writeMetadata').checked,
    sponsorBlock: $('#sponsorBlock').checked,
    speedLimit: $('#speedLimit').value,
    normalizeAudio: $('#normalizeAudio').checked
  });
}

function applySettingsToForm() {
  $('#filenameTemplate').value = appState.settings.filenameTemplate;
  $('#restrictFilenames').checked = appState.settings.restrictFilenames;
  $('#overwriteFiles').checked = appState.settings.overwriteFiles;
  $('#downloadSubtitles').checked = appState.settings.downloadSubtitles;
  $('#subtitleLanguage').value = appState.settings.subtitleLanguage;
  $('#embedSubtitles').checked = appState.settings.embedSubtitles;
  $('#downloadThumbnail').checked = appState.settings.downloadThumbnail;
  $('#embedThumbnail').checked = appState.settings.embedThumbnail;
  $('#writeMetadata').checked = appState.settings.writeMetadata;
  $('#sponsorBlock').checked = appState.settings.sponsorBlock;
  $('#speedLimit').value = appState.settings.speedLimit;
  $('#normalizeAudio').checked = appState.settings.normalizeAudio;
}

async function addCurrentToQueue() {
  const message = $('#queueMessage');
  message.textContent = '';
  message.classList.remove('error-text');
  if (!appState.metadata) {
    message.textContent = 'Fetch formats before adding a video to the queue.';
    message.classList.add('error-text');
    return;
  }

  $('#addQueueButton').disabled = true;
  $('#addQueueButton').textContent = 'Adding...';

  try {
    await persistOutputSettings();
    appState.formatSelection = window.FormatSelector.read();
    const playlistMode = document.querySelector('input[name="playlistMode"]:checked')?.value || 'single';
    const playlistSelection = playlistMode === 'selected'
      ? Array.from(document.querySelectorAll('.playlist-entry:checked')).map((input) => input.value)
      : [];

    const item = {
      url: $('#urlInput').value.trim(),
      title: appState.metadata.title,
      thumbnail: appState.metadata.thumbnail,
      folder: appState.settings.downloadFolder,
      filenameTemplate: $('#filenameTemplate').value,
      playlistMode: appState.metadata.isPlaylist ? playlistMode : 'single',
      playlistSelection,
      selectedFormat: describeSelectedFormat(appState.formatSelection),
      ...appState.formatSelection
    };

    await window.api.queue.add(item);
    renderQueue(await window.api.queue.list());
    switchPage('queue');
  } catch (error) {
    message.textContent = error.message || 'Could not add this video to the queue.';
    message.classList.add('error-text');
  } finally {
    $('#addQueueButton').disabled = false;
    $('#addQueueButton').textContent = 'Add to Queue';
  }
}

function describeSelectedFormat(selection) {
  if (selection.editingPreset) return 'Editing preset MP4/H.264/AAC';
  if (selection.mode === 'audio-only') return `Audio only ${selection.audioFormat}`;
  if (selection.mode === 'video-only') return `Video only ${selection.videoQuality}`;
  return `Video ${selection.videoQuality} + audio, ${selection.container}`;
}

function switchPage(page) {
  document.querySelector(`.nav-item[data-page="${page}"]`).click();
}

function bindQueueActions() {
  $('#startQueuedButton').addEventListener('click', () => window.api.queue.startQueued());
  $('#clearCompletedButton').addEventListener('click', () => window.api.queue.clearCompleted());
  $('#queueList').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = event.target.closest('.download-card');
    const id = card?.dataset.id;
    const action = button.dataset.action;
    const item = appState.queue.find((entry) => entry.id === id);
    if (action === 'start') await window.api.queue.start(id);
    if (action === 'pause') await window.api.queue.pause(id);
    if (action === 'resume') await window.api.queue.resume(id);
    if (action === 'cancel') await window.api.queue.cancel(id);
    if (action === 'retry') await window.api.queue.retry(id);
    if (action === 'remove') await window.api.queue.remove(id);
    if (action === 'open-file') await window.api.queue.openFile(id);
    if (action === 'open-folder') await window.api.queue.openFolder(id);
    if (action === 'copy-command' && item?.command) await navigator.clipboard.writeText(item.command);
  });
}

function renderQueue(items) {
  appState.queue = items || [];
  $('#queueList').innerHTML = appState.queue.length
    ? appState.queue.map(window.DownloadCard.render).join('')
    : '<section class="panel empty-state">No downloads in the queue.</section>';
  $('#logsOutput').textContent = appState.queue
    .flatMap((item) => [`[${item.status}] ${item.title}`, ...(item.logs || []).slice(-20)])
    .join('\n');
}

function renderSettings() {
  $('#settingsPanel').innerHTML = window.SettingsPanel.render(appState.settings);
  $('#settingsChooseFolder')?.addEventListener('click', chooseFolder);
  $('#settingsPanel').querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('change', async () => {
      const key = input.dataset.setting;
      const value = input.type === 'checkbox' ? input.checked : input.value;
      appState.settings = await window.api.settings.update({ [key]: value });
      renderSettings();
    });
  });
  $('#checkYtDlp')?.addEventListener('click', async () => showToolStatus(await window.api.tools.checkYtDlp()));
  $('#checkFfmpeg')?.addEventListener('click', async () => showToolStatus(await window.api.tools.checkFfmpeg()));
  $('#updateYtDlp')?.addEventListener('click', async () => {
    try {
      showToolStatus({ ok: true, message: 'Updating yt-dlp...' });
      const message = await window.api.tools.updateYtDlp();
      showToolStatus({ ok: true, message });
    } catch (error) {
      showToolStatus({ ok: false, message: error.message });
    }
  });
}

function showToolStatus(result) {
  $('#toolStatus').textContent = `${result.ok ? 'OK' : 'Problem'}\n${result.message || result.raw || ''}`;
}

async function checkFfmpegQuickly() {
  const result = await window.api.tools.checkFfmpeg();
  $('#ffmpegStatus').textContent = result.ok ? 'FFmpeg available' : 'FFmpeg unavailable';
  $('#normalizeAudio').disabled = !result.ok;
}
