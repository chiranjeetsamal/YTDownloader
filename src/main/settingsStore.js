const { app } = require('electron');
const os = require('os');
const path = require('path');
const Store = require('electron-store');

const downloadsPath = app && typeof app.getPath === 'function'
  ? app.getPath('downloads')
  : path.join(os.homedir(), 'Downloads');

const schema = {
  downloadFolder: { type: 'string' },
  defaultVideoQuality: { type: 'string', default: 'best' },
  defaultAudioFormat: { type: 'string', default: 'best' },
  defaultContainer: { type: 'string', default: 'mp4' },
  maxConcurrentDownloads: { type: 'number', minimum: 1, maximum: 3, default: 1 },
  useCookies: { type: 'boolean', default: false },
  browserCookies: { type: 'string', default: 'none' },
  theme: { type: 'string', default: 'system' },
  filenameTemplate: { type: 'string', default: '%(title)s.%(ext)s' },
  restrictFilenames: { type: 'boolean', default: false },
  overwriteFiles: { type: 'boolean', default: false },
  speedLimit: { type: 'string', default: '' },
  downloadSubtitles: { type: 'boolean', default: false },
  subtitleLanguage: { type: 'string', default: 'en' },
  embedSubtitles: { type: 'boolean', default: false },
  downloadThumbnail: { type: 'boolean', default: false },
  embedThumbnail: { type: 'boolean', default: false },
  writeMetadata: { type: 'boolean', default: false },
  sponsorBlock: { type: 'boolean', default: false },
  normalizeAudio: { type: 'boolean', default: false },
  youtubeApiKey: { type: 'string', default: '' },
  unfinishedQueue: { type: 'array', default: [] }
};

const defaults = {
  downloadFolder: path.join(downloadsPath, 'YTDownloader'),
  defaultVideoQuality: 'best',
  defaultAudioFormat: 'best',
  defaultContainer: 'mp4',
  maxConcurrentDownloads: 1,
  useCookies: false,
  browserCookies: 'none',
  theme: 'system',
  filenameTemplate: '%(title)s.%(ext)s',
  restrictFilenames: false,
  overwriteFiles: false,
  speedLimit: '',
  downloadSubtitles: false,
  subtitleLanguage: 'en',
  embedSubtitles: false,
  downloadThumbnail: false,
  embedThumbnail: false,
  writeMetadata: false,
  sponsorBlock: false,
  normalizeAudio: false,
  youtubeApiKey: '',
  unfinishedQueue: []
};

const storeOptions = { name: 'settings', schema, defaults };
if (!app || typeof app.getPath !== 'function') {
  storeOptions.cwd = path.join(process.cwd(), '.local-store');
}

const store = new Store(storeOptions);

function getSettings() {
  return { ...defaults, ...store.store };
}

function updateSettings(nextSettings) {
  const merged = { ...getSettings(), ...nextSettings };
  if (Number.isFinite(Number(merged.maxConcurrentDownloads))) {
    merged.maxConcurrentDownloads = Math.min(3, Math.max(1, Number(merged.maxConcurrentDownloads)));
  }
  store.set(merged);
  return getSettings();
}

module.exports = {
  getSettings,
  updateSettings,
  store
};
