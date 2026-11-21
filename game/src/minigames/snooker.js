// minigames/snooker.js — the Snooker Table on 1F.
// Snooker, lightweight: 6 reds + 6 colours + the white, with real collision / friction / pocket checks,
// and a simple but complete ruleset (red–colour alternation, colour respotting, 4-point fouls, colours to close).
// The physics and rules are this repo's own work; the design took cues from the public
// ideas in the MIT-licensed https://github.com/henshmi/Classic-Pool-Game and https://github.com/XingS117/pro-pool.
// Zero dependencies, no runtime libraries pulled in.

import * as ui from '../ui.js';
import { unlockAudio, sfx } from '../audio.js';

const W = 960;
const H = 540;
const L = 64;   // cloth left
const R = 896;  // cloth right
const T = 62;   // cloth top
const B = 478;  // cloth bottom
const CY = (T + B) / 2;
const BR = 10;  // ball radius
const POCKET_R = 17;
const POCKET_VIS = 21;
const FRICTION = 235;
const CUSHION_E = 0.86;
const BALL_E = 0.96;
const MAX_SPEED = 1280;
const MIN_SPEED = 190;
const SKILL = { lin: 0.5, chen: 0.8, zhou: 0.66 };
const BAI = 236;
const D_R = 66;

const COLORS = [
  { id: 'yellow', name: 'yellow', value: 2, color: '#e9c84c', x: BAI, y: CY + 66 },
  { id: 'green', name: 'green', value: 3, color: '#3f9d5a', x: BAI, y: CY - 66 },
  { id: 'brown', name: 'brown', value: 4, color: '#8a5a2b', x: BAI, y: CY },
  { id: 'blue', name: 'blue', value: 5, color: '#3d6fd8', x: L + (R - L) * 0.5, y: CY },
  { id: 'pink', name: 'pink', value: 6, color: '#e88aa8', x: L + (R - L) * 0.715, y: CY },
  { id: 'black', name: 'black', value: 7, color: '#20222b', x: L + (R - L) * 0.905, y: CY },
];
const ORDER = COLORS.map((c) => c.id);
const RED_APEX = L + (R - L) * 0.75;

let active = null;

