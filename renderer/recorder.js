'use strict';
// Hidden window: records the mic and returns a 16 kHz mono WAV (base64).
// Audio handling is carried over unchanged from the extension's offscreen.js.

let rec = null, stream = null, chunks = [], t0 = 0;

async function start() {
  if (rec && rec.state === 'recording') return { ok: true };
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return { error: 'mic' };
  }
  chunks = [];
  rec = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : {});
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(250);
  t0 = Date.now();
  return { ok: true };
}

async function halt() {
  if (rec && rec.state !== 'inactive') await new Promise((done) => { rec.onstop = done; rec.stop(); });
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

async function cancel() {
  await halt();
  chunks = [];
  return { ok: true };
}

async function stop() {
  if (!rec) return { error: 'Not recording' };
  await halt();
  if (Date.now() - t0 < 700) return { error: 'Too short, try again' };
  try {
    const wav = await toWav(new Blob(chunks, { type: rec.mimeType }));
    return { wav: await toBase64(wav) };
  } catch (e) {
    return { error: 'Could not process audio: ' + e.message };
  }
}

// Decode → 16 kHz mono WAV, with a gain lift for quiet voices (max x8).
async function toWav(blob) {
  const ac = new AudioContext();
  const audio = await ac.decodeAudioData(await blob.arrayBuffer());
  ac.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
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

window.rec = { start, stop, cancel };
