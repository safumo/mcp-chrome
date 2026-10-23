#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const entry = path.join(__dirname, '..', 'dist', 'scripts', 'postinstall.js');

if (!fs.existsSync(entry)) {
  console.log('[mcp-chrome-bridge] dist/ not built yet, skipping postinstall');
  process.exit(0);
}

const result = spawnSync(process.execPath, [entry], { stdio: 'inherit' });
process.exit(result.status == null ? 0 : result.status);
