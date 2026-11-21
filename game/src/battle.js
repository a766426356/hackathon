// battle.js — 夜战：抽牌 / 出牌 / 敌人回合。纯逻辑，渲染在 ui.js。

import { CONFIG, ENEMIES } from '../data.js';
import { clampMood, maxFriend, nextRandom, playerMaxHp } from './state.js';

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
  if (s.supportUnlocked) cards.push({ name: '好友支援', kind: 'support', power: 0 });
  while (cards.length < 4) cards.push({ name: '临场发挥', kind: 'attack', power: CONFIG.battle.fillerPower });
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

export function startBattle(s) {
  const base = ENEMIES[Math.floor(nextRandom(s) * ENEMIES.length) % ENEMIES.length];
  const hp = playerMaxHp(s);
  const b = {
    enemy: {
      name: base.name,
      desc: base.desc,
      atk: base.atk,
      moodCost: base.moodCost,
      hp: CONFIG.battle.enemyHp,
      maxHp: CONFIG.battle.enemyHp,
    },
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
  return Math.floor(card.power * (0.8 + s.knowledge / 100));
}

export function playCard(s, b, index) {
  if (b.over) return;
  const card = b.hand[index];
  if (!card) return;

  const dmg = cardDamage(s, card);
  b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
  b.hand.splice(index, 1);
  b.discard.push(card);
  b.notes.push('你打出「' + card.name + '」，造成 ' + dmg + ' 点伤害。');
  if (card.kind === 'support') {
    const healed = Math.min(CONFIG.battle.supportHeal, b.playerMaxHp - b.playerHp);
    b.playerHp += healed;
    s.mood = clampMood(s.mood + 3);
    b.notes.push('好友拉了你一把：HP +' + healed + '，心情 +3。');
  }

  if (b.enemy.hp <= 0) {
    b.over = true;
    b.result = 'win';
    b.notes.push(b.enemy.name + '散成了灰。');
    return;
  }

  let atk = b.enemy.atk;
  const ddl = b.round >= CONFIG.battle.ddlRound;
  if (ddl) atk *= CONFIG.battle.ddlMult;
  b.playerHp = Math.max(0, b.playerHp - atk);
  s.mood = clampMood(s.mood - b.enemy.moodCost);
  b.notes.push(b.enemy.name + '反击，你受到 ' + atk + ' 点伤害，心情 −' + b.enemy.moodCost + '。' +
    (ddl ? '（DDL 追击！）' : ''));

  if (b.playerHp <= 0) {
    b.over = true;
    b.result = 'lose';
    b.notes.push('你被拖垮了。');
    return;
  }

  if (b.round >= b.rounds) {
    b.over = true;
    b.result = 'lose';
    b.notes.push('天亮了，' + b.enemy.name + '还站着。');
    return;
  }

  b.round += 1;
  drawHand(s, b);
}
