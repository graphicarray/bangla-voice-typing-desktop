'use strict';
const btn = document.getElementById('btn');
const tip = document.getElementById('tip');

window.api.onUi(({ state, msg }) => {
  btn.className = state === 'idle' ? '' : state;
  const text = state === 'rec' ? 'Listening… release to type' : state === 'busy' ? 'Typing…' : msg;
  tip.style.display = text ? 'block' : 'none';
  tip.textContent = text || '';
});

// The window is click-through except while the pointer is over the button.
btn.addEventListener('mouseenter', () => window.api.hover(true));
btn.addEventListener('mouseleave', () => window.api.hover(false));
btn.addEventListener('click', () => window.api.toggle());
