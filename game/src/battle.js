// battle.js — 夜战：抽牌 / 出牌 / 敌人回合。纯逻辑，渲染在 ui.js。

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

// 今晚打谁：不再随机抽，按夜次固定排下去，并且逐夜变强。
// 这样「今晚打谁」是可以提前知道的，白天的准备才有针对性。
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
    isBoss: false, // ddl 战把它置 true，才会在第 3 回合起加倍
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

// 返回 { dealt, taken }：ui 层拿它决定抖多大幅度、闪不闪红、放什么音。
// 只给表现用，不参与任何结算，sim.mjs 忽略返回值也没关系。
export function playCard(s, b, index) {
  const none = { dealt: 0, taken: 0 };
  if (b.over) return none;
  const card = b.hand[index];
  if (!card) return none;

  const dmg = cardDamage(s, card);
  b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
  b.hand.splice(index, 1);
  b.discard.push(card);
  b.notes.push('你打出「' + card.name + '」，造成 ' + dmg + ' 点伤害。');
  if (card.kind === 'support') {
    const healed = Math.min(CONFIG.battle.supportHeal, b.playerMaxHp - b.playerHp);
    b.playerHp += healed;
    s.mood = clampMood(s.mood + 3);
    b.notes.push('好友拉了你一把：HP +' + healed + '，心境 +3。');
  }

  if (b.enemy.hp <= 0) {
    b.over = true;
    b.result = 'win';
    b.notes.push(b.enemy.name + '散成了灰。');
    return { dealt: dmg, taken: 0 };
  }

  let atk = b.enemy.atk;
  // 加倍只属于 ddl 战（isBoss）。以前这里不判断敌人身份，导致所有夜战
  // 第 3 回合都喊「DDL 追击」——那是占位实现，现在收回到 boss 身上。
  const ddl = b.enemy.isBoss && b.round >= CONFIG.battle.ddlRound;
  if (ddl) atk *= CONFIG.battle.ddlMult;
  b.playerHp = Math.max(0, b.playerHp - atk);
  s.mood = clampMood(s.mood - b.enemy.moodCost);
  b.notes.push(b.enemy.name + '反击，你受到 ' + atk + ' 点伤害，心境 −' + b.enemy.moodCost + '。' +
    (ddl ? '（DDL 追击！）' : ''));

  if (b.playerHp <= 0) {
    b.over = true;
    b.result = 'lose';
    b.notes.push('你被拖垮了。');
    return { dealt: dmg, taken: atk };
  }

  if (b.round >= b.rounds) {
    b.over = true;
    b.result = 'lose';
    b.notes.push('天亮了，' + b.enemy.name + '还站着。');
    return { dealt: dmg, taken: atk };
  }

  b.round += 1;
  drawHand(s, b);
  return { dealt: dmg, taken: atk };
}
