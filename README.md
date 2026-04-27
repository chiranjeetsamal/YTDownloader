# YTDownloader

![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows)
![Electron](https://img.shields.io/badge/Electron-30-47848F?style=for-the-badge&logo=electron)
![yt-dlp](https://img.shields.io/badge/downloader-yt--dlp-FF0033?style=for-the-badge)
![FFmpeg](https://img.shields.io/badge/media-FFmpeg-007808?style=for-the-badge&logo=ffmpeg)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

A polished Windows-friendly Electron desktop app for downloading YouTube videos, Shorts, and playlists with [`yt-dlp`](https://github.com/yt-dlp/yt-dlp). YTDownloader provides a clean GUI for fetching formats, choosing separate video/audio quality, selecting an output folder, and managing downloads with pause, resume, cancel, retry, and queue controls.

> Legal note: Download only content you own, have permission to use, or content available under licenses that allow downloading.

## Highlights

- Paste a YouTube video, Shorts, or playlist URL and fetch metadata with `yt-dlp -J`
- Preview title, thumbnail, duration, uploader/channel, and playlist item count
- Choose video quality and audio format separately
- Download as merged video + audio, video only, or audio only
- Output containers: MP4, MKV, WebM
- Editing-friendly preset for MP4/H.264/AAC workflows when possible
- Queue with max concurrent downloads from 1 to 3
- Pause/resume on Windows using process termination plus `--continue`
- Progress parsing for percent, speed, ETA, downloaded size, total size, and output filename
- Persistent settings with default folder, quality, container, cookies, theme, and filename templates
- Optional subtitles, thumbnails, metadata JSON, SponsorBlock removal, speed limit, and audio normalization
- Copy the exact `yt-dlp` command used for each download
- Secure Electron setup with `contextIsolation: true` and `nodeIntegration: false`

## App Structure

```text
project-root/
  package.json
  src/
    main/
      main.js
      downloader.js
      formatParser.js
      settingsStore.js
      queueManager.js
    preload/
      preload.js
    renderer/
      index.html
      styles.css
      renderer.js
      components/
        DownloadCard.js
        FormatSelector.js
        SettingsPanel.js
  bin/
    yt-dlp.exe      optional, ignored by git
    ffmpeg.exe      optional, ignored by git
    ffprobe.exe     optional, ignored by git
  downloads/
```

## Requirements

- Windows 10 or newer
- Node.js 20 or newer
- npm
- `yt-dlp`
- FFmpeg

The app is portable-friendly: it first checks `bin/yt-dlp.exe` and `bin/ffmpeg.exe`, then falls back to tools available on your system `PATH`.

## Installation

```powershell
npm install
npm start
```

If PowerShell blocks `npm.ps1`, use the Windows command shim:

```powershell
npm.cmd install
npm.cmd start
```

## Installing yt-dlp

Portable setup:

1. Download `yt-dlp.exe` from the [official yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases).
2. Place it at:

```text
bin/yt-dlp.exe
```

3. Open the app and run Settings > Check yt-dlp.

System setup:

```powershell
winget install yt-dlp.yt-dlp
```

## Installing FFmpeg

Portable setup:

1. Download a Windows build from [FFmpeg](https://ffmpeg.org/download.html) or [Gyan.dev builds](https://www.gyan.dev/ffmpeg/builds/).
2. Place the executables at:

```text
bin/ffmpeg.exe
bin/ffprobe.exe
```

3. Open the app and run Settings > Check FFmpeg.

System setup:

```powershell
winget install Gyan.FFmpeg
```

FFmpeg is required for merging separate video/audio streams, audio conversion, embedding subtitles or thumbnails, and audio normalization.

## Usage

1. Paste a YouTube video, Shorts, or playlist URL.
2. Click Fetch Formats.
3. Review the metadata preview.
4. Choose video quality, audio format, download mode, and output container.
5. Choose a download folder.
6. Click Add to Queue.
7. Open the Queue page.
8. Click Download on a queued item, or click Start downloads to begin queued items up to your concurrency limit.
9. Manage progress from the Queue page.

Pause/resume behavior is intentionally Windows-safe. `yt-dlp` does not provide universal stdin pause/resume, so the app pauses by terminating the active process and resumes by restarting the same download with `--continue` and partial files enabled.

## Settings

The Settings page includes:

- Default download folder
- Default video quality
- Default audio format
- Default output container
- Max concurrent downloads, 1 to 3
- Browser cookies from Chrome, Edge, or Firefox
- Theme: light, dark, or system
- yt-dlp version check
- yt-dlp auto-update
- FFmpeg availability check

Output options include filename templates, overwrite behavior, restricted Windows filenames, subtitles, thumbnails, metadata JSON, SponsorBlock removal, speed limits, and audio normalization.

## Build

Build installer and portable Windows artifacts:

```powershell
npm.cmd run build
```

Build portable executable only:

```powershell
npm.cmd run build:portable
```

Build output is written to:

```text
dist/
```

To bundle portable tools into a build, place them in `bin/` before running the build command. The Electron Builder config includes `bin/**/*` as extra resources, while `.gitignore` prevents large local binaries from being committed.

## Development

Run a syntax sanity check:

```powershell
npm.cmd run lint:syntax
```

Start the Electron app:

```powershell
npm.cmd start
```

## Troubleshooting

### yt-dlp was not found

Put `yt-dlp.exe` in `bin/yt-dlp.exe` or install `yt-dlp` on your system `PATH`.

### FFmpeg was not found

Put `ffmpeg.exe` in `bin/ffmpeg.exe` or install FFmpeg on your system `PATH`.

### Video is private, unavailable, or age restricted

Enable browser cookies in Settings and choose the browser where you are signed in.

### Permission denied

Choose another download folder, such as your user Downloads folder.

### File already exists

Enable overwrite in the Output panel or change the filename template.

### Merge failed

Check FFmpeg availability. Some format/container combinations may require MKV or WebM instead of MP4.

### Playlist is too large

Use playlist selection to download a smaller range of videos.

## Security Notes

- Renderer code does not get direct Node.js access.
- IPC is exposed through a narrow preload API.
- Download commands are assembled in the main process.
- No absolute tool paths are hardcoded.

## License

MIT
