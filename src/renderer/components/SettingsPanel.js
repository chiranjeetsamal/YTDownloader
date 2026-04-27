(function () {
  const { escapeHtml } = window.FormatSelector;

  function selected(value, current) {
    return value === current ? 'selected' : '';
  }

  function checked(value) {
    return value ? 'checked' : '';
  }

  function renderSettings(settings) {
    return `
      <section class="panel">
        <div class="section-title">
          <h2>Defaults</h2>
          <button class="ghost-button" id="settingsChooseFolder">Choose Folder</button>
        </div>
        <div class="folder-path">${escapeHtml(settings.downloadFolder)}</div>
        <div class="settings-grid">
          <label>Default video quality
            <select data-setting="defaultVideoQuality">
              ${['best', '2160', '1440', '1080', '720', '480', '360'].map((v) => `<option value="${v}" ${selected(v, settings.defaultVideoQuality)}>${v === 'best' ? 'Best available' : `${v}p`}</option>`).join('')}
            </select>
          </label>
          <label>Default audio format
            <select data-setting="defaultAudioFormat">
              ${['best', 'm4a', 'mp3', 'wav', 'opus'].map((v) => `<option value="${v}" ${selected(v, settings.defaultAudioFormat)}>${v}</option>`).join('')}
            </select>
          </label>
          <label>Default container
            <select data-setting="defaultContainer">
              ${['mp4', 'mkv', 'webm'].map((v) => `<option value="${v}" ${selected(v, settings.defaultContainer)}>${v}</option>`).join('')}
            </select>
          </label>
          <label>Max concurrent downloads
            <input data-setting="maxConcurrentDownloads" type="number" min="1" max="3" value="${escapeHtml(settings.maxConcurrentDownloads)}" />
          </label>
          <label>Theme
            <select data-setting="theme">
              ${['system', 'light', 'dark'].map((v) => `<option value="${v}" ${selected(v, settings.theme)}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
      </section>

      <section class="panel">
        <h2>Cookies</h2>
        <div class="settings-grid">
          <label class="checkbox-line"><input data-setting="useCookies" type="checkbox" ${checked(settings.useCookies)} /> Use browser cookies</label>
          <label>Browser
            <select data-setting="browserCookies">
              ${['none', 'chrome', 'edge', 'firefox'].map((v) => `<option value="${v}" ${selected(v, settings.browserCookies)}>${v}</option>`).join('')}
            </select>
          </label>
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <h2>Tools</h2>
          <div class="tool-buttons">
            <button class="ghost-button" id="checkYtDlp">Check yt-dlp</button>
            <button class="ghost-button" id="checkFfmpeg">Check FFmpeg</button>
            <button class="primary-button" id="updateYtDlp">Auto-update yt-dlp</button>
          </div>
        </div>
        <pre id="toolStatus" class="tool-status">Tool status will appear here.</pre>
      </section>
    `;
  }

  window.SettingsPanel = {
    render: renderSettings
  };
})();
