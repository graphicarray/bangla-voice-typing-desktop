'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, session, screen, nativeImage, shell, clipboard } = require('electron');
const path = require('path');
const config = require('./config');
const gemini = require('./gemini');
const hotkey = require('./hotkey');
const { insertText } = require('./inject');

const MAX_SEC = 420; // keeps the WAV under Gemini's 20 MB inline limit
const ASSETS = path.join(__dirname, '..', 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => showSettings());

let tray, settingsWin, overlayWin, recorderWin;
let state = 'idle'; // idle | rec | busy
let hideTimer, autoStopTimer;

/* ------------------------------ windows ------------------------------ */

function showSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 396, height: Math.min(860, screen.getPrimaryDisplay().workAreaSize.height - 40),
    title: 'Bangla Voice Typing', icon: path.join(ASSETS, 'icon.png'),
    backgroundColor: '#001E36', autoHideMenuBar: true, maximizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true, sandbox: true },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(RENDERER, 'settings.html'));
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  settingsWin.webContents.on('will-navigate', (e, url) => { e.preventDefault(); shell.openExternal(url); });
  settingsWin.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); settingsWin.hide(); } }); // keep running in tray
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 440, height: 150, show: false, frame: false, transparent: true, resizable: false, hasShadow: false,
    focusable: false, skipTaskbar: true, alwaysOnTop: true, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload-overlay.js'), contextIsolation: true, sandbox: true },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile(path.join(RENDERER, 'overlay.html'));
}

function createRecorder() {
  recorderWin = new BrowserWindow({
    show: false, width: 200, height: 200,
    webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', contextIsolation: true, sandbox: true },
  });
  recorderWin.loadFile(path.join(RENDERER, 'recorder.html'));
}

const recorder = (fn, ...args) =>
  recorderWin.webContents.executeJavaScript(`window.rec.${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`);

/* ------------------------------ overlay ------------------------------ */

function placeOverlay() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const b = overlayWin.getBounds();
  overlayWin.setPosition(d.workArea.x + d.workArea.width - b.width - 12, d.workArea.y + d.workArea.height - b.height - 12);
}
const alwaysShown = () => !!config.get().clickBtn;

function ui(st, msg = '') {
  state = st === 'idle' ? 'idle' : st;
  if (!overlayWin || overlayWin.isDestroyed()) return;
  clearTimeout(hideTimer);
  overlayWin.webContents.send('ui', { state: st, msg });
  if (st !== 'idle' || msg || alwaysShown()) {
    placeOverlay();
    overlayWin.showInactive();
    if (st === 'idle' && msg && !alwaysShown()) hideTimer = setTimeout(() => overlayWin.hide(), 3500);
  } else {
    overlayWin.hide();
  }
}

/* --------------------------- live preview --------------------------- */
// While you speak, the last few seconds of audio are transcribed every couple of
// seconds and shown in the floating overlay. The final, clean text is still typed
// into your app when you release the key.

const PREVIEW_DELAY = 1800, PREVIEW_GAP = 1200, PREVIEW_WINDOW_SEC = 14;
let previewTimer, previewSeq = 0;

function stopPreview() {
  previewSeq++;
  clearTimeout(previewTimer);
}