export function openSnooker(opts) {
  if (active) active();
  unlockAudio();

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const skill = SKILL[opts.npc.id] || 0.62;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let hudDirty = true;
  let lastClack = 0;

  const g = {
    phase: 'aim', // aim | place | shoot | ai | over
    turn: 0,
    scores: [0, 0],
    breakScore: 0,
    redsLeft: 6,
    expect: 'red',
    balls: [],
    cue: null,
    shot: null,
    settle: 0,
    aiTimer: 0,
    aim: -Math.PI * 0.08,
    power: 0.5,
    charging: false,
    chargeStart: 0,
    pointer: { x: 0, y: 0, has: false },
    placeGhost: { x: BAI - 20, y: CY + 20, valid: true },
    message: 'You break. Hold the mouse to charge, release to shoot.',
    messageKind: '',
    settled: false,
    rewardMsg: '',
    overlayShown: false,
    shake: 0,
    particles: [],
  };

  const html = `
    <div class="mg snooker-game">
      <div class="mg-head">
        <div class="mg-title">
          <span class="mg-icon">🎱</span>
          <div>
            <h2>Snooker</h2>
            <p class="sub">6 reds, 6 colours · one frame vs ${esc(opts.npc.name)}</p>
          </div>
        </div>
        <div class="sn-scoreline">
          <span class="sn-score you"><b id="sn-p">0</b><em>You</em></span>
          <span class="sn-turn" id="sn-turn">You</span>
          <span class="sn-score foe"><b id="sn-a">0</b><em>${esc(opts.npc.name)}</em></span>
        </div>
      </div>
      <div class="sn-subline">
        <span>Target: <b id="sn-target">red</b></span>
        <span>Reds <b id="sn-reds">6</b></span>
        <span>Break <b id="sn-break">0</b></span>
        <span id="sn-status" class="mg-status">You break.</span>
      </div>
      <div class="sn-stage">
        <canvas id="sn-canvas"></canvas>
        <div class="mg-overlay hidden" id="sn-overlay">
          <div class="po-card">
            <div class="po-tag" id="sn-tag">Frame over</div>
            <h3 id="sn-title">—</h3>
            <p id="sn-msg"></p>
            <div class="mg-row">
              <button class="btn primary" data-act="again">Another frame</button>
              <button class="btn" data-act="close">Cues down</button>
            </div>
          </div>
        </div>
      </div>
      <div class="mg-hint">
        <span>Move to aim · hold left button to charge, release to shoot · <kbd>←</kbd> <kbd>→</kbd> fine-tune · <kbd>Space</kbd> charge</span>
        <span>After a foul the white goes back to the D; click the D to place it</span>
      </div>
      <div class="mg-row">
        <button class="btn" data-act="restart">Re-rack</button>
        <button class="btn" data-act="close">Cues down (no result)</button>
      </div>
    </div>`;
  ui.openModal(html, { cls: 'mg-panel snooker-panel' });

  const root = ui.els.modal;
  const canvas = root.querySelector('#sn-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = root.querySelector('#sn-overlay');
  const $ = (id) => root.querySelector(id);
  const pEl = $('#sn-p');
  const aEl = $('#sn-a');
  const turnEl = $('#sn-turn');
  const targetEl = $('#sn-target');
  const redsEl = $('#sn-reds');
  const breakEl = $('#sn-break');
  const statusEl = $('#sn-status');
  const titleEl = $('#sn-title');
  const msgEl = $('#sn-msg');
  const tagEl = $('#sn-tag');

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.aspectRatio = W + ' / ' + H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function esc(x) { return String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);


function roundRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

  // ---------------------------------------------------------------- Rack
  function freshBalls() {
    const balls = [];
    const cue = { id: 'cue', color: 'cue', value: 0, x: BAI - 24, y: CY + 22, vx: 0, vy: 0, potted: false, isCue: true };
    balls.push(cue);
    for (const c of COLORS) {
      balls.push({ id: c.id, color: c.id, name: c.name, value: c.value, x: c.x, y: c.y, vx: 0, vy: 0, potted: false, spot: { x: c.x, y: c.y } });
    }
    let i = 0;
    const rows = [1, 2, 3];
    const dx = (BR * 2 + 0.6) * Math.cos(Math.PI / 6);
    for (let row = 0; row < rows.length; row++) {
      const n = rows[row];
      for (let k = 0; k < n; k++) {
        const x = RED_APEX + row * dx;
        const y = CY + (k - (n - 1) / 2) * (BR * 2 + 0.6);
        balls.push({ id: 'red' + (i++), color: 'red', value: 1, x, y, vx: 0, vy: 0, potted: false });
      }
    }
    return { balls, cue };
  }

  function reset() {
    const fresh = freshBalls();
    g.balls = fresh.balls;
    g.cue = fresh.cue;
    g.phase = 'aim';
    g.turn = 0;
    g.scores = [0, 0];
    g.breakScore = 0;
    g.redsLeft = 6;
    g.expect = 'red';
    g.shot = null;
    g.settle = 0;
    g.aiTimer = 0;
    g.aim = -Math.PI * 0.08;
    g.power = 0.5;
    g.charging = false;
    g.ballInHand = false;
    g.overlayShown = false;
    g.particles = [];
    g.shake = 0;
    g.message = 'You break. Hold the mouse to charge, release to shoot.';
    g.messageKind = '';
    overlay.classList.add('hidden');
    hudDirty = true;
    syncHud();
  }

  // ---------------------------------------------------------------- Rule helpers
  const colorBall = (id) => g.balls.find((b) => b.id === id);
  const activeBalls = () => g.balls.filter((b) => !b.potted);
  const redsActive = () => g.balls.filter((b) => b.color === 'red' && !b.potted);

  function lowestColor() {
    for (const id of ORDER) {
      const b = colorBall(id);
      if (b && !b.potted) return id;
    }
    return null;
  }

  function expectLabel() {
    if (g.expect === 'red') return 'red';
    if (g.expect === 'color') return 'any colour';
    const c = COLORS.find((x) => x.id === g.expect);
    return c ? c.name + ' ball' : 'over';
  }

  function syncHud() {
    pEl.textContent = String(g.scores[0]);
    aEl.textContent = String(g.scores[1]);
    turnEl.textContent = g.turn === 0 ? 'You' : opts.npc.name;
    turnEl.className = 'sn-turn ' + (g.turn === 0 ? 'you' : 'foe');
    targetEl.textContent = expectLabel();
    redsEl.textContent = String(g.redsLeft);
    breakEl.textContent = String(g.breakScore);
    hudDirty = false;
  }

  function setMessage(text, kind) {
    g.message = text;
    g.messageKind = kind || '';
    statusEl.textContent = text;
    statusEl.className = 'mg-status' + (kind ? ' ' + kind : '');
  }

  // put a colour back on its spot; if the spot is taken, spiral out to the nearest free space
  function respot(ball) {
    const spot = ball.spot || { x: R - 70, y: CY };
    for (let ring = 0; ring < 18; ring++) {
      const rad = ring * (BR * 2 + 1.2);
      const steps = ring === 0 ? 1 : Math.max(8, ring * 8);
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = spot.x + Math.cos(a) * rad;
        const y = spot.y + Math.sin(a) * rad;
        if (x < L + BR + 2 || x > R - BR - 2 || y < T + BR + 2 || y > B - BR - 2) continue;
        let free = true;
        for (const b of g.balls) {
          if (b === ball || b.potted) continue;
          if (Math.hypot(b.x - x, b.y - y) < BR * 2 + 0.8) { free = false; break; }
        }
        if (free) {
          ball.x = x;
          ball.y = y;
          ball.vx = 0;
          ball.vy = 0;
          ball.potted = false;
          return;
        }
      }
    }
    ball.x = spot.x;
    ball.y = spot.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.potted = false;
  }

  // ---------------------------------------------------------------- Table physics
  function pocketCheck() {
    const pockets = [
      { x: L, y: T }, { x: R, y: T }, { x: L, y: B }, { x: R, y: B },
      { x: L, y: CY }, { x: R, y: CY },
    ];
    for (const b of g.balls) {
      if (b.potted) continue;
      for (const p of pockets) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_R) {
          b.potted = true;
          b.vx = 0;
          b.vy = 0;
          if (b.isCue) {
            if (g.shot) g.shot.cuePotted = true;
            sfx('foul');
            burst(p.x, p.y, '#f0a0a0', 10);
          } else {
            if (g.shot) g.shot.potted.push(b);
            sfx('pot');
            burst(p.x, p.y, b.color === 'red' ? '#d46a5a' : '#ffe38a', 12);
          }
          break;
        }
      }
    }
  }

  function cushionCheck() {
    for (const b of g.balls) {
      if (b.potted) continue;
      let hit = false;
      if (b.x - BR < L) { b.x = L + BR; if (b.vx < 0) { b.vx = -b.vx * CUSHION_E; hit = true; } }
      if (b.x + BR > R) { b.x = R - BR; if (b.vx > 0) { b.vx = -b.vx * CUSHION_E; hit = true; } }
      if (b.y - BR < T) { b.y = T + BR; if (b.vy < 0) { b.vy = -b.vy * CUSHION_E; hit = true; } }
      if (b.y + BR > B) { b.y = B - BR; if (b.vy > 0) { b.vy = -b.vy * CUSHION_E; hit = true; } }
      if (hit) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 120) sfx('cushion');
      }
    }
  }

  function ballCollisions() {
    const list = g.balls.filter((b) => !b.potted);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= BR * 2 || d < 0.0001) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = BR * 2 - d;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const imp = -(1 + BALL_E) * vn / 2;
          a.vx -= nx * imp;
          a.vy -= ny * imp;
          b.vx += nx * imp;
          b.vy += ny * imp;
          // a little tangential friction so thin cuts do not bounce like a mirror
          const tx = -ny;
          const ty = nx;
          const vt = rvx * tx + rvy * ty;
          a.vx += tx * vt * 0.015;
          a.vy += ty * vt * 0.015;
          b.vx -= tx * vt * 0.015;
          b.vy -= ty * vt * 0.015;

          if (g.shot && !g.shot.firstContact) {
            if (a.isCue) g.shot.firstContact = b;
            else if (b.isCue) g.shot.firstContact = a;
          }
          const now = performance.now();
          const sp = Math.hypot(rvx, rvy);
          if (now - lastClack > 45 && sp > 40) {
            lastClack = now;
            sfx('clack');
          }
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (sp > 240) burst(mid.x, mid.y, '#fff3cf', 3);
        }
      }
    }
  }

  function physicsStep(h) {
    for (const b of g.balls) {
      if (b.potted) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const ns = Math.max(0, sp - FRICTION * h);
        const k = ns / sp;
        b.vx *= k;
        b.vy *= k;
        if (ns < 2.5) { b.vx = 0; b.vy = 0; }
      }
      if (b.x < L - 20 || b.x > R + 20 || b.y < T - 20 || b.y > B + 20) {
        // should never happen; fallback puts the ball back on the cloth
        b.x = clamp(b.x, L + BR, R - BR);
        b.y = clamp(b.y, T + BR, B - BR);
      }
    }
    pocketCheck();
    cushionCheck();
    ballCollisions();
  }

  function allStopped() {
    for (const b of g.balls) {
      if (b.potted) continue;
      if (Math.hypot(b.vx, b.vy) > 2.5) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- Shooting
  function chargePower() {
    return clamp((performance.now() - g.chargeStart) / 900, 0.08, 1);
  }

  function shoot(power) {
    if (g.phase !== 'aim' || g.turn !== 0) return;
    const cue = g.cue;
    if (cue.potted) return;
    const p = clamp(power, 0.06, 1);
    const speed = MIN_SPEED + p * (MAX_SPEED - MIN_SPEED);
    cue.vx = Math.cos(g.aim) * speed;
    cue.vy = Math.sin(g.aim) * speed;
    g.shot = { firstContact: null, potted: [], cuePotted: false };
    g.phase = 'shoot';
    g.settle = 0;
    g.charging = false;
    lastClack = 0;
    sfx('cue');
    burst(cue.x, cue.y, '#cfd8e6', 6);
    hudDirty = true;
    syncHud();
  }

  function aiShoot() {
    if (g.phase !== 'ai') return;
    const cue = g.cue;
    const legal = legalBalls();
    if (!legal.length) { finishGame(); return; }
    const pockets = [
      { x: L, y: T }, { x: R, y: T }, { x: L, y: B }, { x: R, y: B },
      { x: L, y: CY }, { x: R, y: CY },
    ];

    let best = null;
    for (const target of legal) {
      for (const pocket of pockets) {
        const pdx = pocket.x - target.x;
        const pdy = pocket.y - target.y;
        const pd = Math.hypot(pdx, pdy) || 1;
        const ux = pdx / pd;
        const uy = pdy / pd;
        const ghost = { x: target.x - ux * BR * 2, y: target.y - uy * BR * 2 };
        if (ghost.x < L + BR || ghost.x > R - BR || ghost.y < T + BR || ghost.y > B - BR) continue;
        if (!clearPath(cue, ghost, target)) continue;
        if (!clearPath(target, { x: pocket.x, y: pocket.y }, target)) continue;
        const dCue = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
        const score = dCue + pd * 1.15;
        if (!best || score < best.score) {
          best = { score, target, ghost, power: clamp(0.28 + (dCue + pd) / 1500, 0.3, 0.95), cut: Math.abs(ux * (ghost.y - cue.y) - uy * (ghost.x - cue.x)) };
        }
      }
    }

    let aim;
    let power;
    if (best) {
      aim = Math.atan2(best.ghost.y - cue.y, best.ghost.x - cue.x);
      power = best.power;
    } else {
      // no potting line: hit the nearest legal ball, as thin as possible
      let near = legal[0];
      let nd = Infinity;
      for (const b of legal) {
        const d = Math.hypot(b.x - cue.x, b.y - cue.y);
        if (d < nd) { nd = d; near = b; }
      }
      aim = Math.atan2(near.y - cue.y, near.x - cue.x);
      power = clamp(0.25 + nd / 900, 0.28, 0.8);
    }
    const err = (Math.random() - 0.5) * ((1 - skill) * 0.11 + 0.012);
    aim += err;

    const speed = MIN_SPEED + power * (MAX_SPEED - MIN_SPEED);
    cue.vx = Math.cos(aim) * speed;
    cue.vy = Math.sin(aim) * speed;
    g.aim = aim;
    g.shot = { firstContact: null, potted: [], cuePotted: false };
    g.phase = 'shoot';
    g.settle = 0;
    lastClack = 0;
    sfx('cue');
    setMessage(opts.npc.name + ' shoots.');
  }

  function legalBalls() {
    if (g.expect === 'red') return redsActive();
    if (g.expect === 'color') return g.balls.filter((b) => !b.potted && !b.isCue && b.color !== 'red');
    const b = colorBall(g.expect);
    return b && !b.potted ? [b] : [];
  }

  function isLegalFirst(b) {
    if (!b) return false;
    if (g.expect === 'red') return b.color === 'red';
    if (g.expect === 'color') return b.color !== 'red' && !b.isCue;
    return b.id === g.expect;
  }

  // is anything in the way on the a→b line (the target itself does not count)
  function clearPath(a, b, ignore) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    for (const ball of g.balls) {
      if (ball.potted || ball === ignore || ball.isCue) continue;
      if (ball === g.cue) continue;
      const rx = ball.x - a.x;
      const ry = ball.y - a.y;
      const proj = rx * ux + ry * uy;
      if (proj < BR || proj > len - BR) continue;
      const perp = Math.abs(rx * uy - ry * ux);
      if (perp < BR * 1.8) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- Settle one shot
  function setExpectBase() {
    if (g.redsLeft > 0) g.expect = 'red';
    else {
      const low = lowestColor();
      g.expect = low || null;
    }
  }

  function switchTurn() {
    g.turn = 1 - g.turn;
    g.breakScore = 0;
    if (g.cue.potted) placeCue();
    else if (g.phase !== 'over') g.phase = g.turn === 0 ? 'aim' : 'ai';
    g.aiTimer = 0.75;
    hudDirty = true;
    syncHud();
  }

  function placeCue() {
    const cue = g.cue;
    cue.potted = false;
    cue.vx = 0;
    cue.vy = 0;
    if (g.turn === 1) {
      cue.x = BAI - 22;
      cue.y = CY + 22;
      g.ballInHand = false;
      g.phase = 'ai';
      g.aiTimer = 0.7;
    } else {
      cue.x = BAI - 22;
      cue.y = CY + 22;
      g.ballInHand = true;
      g.phase = 'place';
      setMessage('White potted. Click the D to place it back.', 'muted');
    }
  }

  function evaluateShot() {
    g.phase = 'resolve';
    const shot = g.shot || { firstContact: null, potted: [], cuePotted: false };
    const potted = shot.potted.slice();
    const redsPotted = potted.filter((b) => b.color === 'red');
    const colorsPotted = potted.filter((b) => b.color !== 'red');
    const cuePotted = shot.cuePotted;

    // potted reds stay down, fouls included
    g.redsLeft = Math.max(0, g.redsLeft - redsPotted.length);

    let foul = false;
    let reason = '';

    if (cuePotted) { foul = true; reason = 'white potted'; }
    else if (!shot.firstContact) { foul = true; reason = 'air shot, nothing hit'; }
    else if (!isLegalFirst(shot.firstContact)) { foul = true; reason = 'wrong ball first'; }

    let points = 0;
    let pottedLegal = false;

    if (foul) {
      // on a foul colours respot, reds stay down
      for (const c of colorsPotted) respot(c);
      g.scores[1 - g.turn] += 4;
      sfx('foul');
      setMessage('Foul: ' + reason + '. ' + opts.npc.name + ' +4.', 'warn');
      g.breakScore = 0;
      setExpectBase();
      switchTurn();
      g.shot = null;
      hudDirty = true;
      syncHud();
      return;
    }

    if (g.expect === 'red') {
      if (colorsPotted.length) {
        for (const c of colorsPotted) respot(c);
        g.scores[1 - g.turn] += 4;
        sfx('foul');
        setMessage('Foul: a colour went down on a red. ' + opts.npc.name + ' +4.', 'warn');
        g.breakScore = 0;
        setExpectBase();
        switchTurn();
        g.shot = null;
        hudDirty = true;
        syncHud();
        return;
      }
      points = redsPotted.length;
      if (points > 0) {
        g.scores[g.turn] += points;
        g.breakScore += points;
        g.expect = 'color';
        pottedLegal = true;
        setMessage('Potted ' + points + ' reds, + ' + points + '. Now a colour.', 'ok');
        sfx('pot');
      }
    } else if (g.expect === 'color') {
      if (redsPotted.length || colorsPotted.length > 1) {
        for (const c of colorsPotted) respot(c);
        g.scores[1 - g.turn] += 4;
        sfx('foul');
        setMessage('Foul: only one colour per shot. ' + opts.npc.name + ' +4.', 'warn');
        g.breakScore = 0;
        setExpectBase();
        switchTurn();
        g.shot = null;
        hudDirty = true;
        syncHud();
        return;
      }
      if (colorsPotted.length === 1) {
        const c = colorsPotted[0];
        points = c.value;
        g.scores[g.turn] += points;
        g.breakScore += points;
        respot(c);
        g.expect = g.redsLeft > 0 ? 'red' : lowestColor();
        pottedLegal = true;
        if (!g.expect) {
          g.shot = null;
          hudDirty = true;
          syncHud();
          finishGame();
          return;
        }
        setMessage(c.name + ' potted, + ' + points + '. Next up: ' + expectLabel() + '.', 'ok');
        sfx('pot');
      }
    } else {
      // colours phase: only the lowest colour is on
      const wrongColor = colorsPotted.find((c) => c.id !== g.expect);
      if (redsPotted.length || wrongColor) {
        for (const c of colorsPotted) respot(c);
        g.scores[1 - g.turn] += 4;
        sfx('foul');
        setMessage('Foul: ' + expectLabel() + ' was on. ' + opts.npc.name + ' +4.', 'warn');
        g.breakScore = 0;
        setExpectBase();
        switchTurn();
        g.shot = null;
        hudDirty = true;
        syncHud();
        return;
      }
      const target = colorBall(g.expect);
      if (target && colorsPotted.includes(target)) {
        points = target.value;
        g.scores[g.turn] += points;
        g.breakScore += points;
        pottedLegal = true;
        target.potted = true; // in the colours phase it stays down
        setExpectBase();
        if (!g.expect) {
          g.shot = null;
          hudDirty = true;
          syncHud();
          finishGame();
          return;
        }
        setMessage(target.name + ' potted, + ' + points + '. Next up: ' + expectLabel() + '.', 'ok');
        sfx('pot');
      }
    }

    g.shot = null;
    hudDirty = true;
    syncHud();

    if (pottedLegal) {
      if (g.turn === 0) g.phase = 'aim';
      else { g.phase = 'ai'; g.aiTimer = 0.75; }
      return;
    }

    // nothing potted, no foul → turn passes
    setExpectBase();
    if (g.redsLeft === 0 && !g.expect) { finishGame(); return; }
    if (g.turn === 0) setMessage('Missed. Over to ' + opts.npc.name + '.', 'muted');
    else setMessage(opts.npc.name + ' missed. Your turn.', 'ok');
    switchTurn();
  }

  // ---------------------------------------------------------------- Wrap up
  function finishGame() {
    if (g.phase === 'over') return;
    g.phase = 'over';
    const [p, a] = g.scores;
    const outcome = p > a ? 'win' : p < a ? 'lose' : 'draw';
    if (!g.settled) {
      g.settled = true;
      const res = opts.onFinish ? opts.onFinish(outcome, { p, a }) : null;
      g.rewardMsg = res && res.msg ? res.msg : '';
    } else {
      g.rewardMsg = 'Today is already settled; this frame is just for fun.';
    }
    sfx(outcome === 'win' ? 'win' : 'lose');
    tagEl.textContent = outcome === 'win' ? 'Frame won' : outcome === 'draw' ? 'Frame drawn' : 'Frame lost';
    titleEl.textContent = p + ' : ' + a;
    msgEl.textContent = (g.rewardMsg || (outcome === 'win' ? 'Decent frame.' : outcome === 'draw' ? 'Dead even.' : 'Another frame.')) +
      ' · Play on if you like, but the tally for today is already noted.';
    g.overlayShown = true;
    overlay.classList.remove('hidden');
    setMessage(outcome === 'win' ? 'You took the frame.' : outcome === 'draw' ? 'Drawn.' : 'Frame lost.', outcome === 'win' ? 'ok' : 'muted');
  }

  // ---------------------------------------------------------------- Aim line
  function boundaryT(cue, dir) {
    let t = Infinity;
    if (dir.x > 0.0001) t = Math.min(t, (R - BR - cue.x) / dir.x);
    if (dir.x < -0.0001) t = Math.min(t, (L + BR - cue.x) / dir.x);
    if (dir.y > 0.0001) t = Math.min(t, (B - BR - cue.y) / dir.y);
    if (dir.y < -0.0001) t = Math.min(t, (T + BR - cue.y) / dir.y);
    return Math.max(0, t);
  }

  function aimInfo() {
    const cue = g.cue;
    const dir = { x: Math.cos(g.aim), y: Math.sin(g.aim) };
    let bestT = boundaryT(cue, dir);
    let hit = null;
    for (const b of g.balls) {
      if (b.potted || b.isCue) continue;
      const rx = b.x - cue.x;
      const ry = b.y - cue.y;
      const proj = rx * dir.x + ry * dir.y;
      if (proj <= 0) continue;
      const perp2 = rx * rx + ry * ry - proj * proj;
      const rr = (BR * 2) * (BR * 2);
      if (perp2 > rr) continue;
      const t = proj - Math.sqrt(rr - perp2);
      if (t > 0 && t < bestT) { bestT = t; hit = b; }
    }
    return {
      dir,
      t: bestT,
      hit,
      end: { x: cue.x + dir.x * bestT, y: cue.y + dir.y * bestT },
      targetDir: hit ? normalize(hit.x - (cue.x + dir.x * bestT), hit.y - (cue.y + dir.y * bestT)) : null,
    };
  }

  function normalize(x, y) {
    const d = Math.hypot(x, y) || 1;
    return { x: x / d, y: y / d };
  }

  // ---------------------------------------------------------------- Particles
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 170;
      g.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.5, max: 0.9, color, r: 1 + Math.random() * 2 });
    }
  }

  // ---------------------------------------------------------------- Render
  function drawTable() {
    // room
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#11151c');
    bg.addColorStop(1, '#080b10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // wooden frame around the table
    const wood = ctx.createLinearGradient(0, 20, 0, H - 20);
    wood.addColorStop(0, '#6b4527');
    wood.addColorStop(0.5, '#4b2d17');
    wood.addColorStop(1, '#2f1b0e');
    ctx.fillStyle = wood;
    roundRectPath(ctx, 24, 22, W - 48, H - 44, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(224, 182, 74, .3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // cloth
    const cloth = ctx.createRadialGradient(W / 2, CY, 80, W / 2, CY, W * 0.6);
    cloth.addColorStop(0, '#26694f');
    cloth.addColorStop(0.65, '#1b563f');
    cloth.addColorStop(1, '#103a2c');
    ctx.fillStyle = cloth;
    ctx.fillRect(L, T, R - L, B - T);

    // cloth texture: fine diagonal weave
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#d6ffe9';
    ctx.lineWidth = 1;
    for (let x = L - B; x < R; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, T);
      ctx.lineTo(x + (B - T), B);
      ctx.stroke();
    }
    ctx.restore();

    // cushions
    ctx.strokeStyle = '#0c2a20';
    ctx.lineWidth = 7;
    ctx.strokeRect(L, T, R - L, B - T);
    ctx.strokeStyle = 'rgba(196, 255, 224, .13)';
    ctx.lineWidth = 1;
    ctx.strokeRect(L + 5, T + 5, R - L - 10, B - T - 10);

    // baulk line, the D, the spots
    ctx.strokeStyle = 'rgba(226, 245, 232, .38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BAI, T);
    ctx.lineTo(BAI, B);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(BAI, CY, D_R, Math.PI / 2, Math.PI * 1.5, false);
    ctx.stroke();
    for (const c of COLORS) {
      ctx.fillStyle = 'rgba(230, 255, 240, .34)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // pockets
    const pockets = [
      { x: L, y: T }, { x: R, y: T }, { x: L, y: B }, { x: R, y: B }, { x: L, y: CY }, { x: R, y: CY },
    ];
    for (const p of pockets) {
      ctx.fillStyle = '#07090c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_VIS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224, 182, 74, .4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_VIS - 1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBall(b) {
    const x = b.x;
    const y = b.y;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, BR * 0.95, BR * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.fill();

    let base = b.color;
    if (b.color === 'cue') base = '#f4f1e8';
    else if (b.color === 'red') base = '#b73b32';
    else {
      const c = COLORS.find((x2) => x2.id === b.color);
      base = c ? c.color : '#ccc';
    }
    const grad = ctx.createRadialGradient(x - BR * 0.35, y - BR * 0.4, 1, x, y, BR);
    grad.addColorStop(0, lighten(base, 0.55));
    grad.addColorStop(0.45, base);
    grad.addColorStop(1, darken(base, 0.42));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath();
    ctx.arc(x - BR * 0.35, y - BR * 0.42, BR * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function lighten(hex, amt) {
    const c = parseHex(hex);
    return 'rgb(' + Math.round(c[0] + (255 - c[0]) * amt) + ',' + Math.round(c[1] + (255 - c[1]) * amt) + ',' + Math.round(c[2] + (255 - c[2]) * amt) + ')';
  }
  function darken(hex, amt) {
    const c = parseHex(hex);
    return 'rgb(' + Math.round(c[0] * (1 - amt)) + ',' + Math.round(c[1] * (1 - amt)) + ',' + Math.round(c[2] * (1 - amt)) + ')';
  }
  function parseHex(hex) {
    if (hex[0] !== '#') return [200, 200, 200];
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function drawAim() {
    if (g.phase !== 'aim' && g.phase !== 'place') return;
    if (g.turn !== 0 && g.phase !== 'place') return;
    if (g.phase === 'place') {
      // placing in the D
      ctx.save();
      ctx.fillStyle = 'rgba(224, 182, 74, .1)';
      ctx.beginPath();
      ctx.arc(BAI, CY, D_R, Math.PI / 2, Math.PI * 1.5, false);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224, 182, 74, .7)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(BAI, CY, D_R, Math.PI / 2, Math.PI * 1.5, false);
      ctx.stroke();
      ctx.setLineDash([]);
      const gh = g.placeGhost;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = gh.valid ? '#f4f1e8' : '#f08a8a';
      ctx.beginPath();
      ctx.arc(gh.x, gh.y, BR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(240, 226, 187, .9)';
      ctx.font = '600 15px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click the D to place the white', BAI, CY + D_R + 32);
      return;
    }

    const info = aimInfo();
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255, 247, 214, .55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.cue.x, g.cue.y);
    ctx.lineTo(info.end.x, info.end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (info.hit) {
      ctx.strokeStyle = 'rgba(255, 247, 214, .5)';
      ctx.beginPath();
      ctx.arc(info.end.x, info.end.y, BR, 0, Math.PI * 2);
      ctx.stroke();
      if (info.targetDir) {
        ctx.strokeStyle = 'rgba(255, 227, 138, .6)';
        ctx.beginPath();
        ctx.moveTo(info.hit.x, info.hit.y);
        ctx.lineTo(info.hit.x + info.targetDir.x * 95, info.hit.y + info.targetDir.y * 95);
        ctx.stroke();
      }
    }

    // cue
    const back = BR + 12 + g.power * 62;
    const dir = info.dir;
    const sx = g.cue.x - dir.x * back;
    const sy = g.cue.y - dir.y * back;
    const ex = sx - dir.x * 210;
    const ey = sy - dir.y * 210;
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, '#f0e2bb');
    grad.addColorStop(0.08, '#d8b26a');
    grad.addColorStop(0.5, '#8a5a2b');
    grad.addColorStop(1, '#3b2513');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = '#e8f6ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dir.x * 5, sy + dir.y * 5);
    ctx.stroke();
    ctx.restore();

    // power bar
    const px = 42;
    const py = H - 36;
    ctx.fillStyle = 'rgba(10, 16, 14, .6)';
    roundRectPath(ctx, px, py - 7, 190, 14, 7);
    ctx.fill();
    const pw = 186 * g.power;
    const pg = ctx.createLinearGradient(px, 0, px + 190, 0);
    pg.addColorStop(0, '#6fbf7a');
    pg.addColorStop(0.65, '#e9c84c');
    pg.addColorStop(1, '#e07a5a');
    ctx.fillStyle = pg;
    roundRectPath(ctx, px + 2, py - 5, Math.max(2, pw), 10, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(240, 245, 238, .8)';
    ctx.font = '11px "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Power', px, py - 14);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (g.shake > 0.1) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    drawTable();

    for (const b of g.balls) {
      if (!b.potted && !(b.isCue && g.phase === 'place')) drawBall(b);
    }
    drawAim();

    for (const p of g.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // top hint: whose turn / thinking
    ctx.fillStyle = 'rgba(240, 245, 238, .75)';
    ctx.font = '600 13px "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (g.phase === 'ai') {
      ctx.fillStyle = 'rgba(255, 227, 138, .9)';
      ctx.fillText(opts.npc.name + ' is aiming…', W / 2, T - 20);
    } else if (g.phase === 'aim' || g.phase === 'place') {
      ctx.fillStyle = 'rgba(255, 227, 138, .9)';
      ctx.fillText('Your turn · ' + (g.phase === 'place' ? 'place the white' : 'target: ' + expectLabel()), W / 2, T - 20);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- Input
  function toWorld(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / r.width * W,
      y: (ev.clientY - r.top) / r.height * H,
    };
  }

  function validPlace(x, y) {
    const d = Math.hypot(x - BAI, y - CY);
    if (d > D_R - BR - 2) return false;
    if (x > BAI) return false;
    for (const b of g.balls) {
      if (b.potted || b.isCue) continue;
      if (Math.hypot(b.x - x, b.y - y) < BR * 2 + 0.8) return false;
    }
    return true;
  }

  function setPlaceGhost(p) {
    const x = clamp(p.x, L + BR, R - BR);
    const y = clamp(p.y, T + BR, B - BR);
    g.placeGhost = { x, y, valid: validPlace(x, y) };
  }

  function onPointerMove(ev) {
    const p = toWorld(ev);
    g.pointer = { x: p.x, y: p.y, has: true };
    if (g.phase === 'place') { setPlaceGhost(p); return; }
    if (g.phase === 'aim' && g.turn === 0) {
      g.aim = Math.atan2(p.y - g.cue.y, p.x - g.cue.x);
    }
  }

  function onPointerDown(ev) {
    ev.preventDefault();
    const p = toWorld(ev);
    g.pointer = { x: p.x, y: p.y, has: true };
    if (g.phase === 'place') {
      setPlaceGhost(p);
      if (g.placeGhost.valid) {
        g.cue.x = g.placeGhost.x;
        g.cue.y = g.placeGhost.y;
        g.cue.vx = 0;
        g.cue.vy = 0;
        g.cue.potted = false;
        g.ballInHand = false;
        g.phase = 'aim';
        g.aim = Math.atan2(CY - g.cue.y, R - g.cue.x);
        setMessage('White placed. Take the shot.', 'ok');
      }
      return;
    }
    if (g.phase !== 'aim' || g.turn !== 0) return;
    g.aim = Math.atan2(p.y - g.cue.y, p.x - g.cue.x);
    g.charging = true;
    g.chargeStart = performance.now();
    g.power = 0.08;
  }

  function onPointerUp() {
    if (!g.charging) return;
    g.charging = false;
    shoot(g.power);
  }

  function onKeyDown(ev) {
    const k = ev.key;
    if (k === 'Escape') { ev.preventDefault(); close(); return; }
    if (g.phase === 'aim' && g.turn === 0) {
      if (k === 'ArrowLeft') { ev.preventDefault(); g.aim -= 0.025; return; }
      if (k === 'ArrowRight') { ev.preventDefault(); g.aim += 0.025; return; }
      if (k === ' ' && !ev.repeat) {
        ev.preventDefault();
        if (!g.charging) { g.charging = true; g.chargeStart = performance.now(); }
        return;
      }
    }
  }

  function onKeyUp(ev) {
    if (ev.key === ' ') {
      if (g.charging) {
        ev.preventDefault();
        g.charging = false;
        shoot(g.power);
      }
    }
  }

  function restart() {
    reset();
    setMessage('Re-racked. You break.');
    last = performance.now();
  }

  function close() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ui.closeModal();
    if (opts.onExit) opts.onExit();
  }

  // ---------------------------------------------------------------- Main loop
  function update(dt) {
    if (g.charging) {
      g.power = chargePower();
    }
    if (g.phase === 'shoot') {
      acc += Math.min(dt, 0.04);
      const fixed = 1 / 300;
      let guard = 0;
      while (acc >= fixed && guard++ < 30) {
        physicsStep(fixed);
        acc -= fixed;
      }
      if (allStopped()) {
        g.settle += dt;
        if (g.settle > 0.35) {
          acc = 0;
          evaluateShot();
        }
      } else {
        g.settle = 0;
      }
    } else {
      acc = 0;
    }

    if (g.phase === 'ai') {
      g.aiTimer -= dt;
      if (g.aiTimer <= 0) aiShoot();
    }

    for (const p of g.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt;
      p.vx *= 1 - 3 * dt;
      p.life -= dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);
    g.shake *= 1 - Math.min(1, dt * 8);
    if (hudDirty) syncHud();
  }

  function frame(ts) {
    if (destroyed) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  ui.bindModal({ close, restart, again: restart });

  active = () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
  };
  ui.setModalCleanup(active);

  reset();
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
