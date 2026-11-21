'use strict';
// Ported 1:1 from the extension's offscreen.js / popup.js (same prompt, same API calls).
// Runs in the main process, so there is no CORS to worry about.

const API = 'https://generativelanguage.googleapis.com/v1beta';

function buildPrompt(cfg) {
  const digits = cfg.bnDigits !== false
    ? 'Write numbers, dates, prices, times and phone numbers with Bangla digits (০১২৩৪৫৬৭৮৯), e.g. ১২৫ টাকা, ২০২৬ সাল, সকাল ১০টা। Small counting words in ordinary speech (এক, দুই, কয়েক) stay as words.'
    : 'Write numbers, dates, prices, times and phone numbers with ASCII digits (0-9). Small counting words in ordinary speech stay as words.';
  const english = cfg.keepEn
    ? 'If the speaker clearly says an English word, name, brand or technical term, write it in English letters (e.g. Facebook, Gmail, Zoom). All other words stay in Bangla script.'
    : 'Write English words the speaker uses in Bangla script (e.g. ফেসবুক, জিমেইল, মিটিং, ইন্টারনেট). Use Latin letters only for email addresses, URLs and code.';

  return `You are a professional Bangla (Bengali) speech-to-text engine used for typing.
Listen to the attached audio and write exactly what the main speaker said, in Bangla.

RULES
1. Language: output Bangla script (বাংলা) only. Never translate, summarize, explain, or answer the speaker. If the speaker asks a question, just transcribe it.
2. Keep the speaker's own words and style (চলিত or সাধু). Do not rewrite or formalize. Use correct standard Bangla Academy spelling: correct যুক্তাক্ষর, হসন্ত, রেফ, ফলা, ও-কার/ো, ণ/ন, শ/ষ/স, ড়/ঢ়, চন্দ্রবিন্দু. Never output Hindi, Urdu, or Devanagari words or letters.
3. Clean the speech: drop background noise, silence, coughs, breaths, music, and other people's voices. Remove filler sounds used only as hesitation (আ, আঁ, উম, হুম, ইয়ে), stutters, false starts, and accidental repeated words.
4. Punctuation: add natural punctuation. End sentences with দাঁড়ি "।" (never "."). Use , ; : ? ! and "—" where fitting. Use “ ” for quoted speech. No space before punctuation, one space after. Use a blank line only for a clear change of topic.
5. If the speaker dictates a punctuation command, write the symbol instead of the word: দাঁড়ি → ।, কমা → ,, প্রশ্নচিহ্ন → ?, বিস্ময়চিহ্ন → !, নতুন লাইন → line break, নতুন অনুচ্ছেদ → blank line.
6. Numbers: ${digits}
7. English words: ${english}
8. Output ONLY the final text. No title, no label, no note, no markdown, no surrounding quotes. If there is no clear human speech, output exactly: NO_SPEECH`;
}

async function transcribe(wavBase64, cfg) {
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: buildPrompt(cfg) }, { inlineData: { mimeType: 'audio/wav', data: wavBase64 } }],
    }],
    generationConfig: { temperature: 0 },
  };
  let r;
  try {
    r = await fetch(`${API}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Network error. Check your internet connection.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  if (j.promptFeedback?.blockReason) throw new Error('Blocked by Gemini: ' + j.promptFeedback.blockReason);
  const parts = j.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  return text === 'NO_SPEECH' ? '' : text;
}

// Prefer a stable (non-preview) full-size flash model.
function pickDefault(ids) {
  const bad = /lite|image|tts|live|audio|embed|robot|computer|8b|thinking|learnlm|gemma|aqa|imagen|veo/i;
  const pre = (id) => (/preview|exp/i.test(id) ? 1 : 0);
  const flash = ids
    .filter((id) => /gemini/i.test(id) && /flash/i.test(id) && !bad.test(id))
    .sort((a, b) => pre(a) - pre(b) || b.localeCompare(a, 'en', { numeric: true }));
  return flash[0] || ids.find((id) => /gemini/i.test(id)) || ids[0] || '';
}

async function listModels(apiKey) {
  if (!apiKey) throw new Error('Add your API key first');
  let all = [], token = '';
  do {
    const url = `${API}/models?pageSize=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`;
    let r;
    try { r = await fetch(url, { headers: { 'x-goog-api-key': apiKey } }); }
    catch { throw new Error('Network error. Check your internet connection.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || r.statusText);
    all = all.concat(j.models || []);
    token = j.nextPageToken || '';
  } while (token);

  const list = all
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  if (!list.length) throw new Error('No models found for this key');
  return { list, defaultId: pickDefault(list.map((m) => m.id)) };
}

module.exports = { transcribe, listModels, buildPrompt };
