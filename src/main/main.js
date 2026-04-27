const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const settingsStore = require('./settingsStore');
const QueueManager = require('./queueManager');
const { checkExecutable, fetchMetadata, isSupportedUrl, updateYtDlp } = require('./downloader');
const { exportLeadsCsv, findLeads } = require('./leadFinder');

let mainWindow;
let queue;

function createWindow() {
  const settings = settingsStore.getSettings();
  nativeTheme.themeSource = settings.theme || 'system';

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f6f7fb',
    title: 'YTDownloader',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  fs.ensureDirSync(settingsStore.getSettings().downloadFolder);
  queue = new QueueManager(settingsStore);
  queue.on('update', (items) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue:updated', items);
    }
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('settings:get', () => settingsStore.getSettings());

ipcMain.handle('settings:update', (_event, nextSettings) => {
  const updated = settingsStore.updateSettings(nextSettings);
  nativeTheme.themeSource = updated.theme || 'system';
  if (queue) queue.pump();
  return updated;
});

ipcMain.handle('dialog:chooseFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose download folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  settingsStore.updateSettings({ downloadFolder: folder });
  return folder;
});

ipcMain.handle('dialog:saveCsv', async (_event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export creator leads',
    defaultPath: defaultPath || 'creator-leads.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('clipboard:readText', async () => {
  const { clipboard } = require('electron');
  return clipboard.readText();
});

ipcMain.handle('metadata:fetch', async (_event, { url, settings }) => {
  return fetchMetadata(url, { ...settingsStore.getSettings(), ...(settings || {}) });
});

ipcMain.handle('url:validate', (_event, url) => isSupportedUrl(url));

ipcMain.handle('queue:add', (_event, item) => queue.add(item));
ipcMain.handle('queue:list', () => queue.snapshot());
ipcMain.handle('queue:start', (_event, id) => queue.startDownload(id));
ipcMain.handle('queue:startQueued', () => queue.startQueued());
ipcMain.handle('queue:pause', (_event, id) => queue.pause(id));
ipcMain.handle('queue:resume', (_event, id) => queue.resume(id));
ipcMain.handle('queue:cancel', (_event, id) => queue.cancel(id));
ipcMain.handle('queue:retry', (_event, id) => queue.retry(id));
ipcMain.handle('queue:remove', (_event, id) => queue.remove(id));
ipcMain.handle('queue:clearCompleted', () => queue.clearCompleted());
ipcMain.handle('queue:openFile', (_event, id) => queue.openFile(id));
ipcMain.handle('queue:openFolder', (_event, id) => queue.openFolder(id));

ipcMain.handle('tools:checkYtDlp', () => checkExecutable('yt-dlp.exe', ['--version']));
ipcMain.handle('tools:checkFfmpeg', () => checkExecutable('ffmpeg.exe', ['-version']));
ipcMain.handle('tools:updateYtDlp', () => updateYtDlp());

ipcMain.handle('leads:search', (_event, options) => findLeads(options, settingsStore.getSettings()));
ipcMain.handle('leads:exportCsv', async (_event, { filePath, leads }) => exportLeadsCsv(filePath, leads || []));

ipcMain.handle('shell:openPath', (_event, targetPath) => {
  if (typeof targetPath === 'string' && targetPath.trim()) return shell.openPath(targetPath);
  return null;
});
