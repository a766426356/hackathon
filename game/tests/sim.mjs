// tests/sim.mjs — 无浏览器跑完整流程：不变量 + 结局分布。
// 用法：node tests/sim.mjs

import assert from 'node:assert/strict';
import { CONFIG } from '../data.js';
import { createState, examGpa, endingOf } from '../src/state.js';
import { lootMult } from '../src/loot.js';
import * as rules from '../src/rules.js';
import * as battle from '../src/battle.js';

const LIMIT = 600;

function checkInvariants(s, tag) {
  assert.ok(s.mood >= 0 && s.mood <= 100, tag + ': mood 越界 ' + s.mood);
  assert.ok(s.knowledge >= 0 && s.knowledge <= 150, tag + ': knowledge 越界 ' + s.knowledge);
  assert.ok(s.physique >= 0 && s.physique <= CONFIG.physiqueCap, tag + ': physique 越界 ' + s.physique);
  assert.ok(Number.isFinite(s.knowledge) && Number.isFinite(s.mood), tag + ': NaN');
  assert.ok(s.deck.length <= CONFIG.deckCap, tag + ': 牌组超上限 ' + s.deck.length);
  assert.ok(s.day >= 1 && s.day <= s.maxDay, tag + ': day 越界 ' + s.day);
  for (const id of Object.keys(s.friend)) {
    assert.ok(s.friend[id] >= 0 && s.friend[id] <= 100, tag + ': 友谊越界 ' + id);
  }
  // 战利品：只放大出口，所以任何一类都不许超过封顶
  assert.equal(s.loot.length, s.battleWins, tag + ': 每次胜利应该恰好掉一件，' +
    s.loot.length + ' 件 vs ' + s.battleWins + ' 胜');
  for (const kind of ['damage', 'hp', 'day']) {
    assert.ok(lootMult(s, kind) <= CONFIG.lootCap + 1e-9,
      tag + ': ' + kind + ' 加成超过封顶 ' + lootMult(s, kind));
  }
  if (s.lootCount >= 3) {
    assert.ok(s.lootHasRare, tag + ': 前三次掉落没有出现稀有以上，保底没生效');
  }
}

function dayActions(s, strategy) {
  // strategy: 'study' 只学习 / 'mixed' 学习+社交+操场 / 'social' 只社交 / 'lazy' 白天躺平
  // 「第一件事」判定用 freeAp：必修课不占自由点，所以自由点满格就是一天刚开始
  const npcs = ['lin', 'chen', 'zhou'];
  let guard = 0;
  while (s.phase === 'day' && s.ap > 0 && guard++ < 20) {
    if (strategy === 'smart') {
      if (s.mood < 45) rules.field(s);
      else if (s.day % 2 === 0 && s.ap === CONFIG.freeAp) rules.social(s, 'lin');
      else rules.study(s);
    } else if (strategy === 'lazy') {
      rules.rest(s);
    } else if (strategy === 'social') {
      const free = npcs.find((id) => !s.today.talked[id]);
      if (free) rules.social(s, free); else rules.field(s);
    } else if (strategy === 'indoor') {
      // 室内一条线：答疑 → 乒乓 → 大课教室（各 1 点）
      if (!s.today.doubt) rules.doubt(s);
      else if (!s.today.pingpong) rules.pingpong(s, 'lin');
      else rules.course(s);
    } else if (strategy === 'chill') {
      // 只泡文娱楼：钢琴 + 乒乓 把心情拉满，再自习室读一点
      if (!s.today.piano) rules.piano(s, 4);
      else if (!s.today.pingpong) rules.pingpong(s, 'chen');
      else rules.studyroom(s);
    } else if (strategy === 'mixed' && s.day % 2 === 0 && s.ap === CONFIG.freeAp) {
      rules.social(s, 'lin');
    } else if (strategy === 'mixed' && s.ap === 1 && s.mood < 45) {
      rules.field(s);
    } else {
      rules.study(s);
    }
    checkInvariants(s, 'day');
  }
}

function night(s, strategy) {
  // 打一场：出牌到结束再结算。fights 是「这一局打了几场」，用来测成长曲线。
  const fight = () => {
    const b = battle.startBattle(s);
    let guard = 0;
    while (!b.over && guard++ < 20) battle.playCard(s, b, 0);
    assert.ok(b.over, '战斗没有结束');
    rules.settleBattle(s, b);
  };

  if (strategy === 'smart' && s.day >= 3) {
    fight();
  } else if (strategy === 'mixed' && s.day % 2 === 1) {
    fight();
  } else if (strategy === 'fighter') {
    // 边学边打：白天全上课攒牌，晚上每场都打（专门用来测敌人成长 + 战利品滚雪球）
    fight();
  } else {
    rules.nightStudy(s);
  }
  rules.endDay(s);
  checkInvariants(s, 'night');
}

