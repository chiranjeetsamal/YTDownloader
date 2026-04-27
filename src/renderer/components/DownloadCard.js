(function () {
  const { escapeHtml } = window.FormatSelector;

  function renderDownloadCard(item) {
    const canPause = item.status === 'downloading';
    const canResume = item.status === 'paused';
    const canRetry = item.status === 'failed';
    const percent = Math.max(0, Math.min(100, Number(item.percent || 0)));
    return `
      <article class="download-card" data-id="${escapeHtml(item.id)}">
        <img class="queue-thumb" src="${escapeHtml(item.thumbnail || '')}" alt="" />
        <div class="download-main">
          <div class="download-topline">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.selectedFormat || '')}</p>
            </div>
            <span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
          </div>
          <div class="progress-row">
            <div class="progress-track"><span style="width:${percent}%"></span></div>
            <strong>${percent.toFixed(percent % 1 ? 1 : 0)}%</strong>
          </div>
          <div class="metrics">
            <span>${escapeHtml(item.downloaded || '-')} / ${escapeHtml(item.total || '-')}</span>
            <span>${escapeHtml(item.speed || '-')}</span>
            <span>ETA ${escapeHtml(item.eta || '-')}</span>
            <span>${escapeHtml(item.filename || '')}</span>
          </div>
          ${item.error ? `<p class="error-text">${escapeHtml(item.error)}</p>` : ''}
          <details>
            <summary>Details</summary>
            <div class="command-row">
              <button data-action="copy-command">Copy command</button>
              <button data-action="open-file">Open file</button>
              <button data-action="open-folder">Open folder</button>
            </div>
            <pre>${escapeHtml((item.logs || []).slice(-80).join('\n'))}</pre>
          </details>
        </div>
        <div class="download-actions">
          <button data-action="pause" ${canPause ? '' : 'disabled'}>Pause</button>
          <button data-action="resume" ${canResume ? '' : 'disabled'}>Resume</button>
          <button data-action="cancel" ${['completed', 'cancelled'].includes(item.status) ? 'disabled' : ''}>Cancel</button>
          <button data-action="retry" ${canRetry ? '' : 'disabled'}>Retry</button>
          <button data-action="remove">Remove</button>
        </div>
      </article>
    `;
  }

  window.DownloadCard = {
    render: renderDownloadCard
  };
})();
