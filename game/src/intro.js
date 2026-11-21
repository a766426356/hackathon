// intro.js — title screen and the 3D flip into the game.
//
// This layer is DOM and animation only; it never touches state / rules / battle.
// main.js awaits showTitleScreen() inside boot() and opens the welcome card only after.
// However the opener changes, game logic stays out of it.
//
// Timeline (one START click, ~1.05s):
//   0ms       the title card starts turning
//   0->14%    it leans back a couple of degrees first, to load the spring
//   14->50%   tilts up around X to 94 deg: you go from facing the card to looking down
//             at it, while twisting 26 deg clockwise around Z as if a hand tilted it away
//   50%       the card is edge-on. backface-visibility:hidden makes it vanish, the
//             backdrop finishes fading on this beat and the light gate peaks -- what
//             you flip into is the campus itself
//   50->100%  carries on to 180 deg, Z unwinds counter-clockwise back to 0: that's the reverse turn
//   after     the whole layer fades out and leaves the DOM
// prefers-reduced-motion skips the flip entirely and keeps a single 320ms fade.

import { toggleLang, langLabel, localize } from './i18n.js';

const FLIP_MS = 980;
const OUT_MS = 320;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function prefersReduced() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Returns a Promise; when it resolves the title screen is already gone from the DOM,
// so modals can safely stack on top.
export function showTitleScreen() {
  const root = document.createElement('div');
  root.id = 'title-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'HKU Zhangjiang Campus · Opening');
  root.innerHTML = `
    <div class="ts-photo"></div>
    <div class="ts-bg"></div>
    <div class="ts-grid"></div>
    <div class="ts-stage">
      <div class="ts-flipper">
        <div class="ts-front">
          <div class="ts-kicker">A Seven-Day Campus Story</div>
          <h1 class="ts-title">
            <span class="ts-en">THE HKU</span>
            <span class="ts-en2">ZHANGJIANG CAMP</span>
          </h1>
          <div class="ts-seal"><i></i><span>HKU Zhangjiang Campus · Seven Days</span><i></i></div>
          <button class="ts-start" type="button">START</button>
          <div class="ts-hint">ENTER / SPACE</div>
        </div>
      </div>
    </div>
    <div class="ts-gate"></div>
    <button class="ts-lang" type="button"></button>`;
  document.body.appendChild(root);

  const langBtn = root.querySelector('.ts-lang');
  langBtn.textContent = langLabel();
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLang();
  });
  localize(root);

  return new Promise((resolve) => {
    const btn = root.querySelector('.ts-start');
    const reduce = prefersReduced();
    let fired = false;

    function onKey(e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        fire();
      }
    }

    async function fire() {
      if (fired) return;
      fired = true;
      document.removeEventListener('keydown', onKey);
      if (document.activeElement === btn) btn.blur();

      root.classList.add('ts-go');
      // The card is already invisible past 90 deg, so only pull the whole layer down now —
      // otherwise you'd catch it halfway through the turn.
      if (!reduce) await wait(Math.round(FLIP_MS * 0.68));
      root.classList.add('ts-leaving');
      await wait(OUT_MS);

      root.remove();
      resolve('start');
    }

    btn.addEventListener('click', fire);
    document.addEventListener('keydown', onKey);
  });
}
