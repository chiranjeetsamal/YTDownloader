(function () {
  function option(value, text, selectedValue) {
    return `<option value="${escapeHtml(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(text)}</option>`;
  }

  function renderFormatSelector(metadata, state) {
    const qualities = [
      option('best', 'Best available', state.videoQuality || 'best'),
      ...metadata.formats.qualities.map((item) => option(item.value, `${item.value}p | ${item.label}`, state.videoQuality))
    ].join('');

    const videoIds = [
      option('', 'Auto by selected quality', state.videoFormatId || ''),
      ...metadata.formats.videoOnly.map((item) => option(item.id, `${item.id} | ${item.label}`, state.videoFormatId))
    ].join('');

    const audioIds = [
      option('', 'Best audio', state.audioFormatId || ''),
      ...metadata.formats.audioOnly.map((item) => option(item.id, `${item.id} | ${item.label}`, state.audioFormatId))
    ].join('');

    const audioFormats = ['best', 'm4a', 'mp3', 'wav', 'opus']
      .map((value) => option(value, value === 'best' ? 'Best audio' : value.toUpperCase(), state.audioFormat || 'best'))
      .join('');

    return `
      <div class="section-title">
        <h2>Formats</h2>
        <span class="pill">${metadata.formats.videoOnly.length} video | ${metadata.formats.audioOnly.length} audio</span>
      </div>
      <div class="settings-grid compact">
        <label>
          Mode
          <select id="modeSelect">
            ${option('video-audio', 'Video + audio merged', state.mode || 'video-audio')}
            ${option('video-only', 'Video only', state.mode)}
            ${option('audio-only', 'Audio only', state.mode)}
          </select>
        </label>
        <label>
          Video quality
          <select id="videoQuality">${qualities}</select>
        </label>
        <label>
          Specific video format
          <select id="videoFormatId">${videoIds}</select>
        </label>
        <label>
          Specific audio stream
          <select id="audioFormatId">${audioIds}</select>
        </label>
        <label>
          Audio output
          <select id="audioFormat">${audioFormats}</select>
        </label>
        <label>
          Container
          <select id="containerSelect">
            ${option('mp4', 'MP4', state.container || 'mp4')}
            ${option('mkv', 'MKV', state.container)}
            ${option('webm', 'WebM', state.container)}
          </select>
        </label>
        <label class="checkbox-line full-width">
          <input id="editingPreset" type="checkbox" ${state.editingPreset ? 'checked' : ''} />
          Editing-friendly preset: MP4, M4A, merge to MP4, H.264/AAC when possible
        </label>
      </div>
    `;
  }

  function readFormatSelection() {
    return {
      mode: document.querySelector('#modeSelect')?.value || 'video-audio',
      videoQuality: document.querySelector('#videoQuality')?.value || 'best',
      videoFormatId: document.querySelector('#videoFormatId')?.value || '',
      audioFormatId: document.querySelector('#audioFormatId')?.value || '',
      audioFormat: document.querySelector('#audioFormat')?.value || 'best',
      container: document.querySelector('#containerSelect')?.value || 'mp4',
      editingPreset: Boolean(document.querySelector('#editingPreset')?.checked)
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  window.FormatSelector = {
    render: renderFormatSelector,
    read: readFormatSelection,
    escapeHtml
  };
})();
