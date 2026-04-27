const fs = require('fs-extra');

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function assertApiKey(apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('Add a YouTube Data API key in Settings before searching for creator leads.');
  }
}

async function youtubeGet(endpoint, params, apiKey) {
  assertApiKey(apiKey);
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `YouTube API request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

async function findLeads(options, settings) {
  const apiKey = options.apiKey || settings.youtubeApiKey;
  const keywords = String(options.keywords || '').trim();
  if (!keywords) throw new Error('Enter at least one niche keyword to search.');

  const maxResults = clamp(Number(options.maxResults || 20), 5, 50);
  const minSubscribers = Number(options.minSubscribers || 2000);
  const maxSubscribers = Number(options.maxSubscribers || 50000);
  const recentDays = clamp(Number(options.recentDays || 45), 7, 180);
  const minUploads = clamp(Number(options.minUploads || 4), 1, 30);
  const maxViewRatio = Number(options.maxViewRatio || 0.15);

  const search = await youtubeGet('search', {
    part: 'snippet',
    type: 'channel',
    q: keywords,
    maxResults,
    relevanceLanguage: options.language || '',
    regionCode: options.region || ''
  }, apiKey);

  const channelIds = unique((search.items || []).map((item) => item.id?.channelId).filter(Boolean));
  if (!channelIds.length) return { leads: [], searchedAt: new Date().toISOString() };

  const channels = await getChannels(channelIds, apiKey);
  const leads = [];
  for (const channel of channels) {
    const lead = await analyzeChannel(channel, {
      apiKey,
      minSubscribers,
      maxSubscribers,
      recentDays,
      minUploads,
      maxViewRatio
    });
    if (lead) leads.push(lead);
  }

  leads.sort((a, b) => b.score - a.score || b.subscriberCount - a.subscriberCount);
  return {
    leads,
    searchedAt: new Date().toISOString(),
    filters: { keywords, maxResults, minSubscribers, maxSubscribers, recentDays, minUploads, maxViewRatio }
  };
}

async function getChannels(channelIds, apiKey) {
  const chunks = [];
  for (let i = 0; i < channelIds.length; i += 50) chunks.push(channelIds.slice(i, i + 50));
  const channels = [];
  for (const chunk of chunks) {
    const data = await youtubeGet('channels', {
      part: 'snippet,statistics,contentDetails,brandingSettings,topicDetails',
      id: chunk.join(','),
      maxResults: 50
    }, apiKey);
    channels.push(...(data.items || []));
  }
  return channels;
}

async function analyzeChannel(channel, options) {
  const stats = channel.statistics || {};
  const subscriberCount = Number(stats.hiddenSubscriberCount ? 0 : stats.subscriberCount || 0);
  if (!subscriberCount || subscriberCount < options.minSubscribers || subscriberCount > options.maxSubscribers) {
    return null;
  }

  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) return null;

  const videos = await getRecentVideos(uploadsPlaylist, options.apiKey, 12);
  if (!videos.length) return null;

  const cutoff = Date.now() - (options.recentDays * 24 * 60 * 60 * 1000);
  const recentVideos = videos.filter((video) => new Date(video.publishedAt).getTime() >= cutoff);
  if (recentVideos.length < options.minUploads) return null;

  const avgViews = average(recentVideos.map((video) => video.viewCount));
  const avgDurationSeconds = average(recentVideos.map((video) => video.durationSeconds));
  const viewToSubRatio = subscriberCount ? avgViews / subscriberCount : 0;
  if (viewToSubRatio > options.maxViewRatio) return null;

  const uploadCadenceDays = cadenceDays(recentVideos);
  const contact = extractContact(channel);
  const qualitySignals = getQualitySignals(recentVideos, channel, avgDurationSeconds);
  const score = scoreLead({
    subscriberCount,
    viewToSubRatio,
    recentUploadCount: recentVideos.length,
    uploadCadenceDays,
    contact,
    qualitySignals
  });

  return {
    id: channel.id,
    title: channel.snippet?.title || 'Untitled channel',
    channelUrl: `https://www.youtube.com/channel/${channel.id}`,
    description: channel.snippet?.description || '',
    thumbnail: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || '',
    subscriberCount,
    totalViews: Number(stats.viewCount || 0),
    totalVideos: Number(stats.videoCount || 0),
    avgRecentViews: Math.round(avgViews),
    viewToSubRatio: Number(viewToSubRatio.toFixed(3)),
    recentUploadCount: recentVideos.length,
    uploadCadenceDays,
    score,
    leadTier: score >= 78 ? 'Hot' : score >= 58 ? 'Warm' : 'Watch',
    contactLinks: contact.links,
    emails: contact.emails,
    reasons: buildReasons({ subscriberCount, viewToSubRatio, recentVideos, uploadCadenceDays, contact, qualitySignals }),
    recentVideos: recentVideos.map((video) => ({
      title: video.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      publishedAt: video.publishedAt,
      views: video.viewCount,
      duration: video.duration,
      durationSeconds: video.durationSeconds,
      thumbnail: video.thumbnail
    }))
  };
}

