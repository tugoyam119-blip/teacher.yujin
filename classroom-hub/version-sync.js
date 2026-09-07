'use strict';

const fs = require('fs');
const path = require('path');

const registryFile = path.join(__dirname, 'data', 'registry.seed.json');
try {
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  const app = registry.find(x => x && x.id === 'human-rights');
  if (app) {
    app.version = Math.max(Number(app.version || 0), 126);
    app.version_label = 'v12.5';
    app.updated_at = '2026-09-07T04:45:00.000Z';
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  }
} catch (err) {
  console.warn('human-rights version sync skipped:', err.message);
}

require('./server.js');
