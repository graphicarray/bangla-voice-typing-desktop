'use strict';
const btn = document.getElementById('btn');
const tip = document.getElementById('tip');
let live = '';

function show(text, isLive) {
  tip.style.display = text ? 'block' : 'none';
  tip.textContent = text || '';
  tip.classList.toggle('live', !!isLive);
}

window.api.onUi(({ state, msg }) => {
  btn.className = state === 'idle' ? '' : state;
  if (state !== 'rec') live = '';
  if (state === 'rec') return show(live || 'Listening… release to type', !!live);
  show(state === 'busy' ? 'Typing…' : msg, false);
});

// Live preview text while recording (the final text is typed when you release the key).
window.api.onLive((text) => {
  if (!btn.classList.contains('rec')) return;
  live = text.length > 150 ? '…' + text.slice(-150) : text;
  show(live, true);
});

// The window is click-through except while the pointer is over the button.
btn.addEventListener('mouseenter', () => window.api.hover(true));
btn.addEventListener('mouseleave', () => window.api.hover(false));
btn.addEventListener('click', () => window.api.toggle());
