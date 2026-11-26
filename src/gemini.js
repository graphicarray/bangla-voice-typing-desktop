'use strict';
// Ported 1:1 from the extension's offscreen.js / popup.js (same prompt, same API calls).
// Runs in the main process, so there is no CORS to worry about.

const API = 'https://generativelanguage.googleapis.com/v1beta';

function buildPrompt(cfg) {
  if (cfg.lang === 'en') return englishPrompt();
  if (cfg.lang === 'auto') return autoPrompt(cfg);
  return banglaPrompt(cfg);
}

// Output language = English. Any Bangla (or mixed) speech is translated to English.
function englishPrompt() {
  return `You are a professional speech-to-text and translation engine used for typing.
Listen to the attached audio. The speaker may speak Bangla (Bengali), English, or a mix of both, switching between them at any time.
Write what the speaker said as natural, fluent English text.

RULES
1. Language: output English only (Latin letters). Translate every Bangla (or other non-English) part into natural English and keep the English parts as spoken. Never leave Bangla script or any other script in the output. Write names of people and places in their usual English spelling. Never summarize, explain, or answer the speaker. If the speaker asks a question, just write that question.
2. Keep the speaker's meaning, tone and level of formality. Do not add or drop information.
3. Clean the speech: drop background noise, silence, coughs, breaths, music, and other people's voices. Remove filler sounds used only as hesitation (um, uh, hmm, আ, উম, ইয়ে), stutters, false starts, and accidental repeated words.
4. Punctuation: use standard English punctuation and capitalization. End sentences with "." (never "।"). No space before punctuation, one space after. Use a blank line only for a clear change of topic.
5. If the speaker dictates a punctuation command, write the symbol instead of the word: full stop / period / দাঁড়ি → ., comma / কমা → ,, question mark / প্রশ্নচিহ্ন → ?, exclamation mark / বিস্ময়চিহ্ন → !, new line / নতুন লাইন → line break, new paragraph / নতুন অনুচ্ছেদ → blank line.
6. Numbers: write numbers, dates, prices, times and phone numbers with ASCII digits (0-9). Never use Bangla digits. Small counting words in ordinary speech stay as words.
7. Output ONLY the final text. No title, no label, no note, no markdown, no surrounding quotes. If there is no clear human speech, output exactly: NO_SPEECH`;
}

// Auto: write each part in the language it was spoken in (Bangla or English). No translation.
function autoPrompt(cfg) {
  const digits = cfg.bnDigits !== false
    ? 'In Bangla parts write numbers, dates, prices, times and phone numbers with Bangla digits (০১২৩৪৫৬৭৮৯). In English parts use ASCII digits (0-9). Small counting words in ordinary speech stay as words.'
    : 'Write numbers, dates, prices, times and phone numbers with ASCII digits (0-9). Small counting words in ordinary speech stay as words.';
  const english = cfg.keepEn
    ? 'Inside Bangla sentences, if the speaker clearly says an English word, name, brand or technical term, write it in English letters (e.g. Facebook, Gmail, Zoom).'
    : 'Inside Bangla sentences, write English words the speaker uses in Bangla script (e.g. ফেসবুক, জিমেইল, মিটিং). Complete English sentences or phrases stay in English.';

  return `You are a professional speech-to-text engine used for typing.
Listen to the attached audio and write exactly what the main speaker said, in the language the speaker actually used. The speaker uses Bangla (Bengali) and/or English.

RULES
1. Language: automatic. Write Bangla speech in Bangla script (বাংলা) and English speech in English (Latin letters). If the speaker mixes both, keep each part in the language it was spoken in. Never translate, summarize, explain, or answer the speaker. If the speaker asks a question, just transcribe it. Never output Hindi, Urdu, or Devanagari words or letters.
2. Keep the speaker's own words and style. Use correct standard Bangla Academy spelling for Bangla parts (correct যুক্তাক্ষর, হসন্ত, রেফ, ফলা, ণ/ন, শ/ষ/স, ড়/ঢ়, চন্দ্রবিন্দু) and correct standard spelling for English parts.
3. Clean the speech: drop background noise, silence, coughs, breaths, music, and other people's voices. Remove filler sounds used only as hesitation (আ, আঁ, উম, হুম, ইয়ে, um, uh), stutters, false starts, and accidental repeated words.
4. Punctuation: add natural punctuation. End Bangla sentences with দাঁড়ি "।" and English sentences with ".". Use , ; : ? ! where fitting. English sentences start with a capital letter. No space before punctuation, one space after. Use a blank line only for a clear change of topic.
5. If the speaker dictates a punctuation command, write the symbol instead of the word: দাঁড়ি → ।, full stop / period → ., কমা / comma → ,, প্রশ্নচিহ্ন / question mark → ?, বিস্ময়চিহ্ন / exclamation mark → !, নতুন লাইন / new line → line break, নতুন অনুচ্ছেদ / new paragraph → blank line.
6. Numbers: ${digits}
7. English words: ${english}
8. Output ONLY the final text. No title, no label, no note, no markdown, no surrounding quotes. If there is no clear human speech, output exactly: NO_SPEECH`;
}