function startPreview() {
  stopPreview();
  if (config.get().livePreview === false) return;
  const my = previewSeq;
  const live = () => my === previewSeq && state === 'rec';
  const tick = async () => {
    if (!live()) return;
    try {
      const s = await recorder('snapshot', PREVIEW_WINDOW_SEC);
      if (live() && s && s.wav) {
        const text = await gemini.transcribe(s.wav, config.get());
        if (live() && text && overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('live', text);
      }
    } catch { /* preview is best-effort; ignore errors */ }
    if (live()) previewTimer = setTimeout(tick, PREVIEW_GAP);
  };
  previewTimer = setTimeout(tick, PREVIEW_DELAY);
}

/* --------------------------- record + insert --------------------------- */

// Actions run one at a time, so a quick press-and-release can't race.
let q = Promise.resolve();
const queue = (kind) => (q = q.then(() => act(kind)).catch((e) => console.error(e)));

async function act(kind) {
  const recording = state === 'rec';
  if ((kind === 'start' && recording) || (kind === 'stop' && !recording)) return;
  return recording ? finish() : begin();
}

async function begin() {
  const cfg = config.get();
  if (!cfg.apiKey || !cfg.model) {
    ui('idle', 'Open Bangla Voice Typing and add your API key + model');
    showSettings();
    return;
  }
  const r = await recorder('start');
  if (r.error) {
    ui('idle', 'Microphone blocked. Allow it in Windows Settings → Privacy → Microphone');
    shell.openExternal('ms-settings:privacy-microphone');
    return;
  }
  ui('rec');
  startPreview();
  autoStopTimer = setTimeout(() => queue('stop'), MAX_SEC * 1000);
}

async function finish() {
  clearTimeout(autoStopTimer);
  stopPreview();
  ui('busy');
  const cfg = config.get();
  const r = await recorder('stop');
  if (r.error) return ui('idle', r.error);
  let text;
  try {
    text = await gemini.transcribe(r.wav, cfg);
  } catch (e) {
    return ui('idle', e.message);
  }
  if (!text) return ui('idle', 'No speech heard');
  config.set({ last: text });
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('last', text);
  try {
    await insertText(text + ' ', cfg.insertMode);
    ui('idle', 'Inserted');
  } catch (e) {
    console.error('insert failed:', e);
    await clipboard.writeText(text);
    ui('idle', 'Could not type into that app. Text copied to clipboard.');
  }
}

/* ------------------------------ tray & misc ------------------------------ */

function applyAutoStart() {
  if (!app.isPackaged) return; // don't register the dev Electron binary
  app.setLoginItemSettings({ openAtLogin: !!config.get().autoStart, args: ['--hidden'] });
}

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.setToolTip('Bangla Voice Typing');
  const menu = () => Menu.buildFromTemplate([
    { label: `Hold ${hotkey.label(config.get().hotkey)} to dictate`, enabled: false },
    { type: 'separator' },
    { label: 'Open settings', click: showSettings },
    { label: 'Copy last transcript', enabled: !!config.get().last, click: () => { clipboard.writeText(config.get().last); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.on('click', showSettings);
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
}

function registerIpc() {
  ipcMain.handle('cfg:get', () => ({ ...config.get(), hotkeyLabel: hotkey.label(config.get().hotkey), version: app.getVersion() }));
  ipcMain.handle('cfg:set', (_e, patch) => {
    const allowed = ['apiKey', 'model', 'keepEn', 'bnDigits', 'clickBtn', 'insertMode', 'autoStart', 'lang', 'livePreview'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('lang' in clean && !['bn', 'en', 'auto'].includes(clean.lang)) delete clean.lang;
    config.set(clean);
    if ('autoStart' in clean) applyAutoStart();
    if ('clickBtn' in clean && state === 'idle') ui('idle');
    return true;
  });
  ipcMain.handle('models:list', async (_e, apiKey) => {
    try { return { ok: true, ...(await gemini.listModels(apiKey)) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('hotkey:capture', async () => {
    const r = await hotkey.capture();
    if (r.hotkey) {
      config.set({ hotkey: r.hotkey });
      hotkey.setHotkey(r.hotkey);
      return { ok: true, label: hotkey.label(r.hotkey) };
    }
    return { ok: false, cancelled: !!r.cancelled, error: r.error };
  });
  ipcMain.handle('mic:test', async () => {
    if (state !== 'idle') return { ok: false, error: 'Busy right now' };
    const r = await recorder('start');
    if (r.error) { shell.openExternal('ms-settings:privacy-microphone'); return { ok: false, error: 'Microphone blocked. Windows Settings opened: allow microphone access for desktop apps.' }; }
    await recorder('cancel');
    return { ok: true };
  });
  ipcMain.on('overlay:toggle', () => queue('toggle'));
  ipcMain.on('overlay:hover', (_e, over) => {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(!over, { forward: true });
  });
}

/* -------------------------------- boot -------------------------------- */

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  app.setAppUserModelId('com.graphicarray.banglavoicetyping');
  await config.load();

  // The only permission this app ever needs is the microphone.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');

  registerIpc();
  createRecorder();
  createOverlay();
  buildTray();
  // Older installs had auto-start off: switch it on once. The checkbox in settings can still turn it off.
  if (!config.get().autoStartInit) config.set({ autoStart: true, autoStartInit: true });
  applyAutoStart();

  hotkey.setHotkey(config.get().hotkey);
  hotkey.start({ onStart: () => queue('start'), onStop: () => queue('stop') });

  if (alwaysShown()) ui('idle');
  const cfg = config.get();
  // Always start in the background (tray) once set up. Only show settings on first run (no API key).
  if (!cfg.apiKey) showSettings();
  else ui('idle', `Running in background. Hold ${hotkey.label(cfg.hotkey)} to dictate`);
});

app.on('window-all-closed', () => { /* stay alive in the tray */ });
app.on('before-quit', () => { app.isQuitting = true; hotkey.stop(); });
app.on('will-quit', (e) => { e.preventDefault(); config.flush().finally(() => app.exit(0)); }); // let a pending save finish
