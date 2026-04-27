const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'src/main/main.js',
  'src/main/downloader.js',
  'src/main/formatParser.js',
  'src/main/leadFinder.js',
  'src/main/settingsStore.js',
  'src/main/queueManager.js',
  'src/preload/preload.js',
  'src/renderer/renderer.js',
  'src/renderer/components/DownloadCard.js',
  'src/renderer/components/FormatSelector.js',
  'src/renderer/components/SettingsPanel.js'
];

for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing ${file}`);
  }
  new Function(fs.readFileSync(full, 'utf8'));
}

console.log('Syntax check passed.');
