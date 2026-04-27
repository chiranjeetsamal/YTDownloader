const { EventEmitter } = require('events');
const crypto = require('crypto');
const { shell, Notification } = require('electron');
const { buildDownloadArgs, friendlyError, parseProgressLine, spawnProcess } = require('./downloader');

class QueueManager extends EventEmitter {
  constructor(settingsStore) {
    super();
    this.settingsStore = settingsStore;
    this.items = new Map();
    this.processes = new Map();
    this.loadUnfinished();
  }

  loadUnfinished() {
    const settings = this.settingsStore.getSettings();
    for (const saved of settings.unfinishedQueue || []) {
      const item = { ...saved, status: saved.status === 'downloading' ? 'queued' : saved.status };
      this.items.set(item.id, item);
    }
  }

  snapshot() {
    return Array.from(this.items.values());
  }

  add(item) {
    const id = crypto.randomUUID();
    const queued = {
      id,
      url: item.url,
      title: item.title || 'Queued download',
      thumbnail: item.thumbnail || '',
      selectedFormat: item.selectedFormat || 'Best video + audio',
      status: 'queued',
      percent: 0,
      speed: '',
      eta: '',
      downloaded: '',
      total: '',
      filename: '',
      logs: [],
      createdAt: Date.now(),
      ...item,
      id
    };
    this.items.set(id, queued);
    this.persist();
    this.emitUpdate();
    return queued;
  }

  startDownload(id) {
    const item = this.items.get(id);
    if (!item || !['queued', 'failed'].includes(item.status)) return;
    item.status = 'queued';
    item.wasCancelled = false;
    item.wasPaused = false;
    item.error = '';
    this.persist();
    this.emitUpdate();
    this.pump();
  }

  startQueued() {
    this.pump();
  }

  pause(id) {
    const item = this.items.get(id);
    if (!item) return;
    const child = this.processes.get(id);
    if (child) {
      item.wasPaused = true;
      child.kill('SIGTERM');
    }
    item.status = 'paused';
    this.processes.delete(id);
    this.persist();
    this.emitUpdate();
  }

  resume(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.status = 'queued';
    item.wasPaused = false;
    this.persist();
    this.emitUpdate();
    this.pump();
  }

  cancel(id) {
    const item = this.items.get(id);
    if (!item) return;
    const child = this.processes.get(id);
    if (child) child.kill('SIGTERM');
    this.processes.delete(id);
    item.status = 'cancelled';
    item.wasCancelled = true;
    this.persist();
    this.emitUpdate();
  }

  retry(id) {
    const item = this.items.get(id);
    if (!item) return;
    Object.assign(item, {
      status: 'queued',
      percent: 0,
      speed: '',
      eta: '',
      downloaded: '',
      total: '',
      error: ''
    });
    this.persist();
    this.emitUpdate();
  }

  remove(id) {
    this.cancel(id);
    this.items.delete(id);
    this.persist();
    this.emitUpdate();
  }

  clearCompleted() {
    for (const [id, item] of this.items.entries()) {
      if (['completed', 'cancelled'].includes(item.status)) this.items.delete(id);
    }
    this.persist();
    this.emitUpdate();
  }

  pump() {
    const settings = this.settingsStore.getSettings();
    const active = Array.from(this.items.values()).filter((item) => item.status === 'downloading').length;
    const capacity = Math.max(0, Number(settings.maxConcurrentDownloads || 1) - active);
    const next = Array.from(this.items.values()).filter((item) => item.status === 'queued').slice(0, capacity);
    for (const item of next) this.start(item, settings);
  }

  start(item, settings) {
    item.status = 'downloading';
    item.error = '';
    item.logs = item.logs || [];
    const args = buildDownloadArgs(item, settings);
    item.command = `yt-dlp ${args.map(quoteArg).join(' ')}`;
    item.logs.push(`> ${item.command}`);
    const child = spawnProcess(args);
    this.processes.set(item.id, child);
    this.persist();
    this.emitUpdate();

    child.stdout.on('data', (chunk) => this.handleOutput(item, chunk));
    child.stderr.on('data', (chunk) => this.handleOutput(item, chunk));
    child.on('error', (error) => {
      item.status = 'failed';
      item.error = friendlyError(error.message);
      item.logs.push(error.message);
      this.processes.delete(item.id);
      this.persist();
      this.emitUpdate();
      this.pump();
    });
    child.on('close', (code) => {
      this.processes.delete(item.id);
      if (item.wasPaused) {
        item.wasPaused = false;
        item.status = 'paused';
      } else if (item.wasCancelled) {
        item.wasCancelled = false;
        item.status = 'cancelled';
      } else if (code === 0) {
        item.status = 'completed';
        item.percent = 100;
        this.notifyCompleted(item);
      } else {
        item.status = 'failed';
        item.error = friendlyError(item.logs.slice(-8).join('\n'));
      }
      this.persist();
      this.emitUpdate();
      this.pump();
    });
  }

  handleOutput(item, chunk) {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      item.logs.push(line);
      if (item.logs.length > 400) item.logs.splice(0, item.logs.length - 400);
      const progress = parseProgressLine(line);
      if (progress) Object.assign(item, progress);
    }
    this.persist();
    this.emitUpdate();
  }

  notifyCompleted(item) {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Download complete',
        body: item.title || 'Your download finished.'
      }).show();
    }
  }

  persist() {
    const unfinished = this.snapshot().filter((item) => !['completed', 'cancelled'].includes(item.status));
    this.settingsStore.updateSettings({ unfinishedQueue: unfinished });
  }

  emitUpdate() {
    this.emit('update', this.snapshot());
  }

  openFile(id) {
    const item = this.items.get(id);
    if (item && item.filename) shell.openPath(item.filename);
  }

  openFolder(id) {
    const item = this.items.get(id);
    if (item && item.folder) shell.openPath(item.folder);
  }
}

function quoteArg(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

module.exports = QueueManager;