export function playOne(seed, strategy) {
  const s = createState(seed);
  s.phase = 'day';
  rules.requiredCourses(s); // 第 1 天的两节必修课（之后每天由 endDay 自动补）
  assert.ok(s.today.courses, '第 1 天必修课没有结算');
  let steps = 0;
  while (s.phase !== 'ending' && steps++ < LIMIT) {
    if (s.phase === 'day') {
      dayActions(s, strategy);
      assert.ok(s.ap <= 0, '白天没有耗尽行动点');
      s.phase = 'night';
    } else if (s.phase === 'night') {
      night(s, strategy);
    } else if (s.phase === 'exam') {
      rules.runExam(s);
    } else {
      throw new Error('未知阶段: ' + s.phase);
    }
  }
  assert.ok(s.phase === 'ending', '流程没有终止');
  assert.ok(s.gpa >= 0 && s.gpa <= CONFIG.gpaMax, 'GPA 越界');
  assert.equal(s.gpa, Math.round(s.gpa * 100) / 100, 'GPA 精度异常');
  assert.equal(s.ending, endingOf(s), '结局判定不一致');
  return s;
}

// ---------------------------------------------------------------- 跑
const strategies = ['study', 'mixed', 'social', 'lazy', 'smart', 'indoor', 'chill', 'fighter'];
const counts = { great: 0, pass: 0, warn: 0 };
const seeds = 100;
let runs = 0;

for (const strategy of strategies) {
  for (let i = 1; i <= seeds; i++) {
    const s = playOne(i * 7919, strategy);
    counts[s.ending] += 1;
    runs += 1;
  }
}

const byStrategy = {};
for (const strategy of strategies) {
  const arr = [];
  for (let i = 1; i <= seeds; i++) arr.push(playOne(i * 7919, strategy));
  byStrategy[strategy] = {
    gpa: (arr.reduce((a, s) => a + s.gpa, 0) / arr.length).toFixed(2),
    min: Math.min(...arr.map((s) => s.gpa)).toFixed(2),
    max: Math.max(...arr.map((s) => s.gpa)).toFixed(2),
    know: (arr.reduce((a, s) => a + s.knowledge, 0) / arr.length).toFixed(0),
    mood: (arr.reduce((a, s) => a + s.mood, 0) / arr.length).toFixed(0),
    wins: (arr.reduce((a, s) => a + s.battleWins, 0) / arr.length).toFixed(1),
    deck: (arr.reduce((a, s) => a + s.deck.length, 0) / arr.length).toFixed(1),
  };
}
console.log('分策略', byStrategy);
console.log('跑完 ' + runs + ' 局');
console.log('结局分布', counts);

for (const k of ['great', 'pass', 'warn']) {
  assert.ok(counts[k] > 0, '结局「' + k + '」一次都没出现，数值失衡');
}

// 只泡文娱楼（不产卡）不该摸到「学神」——分数和卡组必须是两条腿
assert.ok(Number(byStrategy.chill.gpa) < CONFIG.endingGreat,
  '光靠心情和自习室就能拿学神，数值失衡：' + byStrategy.chill.gpa);
// 室内路线也不能比纯自习更强
assert.ok(Number(byStrategy.indoor.gpa) <= Number(byStrategy.study.gpa) + 0.3,
  '室内房间收益超过自习太多：' + byStrategy.indoor.gpa + ' vs ' + byStrategy.study.gpa);

// 同一 seed 必须完全可复现
const a = playOne(12345, 'mixed');
const b = playOne(12345, 'mixed');
assert.deepEqual(
  { gpa: a.gpa, mood: a.mood, knowledge: a.knowledge, ending: a.ending, day: a.day },
  { gpa: b.gpa, mood: b.mood, knowledge: b.knowledge, ending: b.ending, day: b.day },
  '同 seed 结果不可复现'
);

// 极端 sanity：不做任何事（只熬夜晚）也应该能算出一个 GPA
const lazy = createState(42);
lazy.phase = 'day';
for (let d = 0; d < 6; d++) { lazy.ap = 0; lazy.phase = 'night'; rules.endDay(lazy); }
assert.equal(lazy.phase, 'exam');
rules.runExam(lazy);
assert.ok(lazy.gpa <= 2.0, '摆烂居然还能过，考勤/知识没有起作用');

console.log('全部断言通过 ✓');
