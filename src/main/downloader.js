const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');
const { parseMetadata } = require('./formatParser');

function isPackaged() {
  return app && app.isPackaged;
}

function resourceBinPath(binaryName) {
  const base = isPackaged() ? process.resourcesPath : path.resolve(__dirname, '..', '..');
  return path.join(base, 'bin', binaryName);
}

function resolveExecutable(binaryName) {
  const local = resourceBinPath(binaryName);
  if (fs.existsSync(local)) return local;
  return binaryName.replace(/\.exe$/i, '');
}

function isSupportedUrl(input) {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return ['youtube.com', 'youtu.be', 'music.youtube.com'].includes(host) || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function friendlyError(text) {
  const value = String(text || '');
  const lower = value.toLowerCase();
  if (lower.includes('no such file') || lower.includes('not recognized') || lower.includes('enoent')) {
    return 'yt-dlp was not found. Add yt-dlp.exe to the bin folder or install it on PATH.';
  }
  if (lower.includes('private video')) return 'This video is private. Sign in cookies may be required.';
  if (lower.includes('video unavailable')) return 'This video is unavailable.';
  if (lower.includes('age')) return 'This video may be age restricted. Browser cookies can help if you have access.';
  if (lower.includes('permission denied') || lower.includes('eperm') || lower.includes('eacces')) {
    return 'The app cannot write to that folder. Choose another download location.';
  }
  if (lower.includes('ffmpeg')) return 'FFmpeg is required for this operation and was not found or failed.';
  if (lower.includes('already been downloaded') || lower.includes('file exists')) {
    return 'The file already exists. Enable overwrite or change the filename template.';
  }
  if (lower.includes('network') || lower.includes('timed out') || lower.includes('temporary failure')) {
    return 'The network connection failed. Check your internet connection and retry.';
  }
  return value.split('\n').find(Boolean) || 'The operation failed. Expand details for technical logs.';
}

function spawnProcess(args, options = {}) {
  const exe = resolveExecutable('yt-dlp.exe');
  return spawn(exe, args, {
    cwd: options.cwd || process.cwd(),
    windowsHide: true,
    shell: false
  });
}

function fetchMetadata(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (!isSupportedUrl(url)) {
      reject(new Error('Paste a valid YouTube video, Shorts, or playlist URL.'));
      return;
    }

    const args = ['-J', '--flat-playlist'];
    addCookieArgs(args, options);
    args.push(url);

    const child = spawnProcess(args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(new Error(friendlyError(error.message))));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(friendlyError(stderr || stdout)));
        return;
      }
      try {
        resolve(parseMetadata(JSON.parse(stdout)));
      } catch (error) {
        reject(new Error(`Could not parse yt-dlp metadata: ${error.message}`));
      }
    });
  });
}

function addCookieArgs(args, settings = {}) {
  if (settings.useCookies && settings.browserCookies && settings.browserCookies !== 'none') {
    args.push('--cookies-from-browser', settings.browserCookies);
  }
}

function addCommonArgs(args, item, settings) {
  const folder = item.folder || settings.downloadFolder;
  fs.ensureDirSync(folder);
  args.push('--newline', '--progress', '--continue', '-P', folder);
  if (!settings.overwriteFiles) args.push('--no-overwrites');
  if (settings.restrictFilenames) args.push('--restrict-filenames');
  if (settings.speedLimit) args.push('--limit-rate', settings.speedLimit);
  addCookieArgs(args, settings);

  const template = sanitizeTemplate(item.filenameTemplate || settings.filenameTemplate);
  args.push('-o', template);

  if (settings.downloadSubtitles) {
    args.push('--write-subs', '--sub-langs', settings.subtitleLanguage || 'en');
    if (settings.embedSubtitles) args.push('--embed-subs');
  }
  if (settings.downloadThumbnail) args.push('--write-thumbnail');
  if (settings.embedThumbnail) args.push('--embed-thumbnail');
  if (settings.writeMetadata) args.push('--write-info-json');
  if (settings.sponsorBlock) args.push('--sponsorblock-remove', 'sponsor,intro,outro,selfpromo,preview');
  if (settings.normalizeAudio) args.push('--postprocessor-args', 'ffmpeg:-af loudnorm');
}

