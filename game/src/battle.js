// battle.js — night fight: draw / play / enemy turn. Pure logic; rendering lives in ui.js.

import { CONFIG, ENEMIES } from '../data.js';
import { clampMood, maxFriend, nextRandom, playerMaxHp } from './state.js';
import { lootMult } from './loot.js';

function shuffle(state, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(s) {
  const cards = s.deck.map((c) => ({ name: c.name, kind: 'attack', power: c.power }));
  if (s.supportUnlocked) cards.push({ name: 'Friend Support', kind: 'support', power: 0 });
  while (cards.length < 4) cards.push({ name: 'Improvise', kind: 'attack', power: CONFIG.battle.fillerPower });
  return cards;
}

function drawHand(state, b) {
  b.hand = [];
  for (let i = 0; i < CONFIG.battle.handSize; i++) {
    if (!b.drawPile.length) {
      b.drawPile = shuffle(state, b.discard);
      b.discard = [];
    }
    if (!b.drawPile.length) break;
    b.hand.push(b.drawPile.pop());
  }
}

// Who you fight tonight: no longer random, fixed by night order and stronger every night.
// So tonight's enemy is known in advance, and daytime prep can be aimed at it.
export function enemyFor(s) {
  const lv = Math.max(1, Math.min(s.maxDay - 1, s.day));
  const base = ENEMIES[(lv - 1) % ENEMIES.length];
  const maxHp = CONFIG.battle.enemyHp + CONFIG.battle.enemyHpPerNight * (lv - 1);
  const atk = base.atk + CONFIG.battle.enemyAtkPerNight * (lv - 1);
  return {
    lv,
    name: base.name,
    desc: base.desc,
    moodCost: base.moodCost,
    atk,
    maxHp,
    isBoss: false, // the ddl fight sets this true, doubling only from round 3
  };
}

export function startBattle(s) {
  const e = enemyFor(s);
  const hp = playerMaxHp(s);
  const b = {
    enemy: { ...e, hp: e.maxHp },
    playerHp: hp,
    playerMaxHp: hp,
    deck: buildDeck(s),
    drawPile: [],
    discard: [],
    hand: [],
    round: 1,
    rounds: CONFIG.battle.rounds,
    over: false,
    result: null,
    notes: [],
  };
  b.drawPile = shuffle(s, b.deck);
  drawHand(s, b);
  return b;
}

export function cardDamage(s, card) {
  if (card.kind === 'support') return Math.floor(4 + maxFriend(s) * 0.12);
  return Math.floor(card.power * (0.8 + s.knowledge / 100) * (1 + lootMult(s, 'damage')));
}

// Returns { dealt, taken }: the ui layer uses it for shake size, red flash and sound.
// Presentation only, never part of settlement; sim.mjs may ignore the return value.
export function playCard(s, b, index) {
  const none = { dealt: 0, taken: 0 };
  if (b.over) return none;
  const card = b.hand[index];
  if (!card) return none;

  const dmg = cardDamage(s, card);
  b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
  b.hand.splice(index, 1);
  b.discard.push(card);
  b.notes.push('You played "' + card.name + '" for ' + dmg + ' damage.');
  if (card.kind === 'support') {
    const healed = Math.min(CONFIG.battle.supportHeal, b.playerMaxHp - b.playerHp);
    b.playerHp += healed;
    s.mood = clampMood(s.mood + 3);
    b.notes.push('A friend pulled you up: HP +' + healed + ', Mood +3.');
  }

  if (b.enemy.hp <= 0) {
    b.over = true;
    b.result = 'win';
    b.notes.push(b.enemy.name + ' crumbled to dust.');
    return { dealt: dmg, taken: 0 };
  }

  let atk = b.enemy.atk;
  // Doubling belongs only to the ddl fight (isBoss). This used to skip the enemy check, so every night
  // fight from round 3 shouted "DDL pursuit" — a placeholder, now confined to the boss.
  const ddl = b.enemy.isBoss && b.round >= CONFIG.battle.ddlRound;
  if (ddl) atk *= CONFIG.battle.ddlMult;
  b.playerHp = Math.max(0, b.playerHp - atk);
  s.mood = clampMood(s.mood - b.enemy.moodCost);
  b.notes.push(b.enemy.name + ' struck back: you take ' + atk + ' damage, Mood −' + b.enemy.moodCost + '. ' +
    (ddl ? '(DDL pursuit!)' : ''));

  if (b.playerHp <= 0) {
    b.over = true;
    b.result = 'lose';
    b.notes.push('You were dragged down.');
    return { dealt: dmg, taken: atk };
  }

  if (b.round >= b.rounds) {
    b.over = true;
    b.result = 'lose';
    b.notes.push('Dawn broke and ' + b.enemy.name + ' was still standing.');
    return { dealt: dmg, taken: atk };
  }

  b.round += 1;
  drawHand(s, b);
  return { dealt: dmg, taken: atk };
}
