function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function sizeOf(format) {
  return format.filesize || format.filesize_approx || 0;
}

function describeVideo(format) {
  const parts = [
    format.height ? `${format.height}p` : null,
    format.ext,
    format.fps ? `${format.fps}fps` : null,
    format.vcodec && format.vcodec !== 'none' ? format.vcodec.split('.')[0] : null,
    sizeOf(format) ? formatBytes(sizeOf(format)) : null
  ].filter(Boolean);
  return parts.join(' | ');
}

function describeAudio(format) {
  const parts = [
    format.ext,
    format.abr ? `${Math.round(format.abr)}kbps` : null,
    format.acodec && format.acodec !== 'none' ? format.acodec.split('.')[0] : null,
    sizeOf(format) ? formatBytes(sizeOf(format)) : null
  ].filter(Boolean);
  return parts.join(' | ');
}

function parseMetadata(raw) {
  const formats = Array.isArray(raw.formats) ? raw.formats : [];
  const videoOnly = formats
    .filter((format) => format.vcodec !== 'none' && format.acodec === 'none')
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.fps || 0) - (a.fps || 0));
  const audioOnly = formats
    .filter((format) => format.acodec !== 'none' && format.vcodec === 'none')
    .sort((a, b) => (b.abr || 0) - (a.abr || 0));
  const combined = formats
    .filter((format) => format.vcodec !== 'none' && format.acodec !== 'none')
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  const byHeight = new Map();
  for (const format of videoOnly) {
    if (format.height && !byHeight.has(format.height)) {
      byHeight.set(format.height, format);
    }
  }

  const playlistEntries = Array.isArray(raw.entries)
    ? raw.entries.map((entry, index) => ({
        id: entry.id || `${index}`,
        index: index + 1,
        title: entry.title || entry.webpage_url || `Playlist item ${index + 1}`,
        url: entry.webpage_url || entry.url || '',
        duration: formatDuration(entry.duration),
        thumbnail: entry.thumbnail || ''
      }))
    : [];

  return {
    id: raw.id || '',
    webpageUrl: raw.webpage_url || raw.original_url || '',
    title: raw.title || raw.fulltitle || 'Untitled video',
    thumbnail: raw.thumbnail || '',
    duration: formatDuration(raw.duration),
    uploader: raw.uploader || raw.channel || raw.creator || '',
    isPlaylist: raw._type === 'playlist' || playlistEntries.length > 0,
    playlistCount: playlistEntries.length || raw.playlist_count || 0,
    playlistEntries,
    formats: {
      videoOnly: videoOnly.map((format) => ({
        id: format.format_id,
        label: describeVideo(format),
        height: format.height || 0,
        ext: format.ext || '',
        fps: format.fps || '',
        codec: format.vcodec || '',
        filesize: formatBytes(sizeOf(format)),
        raw: format
      })),
      audioOnly: audioOnly.map((format) => ({
        id: format.format_id,
        label: describeAudio(format),
        ext: format.ext || '',
        bitrate: format.abr || 0,
        codec: format.acodec || '',
        filesize: formatBytes(sizeOf(format)),
        raw: format
      })),
      combined: combined.map((format) => ({
        id: format.format_id,
        label: describeVideo(format),
        height: format.height || 0,
        ext: format.ext || '',
        raw: format
      })),
      qualities: [2160, 1440, 1080, 720, 480, 360]
        .filter((height) => byHeight.has(height))
        .map((height) => {
          const format = byHeight.get(height);
          return { value: String(height), id: format.format_id, label: describeVideo(format) };
        })
    }
  };
}

module.exports = {
  formatBytes,
  parseMetadata
};