async function getRecentVideos(playlistId, apiKey, limit) {
  const playlist = await youtubeGet('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: limit
  }, apiKey);

  const ids = (playlist.items || [])
    .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];

  const data = await youtubeGet('videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
    maxResults: ids.length
  }, apiKey);

  return (data.items || []).map((video) => ({
    id: video.id,
    title: video.snippet?.title || 'Untitled video',
    publishedAt: video.snippet?.publishedAt,
    viewCount: Number(video.statistics?.viewCount || 0),
    duration: video.contentDetails?.duration || '',
    durationSeconds: parseDuration(video.contentDetails?.duration || ''),
    thumbnail: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || ''
  }));
}

function extractContact(channel) {
  const text = [
    channel.snippet?.description || '',
    channel.brandingSettings?.channel?.description || ''
  ].join('\n');
  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const links = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return {
    emails: unique(emailMatches).slice(0, 3),
    links: unique(links.map((link) => link.replace(/[.,;]+$/, ''))).slice(0, 6)
  };
}

function getQualitySignals(videos, channel, avgDurationSeconds) {
  const titles = videos.map((video) => video.title);
  const longTitles = titles.filter((title) => title.length > 72).length;
  const shortTitles = titles.filter((title) => title.length < 28).length;
  const genericTitles = titles.filter((title) => /\b(vlog|episode|update|part\s?\d+|random|live|stream)\b/i.test(title)).length;
  const longVideos = videos.filter((video) => video.durationSeconds > 900).length;
  const hasBrandDescription = Boolean(channel.brandingSettings?.channel?.description || channel.snippet?.description);
  return {
    longTitles,
    shortTitles,
    genericTitles,
    longVideos,
    avgDurationSeconds: Math.round(avgDurationSeconds || 0),
    missingDescription: !hasBrandDescription
  };
}

function scoreLead({ subscriberCount, viewToSubRatio, recentUploadCount, uploadCadenceDays, contact, qualitySignals }) {
  let score = 0;
  if (subscriberCount >= 3000 && subscriberCount <= 30000) score += 22;
  else score += 12;

  if (viewToSubRatio <= 0.05) score += 24;
  else if (viewToSubRatio <= 0.1) score += 18;
  else score += 10;

  if (recentUploadCount >= 8) score += 18;
  else if (recentUploadCount >= 4) score += 13;
  else score += 6;

  if (uploadCadenceDays && uploadCadenceDays <= 7) score += 12;
  else if (uploadCadenceDays && uploadCadenceDays <= 14) score += 8;

  if (contact.emails.length || contact.links.length) score += 10;
  if (qualitySignals.genericTitles || qualitySignals.longTitles || qualitySignals.longVideos) score += 10;
  if (qualitySignals.missingDescription) score += 4;

  return Math.min(100, score);
}

function buildReasons({ subscriberCount, viewToSubRatio, recentVideos, uploadCadenceDays, contact, qualitySignals }) {
  const reasons = [];
  reasons.push(`${subscriberCount.toLocaleString()} subscribers with ${Math.round(viewToSubRatio * 100)}% recent view/subscriber ratio.`);
  reasons.push(`${recentVideos.length} uploads in the selected recent window.`);
  if (uploadCadenceDays) reasons.push(`Posts about every ${uploadCadenceDays} days.`);
  if (contact.emails.length || contact.links.length) reasons.push('Has public contact links or email-like contact info.');
  if (qualitySignals.genericTitles) reasons.push('Some recent titles look generic or episode-style.');
  if (qualitySignals.longTitles) reasons.push('Some titles are long and may need packaging help.');
  if (qualitySignals.longVideos) reasons.push('Long-form videos may benefit from tighter editing and hooks.');
  if (qualitySignals.missingDescription) reasons.push('Channel description is sparse, suggesting weak positioning.');
  return reasons;
}

function parseDuration(value) {
  const match = String(value).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function cadenceDays(videos) {
  const timestamps = videos.map((video) => new Date(video.publishedAt).getTime()).filter(Boolean).sort((a, b) => b - a);
  if (timestamps.length < 2) return null;
  const gaps = [];
  for (let i = 0; i < timestamps.length - 1; i += 1) gaps.push((timestamps[i] - timestamps[i + 1]) / 86400000);
  return Math.max(1, Math.round(average(gaps)));
}

function unique(values) {
  return Array.from(new Set(values));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function leadsToCsv(leads) {
  const headers = [
    'Tier',
    'Score',
    'Channel',
    'Channel URL',
    'Subscribers',
    'Avg Recent Views',
    'View/Sub Ratio',
    'Recent Uploads',
    'Cadence Days',
    'Emails',
    'Links',
    'Reasons'
  ];
  const rows = leads.map((lead) => [
    lead.leadTier,
    lead.score,
    lead.title,
    lead.channelUrl,
    lead.subscriberCount,
    lead.avgRecentViews,
    lead.viewToSubRatio,
    lead.recentUploadCount,
    lead.uploadCadenceDays || '',
    (lead.emails || []).join(' | '),
    (lead.contactLinks || []).join(' | '),
    (lead.reasons || []).join(' | ')
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function exportLeadsCsv(filePath, leads) {
  await fs.writeFile(filePath, leadsToCsv(leads), 'utf8');
  return filePath;
}

module.exports = {
  exportLeadsCsv,
  findLeads,
  leadsToCsv
};
