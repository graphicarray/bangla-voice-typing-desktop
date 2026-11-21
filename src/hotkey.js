'use strict';
// System-wide hold-to-talk using a low-level keyboard hook (uiohook-napi).
// Electron's own globalShortcut can't report key *release*, which hold-to-talk needs.

const { uIOhook, UiohookKey: K } = require('uiohook-napi');

const MOD_CODES = {
  ctrl: [K.Ctrl, K.CtrlRight],
  alt: [K.Alt, K.AltRight],
  shift: [K.Shift, K.ShiftRight],
  meta: [K.Meta, K.MetaRight],
};
const ALL_MOD_CODES = new Set(Object.values(MOD_CODES).flat());
const codeToName = {};
for (const [name, code] of Object.entries(K)) if (!(code in codeToName)) codeToName[code] = name;

const label = (hk) =>
  [hk.ctrl && 'Ctrl', hk.alt && 'Alt', hk.shift && 'Shift', hk.meta && 'Win', hk.key].filter(Boolean).join(' + ');

let hotkey = null;
let onStart = () => {}, onStop = () => {};
let holding = false;
let capture = null; // { resolve }

function matches(e) {
  return hotkey
    && e.keycode === K[hotkey.key]
    && !!e.ctrlKey === !!hotkey.ctrl
    && !!e.altKey === !!hotkey.alt
    && !!e.shiftKey === !!hotkey.shift
    && !!e.metaKey === !!hotkey.meta;
}

function releasedPart(e) {
  if (!hotkey) return false;
  if (e.keycode === K[hotkey.key]) return true;
  return Object.keys(MOD_CODES).some((m) => hotkey[m] && MOD_CODES[m].includes(e.keycode));
}

uIOhook.on('keydown', (e) => {
  if (capture) {
    if (ALL_MOD_CODES.has(e.keycode)) return; // wait for the real key
    const { resolve } = capture;
    capture = null;
    const key = codeToName[e.keycode];
    if (key === 'Escape') return resolve({ cancelled: true });
    const isFn = /^F\d+$/.test(key || '');
    const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
    if (!key) return resolve({ error: 'That key is not supported' });
    if (!hasMod && !isFn) return resolve({ error: 'Include Ctrl, Alt, Shift or Win (or use an F-key)' });
    return resolve({ hotkey: { key, ctrl: !!e.ctrlKey, alt: !!e.altKey, shift: !!e.shiftKey, meta: !!e.metaKey } });
  }
  if (!holding && matches(e)) { holding = true; onStart(); }
});

uIOhook.on('keyup', (e) => {
  if (holding && releasedPart(e)) { holding = false; onStop(); }
});

module.exports = {
  label,
  setHotkey(hk) { hotkey = hk; },
  start(handlers) {
    onStart = handlers.onStart;
    onStop = handlers.onStop;
    uIOhook.start();
  },
  stop() { try { uIOhook.stop(); } catch { /* not started */ } },
  // Resolves with { hotkey } | { cancelled } | { error } on the next key press.
  capture() {
    return new Promise((resolve) => {
      holding = false;
      capture = { resolve };
      setTimeout(() => { if (capture && capture.resolve === resolve) { capture = null; resolve({ cancelled: true }); } }, 15000);
    });
  },
};
