'use strict';
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  apiKey: '',
  model: '',
  keepEn: false,
  bnDigits: true,
  clickBtn: false,
  last: '',
  insertMode: 'paste', // 'paste' (clipboard + Ctrl+V) or 'type' (simulated keystrokes)
  autoStart: true,     // start with Windows (default on)
  autoStartInit: false, // one-time migration flag for older installs
  lang: 'bn',          // output language: 'bn' | 'en' | 'auto'
  livePreview: true,   // show live text in the overlay while speaking
  hotkey: { key: 'B', ctrl: true, alt: true, shift: false, meta: false },
};

const file = () => path.join(app.getPath('userData'), 'config.json');
let cfg = { ...DEFAULTS };
let writing = Promise.resolve();

async function load() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (j.apiKeyEnc) {
      try { j.apiKey = (await safeStorage.decryptStringAsync(Buffer.from(j.apiKeyEnc, 'base64'))).result; }
      catch { j.apiKey = ''; }
    }
    delete j.apiKeyEnc;
    cfg = { ...DEFAULTS, ...j, hotkey: { ...DEFAULTS.hotkey, ...(j.hotkey || {}) } };
  } catch {
    cfg = { ...DEFAULTS };
  }
  return cfg;
}

// Saves are queued so they never overlap. In-memory config updates immediately.
function persist() {
  const out = { ...cfg };
  writing = writing.then(async () => {
    // The API key is encrypted with Windows DPAPI (tied to this Windows user account).
    if (out.apiKey) {
      try {
        out.apiKeyEnc = (await safeStorage.encryptStringAsync(out.apiKey)).toString('base64');
        delete out.apiKey;
      } catch { /* encryption unavailable: key stays in the file as plain text */ }
    }
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, file());
  }).catch((e) => console.error('config save failed:', e));
  return writing;
}

const get = () => cfg;
function set(patch) {
  cfg = { ...cfg, ...patch };
  return persist();
}
const flush = () => writing;

module.exports = { load, get, set, flush, DEFAULTS };