function sanitizeTemplate(template) {
  const fallback = '%(title)s.%(ext)s';
  const cleaned = String(template || fallback)
    .replace(/[<>:"\\|?*\u0000-\u001F]/g, '_')
    .trim();
  return cleaned || fallback;
}

function buildDownloadArgs(item, settings) {
  const args = [];
  const container = item.container || settings.defaultContainer || 'mp4';
  const mode = item.mode || 'video-audio';

  if (item.editingPreset) {
    args.push('-S', 'vcodec:h264,res,acodec:m4a', '--merge-output-format', 'mp4', '--recode-video', 'mp4');
  } else if (mode === 'audio-only') {
    args.push('-x');
    const audioFormat = item.audioFormat || settings.defaultAudioFormat || 'best';
    if (audioFormat !== 'best') args.push('--audio-format', audioFormat);
  } else if (mode === 'video-only') {
    const videoId = item.videoFormatId || 'bestvideo';
    args.push('-f', videoId);
  } else {
    const videoId = item.videoFormatId || qualityExpression(item.videoQuality || settings.defaultVideoQuality);
    const audioId = item.audioFormatId || 'bestaudio';
    args.push('-f', `${videoId}+${audioId}/best`, '--merge-output-format', container);
  }

  addCommonArgs(args, item, settings);

  if (Array.isArray(item.playlistSelection) && item.playlistSelection.length) {
    args.push('--playlist-items', item.playlistSelection.join(','));
  } else if (item.playlistMode === 'single') {
    args.push('--no-playlist');
  } else if (item.playlistMode === 'all') {
    args.push('--yes-playlist');
  }

  args.push(item.url);
  return args;
}

function qualityExpression(quality) {
  if (!quality || quality === 'best') return 'bestvideo';
  const height = Number(quality);
  if (!height) return 'bestvideo';
  return `bestvideo[height<=${height}]`;
}

function parseProgressLine(line) {
  const progress = {};
  const percent = line.match(/\[download]\s+([\d.]+)%/);
  const size = line.match(/of\s+~?\s*([^\s]+(?:\s?[KMGTP]i?B)?)/i);
  const downloaded = line.match(/([\d.]+(?:K|M|G|T)?i?B)\s+of/i);
  const speed = line.match(/at\s+([^\s]+)/);
  const eta = line.match(/ETA\s+([^\s]+)/);
  const destination = line.match(/\[download]\s+Destination:\s+(.+)/);
  const merged = line.match(/\[Merger]\s+Merging formats into "(.+)"/);

  if (percent) progress.percent = Number(percent[1]);
  if (downloaded) progress.downloaded = downloaded[1];
  if (size) progress.total = size[1];
  if (speed) progress.speed = speed[1];
  if (eta) progress.eta = eta[1];
  if (destination) progress.filename = destination[1];
  if (merged) progress.filename = merged[1];
  return Object.keys(progress).length ? progress : null;
}

function checkExecutable(binaryName, args) {
  return new Promise((resolve) => {
    const exe = binaryName === 'ffmpeg.exe' ? resolveExecutable('ffmpeg.exe') : resolveExecutable('yt-dlp.exe');
    const child = spawn(exe, args, { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => resolve({ ok: false, message: friendlyError(error.message), raw: error.message }));
    child.on('close', (code) => {
      resolve({ ok: code === 0, message: (stdout || stderr).trim(), raw: (stdout || stderr).trim() });
    });
  });
}

function updateYtDlp() {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(['-U']);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', (error) => reject(new Error(friendlyError(error.message))));
    child.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(friendlyError(output)));
    });
  });
}

module.exports = {
  buildDownloadArgs,
  checkExecutable,
  fetchMetadata,
  friendlyError,
  isSupportedUrl,
  parseProgressLine,
  resolveExecutable,
  spawnProcess,
  updateYtDlp
};
