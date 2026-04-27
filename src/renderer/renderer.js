const appState = {
  settings: null,
  metadata: null,
  queue: [],
  leads: [],
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
  bindLeadFinder();
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

function bindLeadFinder() {
  $('#searchLeadsButton').addEventListener('click', searchCreatorLeads);
  $('#exportLeadsButton').addEventListener('click', exportCreatorLeads);
  $('#leadResults').addEventListener('click', async (event) => {
    const videoLink = event.target.closest('[data-video-url]');
    if (videoLink) {
      event.preventDefault();
      await window.api.shell.openPath(videoLink.dataset.videoUrl);
      return;
    }

    const button = event.target.closest('button[data-lead-action]');
    if (!button) return;
    const card = event.target.closest('.lead-card');
    const id = card?.dataset.id;
    const lead = appState.leads.find((item) => item.id === id);
    if (!lead) return;

    if (button.dataset.leadAction === 'open-channel') {
      await window.api.shell.openPath(lead.channelUrl);
    }
    if (button.dataset.leadAction === 'copy-outreach') {
      await navigator.clipboard.writeText(buildOutreachMessage(lead));
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = 'Copy outreach';
      }, 1200);
    }
  });
}

async function searchCreatorLeads() {
  const message = $('#leadMessage');
  message.textContent = '';
  message.classList.remove('error-text');
  $('#searchLeadsButton').disabled = true;
  $('#searchLeadsButton').textContent = 'Searching...';
  $('#leadResults').innerHTML = '<section class="panel empty-state">Searching YouTube channels and scoring prospects...</section>';

  try {
    const result = await window.api.leads.search({
      keywords: $('#leadKeywords').value,
      minSubscribers: $('#leadMinSubs').value,
      maxSubscribers: $('#leadMaxSubs').value,
      recentDays: $('#leadRecentDays').value,
      minUploads: $('#leadMinUploads').value,
      maxViewRatio: $('#leadMaxViewRatio').value,
      maxResults: $('#leadMaxResults').value
    });
    appState.leads = result.leads || [];
    renderLeads();
  } catch (error) {
    appState.leads = [];
    $('#leadResults').innerHTML = '';
    message.textContent = error.message || 'Could not search creator leads.';
    message.classList.add('error-text');
    renderLeadCount();
  } finally {
    $('#searchLeadsButton').disabled = false;
    $('#searchLeadsButton').textContent = 'Find Leads';
  }
}

function renderLeads() {
  renderLeadCount();
  $('#exportLeadsButton').disabled = appState.leads.length === 0;
  $('#leadResults').innerHTML = appState.leads.length
    ? appState.leads.map(renderLeadCard).join('')
    : '<section class="panel empty-state">No matching creator leads found. Try a wider subscriber range, lower upload minimum, or broader niche keyword.</section>';
}

function renderLeadCount() {
  const count = appState.leads.length;
  $('#leadCountPill').textContent = count ? `${count} leads found` : 'No leads yet';
}

function renderLeadCard(lead) {
  const ratio = Math.round((lead.viewToSubRatio || 0) * 100);
  const contacts = [...(lead.emails || []), ...(lead.contactLinks || [])];
  return `
    <article class="lead-card panel" data-id="${escapeHtml(lead.id)}">
      <div class="lead-card-header">
        <img class="lead-avatar" src="${escapeHtml(lead.thumbnail || '')}" alt="" />
        <div class="lead-title-block">
          <div class="lead-title-row">
            <h2>${escapeHtml(lead.title)}</h2>
            <span class="lead-tier ${escapeHtml(lead.leadTier.toLowerCase())}">${escapeHtml(lead.leadTier)} lead</span>
          </div>
          <p>${escapeHtml((lead.description || 'No channel description available.').slice(0, 180))}</p>
        </div>
        <div class="lead-score">
          <strong>${lead.score}</strong>
          <span>score</span>
        </div>
      </div>
      <div class="lead-metrics">
        <span><strong>${formatNumber(lead.subscriberCount)}</strong> subscribers</span>
        <span><strong>${formatNumber(lead.avgRecentViews)}</strong> avg views</span>
        <span><strong>${ratio}%</strong> view/sub</span>
        <span><strong>${lead.recentUploadCount}</strong> recent uploads</span>
        <span><strong>${lead.uploadCadenceDays || '-'}</strong> day cadence</span>
      </div>
      <div class="lead-reasons">
        ${(lead.reasons || []).map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}
      </div>
      <div class="lead-contact">
        <strong>Contact:</strong>
        <span>${contacts.length ? escapeHtml(contacts.join(' | ')) : 'No public contact found in channel text.'}</span>
      </div>
      <details>
        <summary>Recent videos</summary>
        <div class="lead-video-list">
          ${(lead.recentVideos || []).slice(0, 5).map((video) => `
            <a href="#" data-video-url="${escapeHtml(video.url)}">
              ${escapeHtml(video.title)} <span>${formatNumber(video.views)} views</span>
            </a>
          `).join('')}
        </div>
      </details>
      <div class="lead-actions">
        <button class="primary-button" data-lead-action="open-channel">Open channel</button>
        <button class="ghost-button" data-lead-action="copy-outreach">Copy outreach</button>
      </div>
    </article>
  `;
}

async function exportCreatorLeads() {
  if (!appState.leads.length) return;
  const filePath = await window.api.dialog.saveCsv('creator-leads.csv');
  if (!filePath) return;
  await window.api.leads.exportCsv(filePath, appState.leads);
  $('#leadMessage').textContent = `Exported ${appState.leads.length} leads to ${filePath}`;
  $('#leadMessage').classList.remove('error-text');
}

function buildOutreachMessage(lead) {
  const video = lead.recentVideos?.[0];
  return `Hey ${lead.title}, I noticed you are posting consistently on YouTube, which is honestly the hardest part. I also saw a few places where tighter editing, stronger hooks, and thumbnail/title packaging could probably help your videos perform better${video ? `, especially around "${video.title}"` : ''}. I am a video editor and would be happy to share a quick idea for improving one of your recent videos.`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
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