// Output language = Bangla. English (or mixed) speech is translated to Bangla.
function banglaPrompt(cfg) {
  const digits = cfg.bnDigits !== false
    ? 'Write numbers, dates, prices, times and phone numbers with Bangla digits (০১২৩৪৫৬৭৮৯), e.g. ১২৫ টাকা, ২০২৬ সাল, সকাল ১০টা। Small counting words in ordinary speech (এক, দুই, কয়েক) stay as words.'
    : 'Write numbers, dates, prices, times and phone numbers with ASCII digits (0-9). Small counting words in ordinary speech stay as words.';
  const english = cfg.keepEn
    ? 'If the speaker clearly says an English word, name, brand or technical term, write it in English letters (e.g. Facebook, Gmail, Zoom). All other words stay in Bangla script.'
    : 'Write English words the speaker uses in Bangla script (e.g. ফেসবুক, জিমেইল, মিটিং, ইন্টারনেট). Use Latin letters only for email addresses, URLs and code.';

  return `You are a professional Bangla (Bengali) speech-to-text engine used for typing.
Listen to the attached audio and write exactly what the main speaker said, in Bangla.

RULES
1. Language: output Bangla script (বাংলা) only. If the speaker uses any other language for whole sentences or phrases (for example English), translate those parts into natural Bangla so the entire output is Bangla. Never summarize, explain, or answer the speaker. If the speaker asks a question, just write that question.
2. Keep the speaker's own words and style (চলিত or সাধু). Do not rewrite or formalize. Use correct standard Bangla Academy spelling: correct যুক্তাক্ষর, হসন্ত, রেফ, ফলা, ও-কার/ো, ণ/ন, শ/ষ/স, ড়/ঢ়, চন্দ্রবিন্দু. Never output Hindi, Urdu, or Devanagari words or letters.
3. Clean the speech: drop background noise, silence, coughs, breaths, music, and other people's voices. Remove filler sounds used only as hesitation (আ, আঁ, উম, হুম, ইয়ে), stutters, false starts, and accidental repeated words.
4. Punctuation: add natural punctuation. End sentences with দাঁড়ি "।" (never "."). Use , ; : ? ! and "—" where fitting. Use “ ” for quoted speech. No space before punctuation, one space after. Use a blank line only for a clear change of topic.
5. If the speaker dictates a punctuation command, write the symbol instead of the word: দাঁড়ি → ।, কমা → ,, প্রশ্নচিহ্ন → ?, বিস্ময়চিহ্ন → !, নতুন লাইন → line break, নতুন অনুচ্ছেদ → blank line.
6. Numbers: ${digits}
7. English words: ${english} (This rule covers single English words, names and terms inside Bangla speech. Whole English sentences or phrases are translated into Bangla by rule 1.)
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
