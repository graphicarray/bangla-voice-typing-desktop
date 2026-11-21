'use strict';
// Types text into whatever Windows app has focus, using Win32 SendInput via koffi.

const { clipboard, ClipboardItem } = require('electron');
const koffi = require('koffi');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let SendInput, INPUT_SIZE;
function init() {
  if (SendInput) return;
  const user32 = koffi.load('user32.dll');
  const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  // INPUT = 4-byte type + 4 pad + a 32-byte union (MOUSEINPUT is the largest member) = 40 bytes on x64.
  const INPUT = koffi.struct('INPUT', { type: 'uint32', ki: KEYBDINPUT, pad: koffi.array('uint8', 8) });
  SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)');
  INPUT_SIZE = koffi.sizeof(INPUT);
}

const KEYUP = 0x0002, UNICODE = 0x0004;
const VK = { SHIFT: 0x10, CONTROL: 0x11, RETURN: 0x0D, V: 0x56 };

function key(wVk, up = false, wScan = 0, flags = 0) {
  init();
  SendInput(1, { type: 1, ki: { wVk, wScan, dwFlags: flags | (up ? KEYUP : 0), time: 0, dwExtraInfo: 0 }, pad: new Uint8Array(8) }, INPUT_SIZE);
}
const tap = (wVk) => { key(wVk); key(wVk, true); };

// Snapshot every format currently on the clipboard so it can be put back after pasting.
async function snapshot() {
  try {
    const snap = [];
    for (const item of await clipboard.read()) {
      const rec = {};
      for (const t of item.types) { try { rec[t] = await item.getType(t); } catch { /* skip unreadable type */ } }
      if (Object.keys(rec).length) snap.push(rec);
    }
    return snap;
  } catch {
    return [];
  }
}

async function restore(snap) {
  if (!snap.length) return clipboard.clear();
  try {
    await clipboard.write(snap.map((rec) => new ClipboardItem(rec)));
  } catch { // exotic format refused: fall back to plain text only
    const plain = snap.find((r) => r['text/plain']);
    if (plain) await clipboard.writeText(await plain['text/plain'].text());
    else clipboard.clear();
  }
}

async function paste(text) {
  const prev = await snapshot();
  await clipboard.writeText(text);
  await sleep(50);
  key(VK.CONTROL); key(VK.V); key(VK.V, true); key(VK.CONTROL, true);
  await sleep(350); // let the target app read the clipboard before we restore it
  if ((await clipboard.readText()) === text) await restore(prev);
}

function typeKeys(text) {
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    if (ch === '\n') { // Shift+Enter: a line break that won't "send" in chat boxes
      key(VK.SHIFT); tap(VK.RETURN); key(VK.SHIFT, true);
      continue;
    }
    for (let i = 0; i < ch.length; i++) { // UTF-16 units (handles emoji surrogate pairs too)
      const u = ch.charCodeAt(i);
      key(0, false, u, UNICODE);
      key(0, true, u, UNICODE);
    }
  }
}

async function insertText(text, mode) {
  if (mode === 'type') typeKeys(text);
  else await paste(text);
}

module.exports = { insertText, _test: { snapshot, restore } };
