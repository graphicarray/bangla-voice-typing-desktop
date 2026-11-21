'use strict';

const $ = (id) => document.getElementById(id);
let cfg = {};

function setStatus(text, cls = '', el = 'status') {
  $(el).textContent = text;
  $(el).className = [$(el).dataset.base, cls].filter(Boolean).join(' ');
}
const save = (patch) => { Object.assign(cfg, patch); return window.api.setConfig(patch); };

async function loadModels() {
  if (!cfg.apiKey) return setStatus('Add your API key first', 'err', 'modelStatus');
  setStatus('Loading models…', '', 'modelStatus');
  const r = await window.api.listModels(cfg.apiKey);
  if (!r.ok) return setStatus('Could not load models: ' + r.error, 'err', 'modelStatus');
  const sel = $('model');
  sel.textContent = '';
  for (const m of r.list) sel.add(new Option(`${m.label} (${m.id})`, m.id));
  const ids = r.list.map((m) => m.id);
  sel.value = ids.includes(cfg.model) ? cfg.model : r.defaultId;
  await save({ model: sel.value });
  setStatus(`${r.list.length} models loaded`, 'ok', 'modelStatus');
}

$('saveKey').addEventListener('click', async () => {
  await save({ apiKey: $('apiKey').value.trim() });
  loadModels();
});
$('model').addEventListener('change', (e) => save({ model: e.target.value }));
$('insertMode').addEventListener('change', (e) => save({ insertMode: e.target.value }));
for (const k of ['keepEn', 'bnDigits', 'clickBtn', 'autoStart']) {
  $(k).addEventListener('change', (e) => save({ [k]: e.target.checked }));
}

$('changeKey').addEventListener('click', async () => {
  const box = $('hotkey');
  const old = box.textContent;
  box.textContent = 'Press the new keys…';
  box.classList.add('listening');
  $('changeKey').disabled = true;
  setStatus('Hold a modifier (Ctrl / Alt / Shift / Win) and press a key. Esc cancels.', '', 'hotkeyMsg');
  const r = await window.api.captureHotkey();
  box.classList.remove('listening');
  $('changeKey').disabled = false;
  if (r.ok) {
    box.textContent = r.label;
    setStatus(`Saved. Hold ${r.label} in any app, speak, then release.`, 'ok', 'hotkeyMsg');
  } else {
    box.textContent = old;
    setStatus(r.error || 'Cancelled', r.error ? 'err' : '', 'hotkeyMsg');
  }
});

$('grant').addEventListener('click', async () => {
  setStatus('Checking…');
  const r = await window.api.testMic();
  r.ok ? setStatus('✓ Microphone works', 'ok') : setStatus(r.error, 'err');
});

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('last').value);
  setStatus('Copied', 'ok');
});

window.api.onLast((t) => { $('last').value = t; });

(async () => {
  cfg = await window.api.getConfig();
  $('apiKey').value = cfg.apiKey;
  $('keepEn').checked = cfg.keepEn;
  $('bnDigits').checked = cfg.bnDigits;
  $('clickBtn').checked = cfg.clickBtn;
  $('autoStart').checked = cfg.autoStart;
  $('insertMode').value = cfg.insertMode;
  $('last').value = cfg.last;
  $('hotkey').textContent = cfg.hotkeyLabel;
  $('ver').textContent = 'v' + cfg.version.replace(/\.0$/, '');
  if (cfg.model) { $('model').textContent = ''; $('model').add(new Option(cfg.model, cfg.model)); }
  if (cfg.apiKey) loadModels();
})();
