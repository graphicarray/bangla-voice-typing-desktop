'use strict';
// Hidden window: records the mic as raw PCM and returns a 16 kHz mono WAV (base64).
// stop() returns the whole recording; snapshot() returns the most recent seconds
// while recording continues (used for the live preview).

let stream = null, ctx = null, node = null, mute = null, srcNode = null;
let blocks = [], total = 0, rate = 48000, t0 = 0, active = false;

async function start() {
  if (active) return { ok: true };
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return { error: 'mic' };
  }
  ctx = new AudioContext();
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  rate = ctx.sampleRate;
  blocks = [];
  total = 0;
  srcNode = ctx.createMediaStreamSource(stream);
  node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    if (!active) return;
    const d = new Float32Array(e.inputBuffer.getChannelData(0)); // copy: the buffer is reused
    blocks.push(d);
    total += d.length;
  };
  mute = ctx.createGain();
  mute.gain.value = 0; // the processor only runs when connected to the output
  srcNode.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  active = true;
  t0 = Date.now();
  return { ok: true };
}

function teardown() {
  active = false;
  try { node && (node.onaudioprocess = null); } catch {}
  try { srcNode && srcNode.disconnect(); } catch {}
  try { node && node.disconnect(); } catch {}
  try { mute && mute.disconnect(); } catch {}
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ctx) ctx.close().catch(() => {});
  stream = ctx = node = mute = srcNode = null;
}

async function cancel() {
  teardown();
  blocks = [];
  total = 0;
  return { ok: true };
}

// Join the last `maxSec` seconds (or everything when maxSec is falsy) into one Float32Array.
function join(maxSec) {
  let want = total;
  if (maxSec) want = Math.min(total, Math.round(maxSec * rate));
  const out = new Float32Array(want);
  let pos = want;
  for (let i = blocks.length - 1; i >= 0 && pos > 0; i--) {
    const b = blocks[i];
    const n = Math.min(b.length, pos);
    out.set(b.subarray(b.length - n), pos - n);
    pos -= n;
  }
  return out;
}

async function stop() {
  if (!active) return { error: 'Not recording' };
  const dur = Date.now() - t0;
  const r = rate;
  const pcm = join(0);
  teardown();
  blocks = [];
  total = 0;
  if (dur < 700) return { error: 'Too short, try again' };
  try {
    return { wav: await toBase64(await toWav(pcm, r)) };
  } catch (e) {
    return { error: 'Could not process audio: ' + e.message };
  }
}

// Live preview: last few seconds of audio, recording keeps going.
async function snapshot(maxSec) {
  if (!active || total < rate * 1.2) return { wav: '' };
  try {
    return { wav: await toBase64(await toWav(join(maxSec), rate)) };
  } catch {
    return { wav: '' };
  }
}

// Resample to 16 kHz mono WAV, with a gain lift for quiet voices (max x8).
async function toWav(input, inRate) {
  const buf = new AudioBuffer({ length: input.length, numberOfChannels: 1, sampleRate: inRate });
  buf.copyToChannel(input, 0);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);

  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const gain = peak > 0.001 ? Math.min(8, 0.9 / peak) : 1;

  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i] * gain));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

const toBase64 = (blob) =>
  new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(String(f.result).split(',')[1]);
    f.onerror = () => rej(f.error);
    f.readAsDataURL(blob);
  });

window.rec = { start, stop, cancel, snapshot };
