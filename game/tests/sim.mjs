// tests/sim.mjs — full run without a browser: invariants + ending distribution.
// Usage: node tests/sim.mjs

import assert from 'node:assert/strict';
import { CONFIG } from '../data.js';
import { createState, examGpa, endingOf } from '../src/state.js';
import { lootMult } from '../src/loot.js';
import * as rules from '../src/rules.js';
import * as battle from '../src/battle.js';

const LIMIT = 600;

function checkInvariants(s, tag) {
  assert.ok(s.mood >= 0 && s.mood <= 100, tag + ': mood out of range ' + s.mood);
  assert.ok(s.knowledge >= 0 && s.knowledge <= 150, tag + ': knowledge out of range ' + s.knowledge);
  assert.ok(s.physique >= 0 && s.physique <= CONFIG.physiqueCap, tag + ': physique out of range ' + s.physique);
  assert.ok(Number.isFinite(s.knowledge) && Number.isFinite(s.mood), tag + ': NaN');
  assert.ok(s.deck.length <= CONFIG.deckCap, tag + ': deck over the cap ' + s.deck.length);
  assert.ok(s.day >= 1 && s.day <= s.maxDay, tag + ': day out of range ' + s.day);
  for (const id of Object.keys(s.friend)) {
    assert.ok(s.friend[id] >= 0 && s.friend[id] <= 100, tag + ': friendship out of range ' + id);
  }
  // loot: it only scales the payout, so no kind may exceed the cap
  assert.equal(s.loot.length, s.battleWins, tag + ': each win should drop exactly one item, ' +
    s.loot.length + ' items vs ' + s.battleWins + ' wins');
  for (const kind of ['damage', 'hp', 'day']) {
    assert.ok(lootMult(s, kind) <= CONFIG.lootCap + 1e-9,
      tag + ': ' + kind + ' bonus over the cap ' + lootMult(s, kind));
  }
  if (s.lootCount >= 3) {
    assert.ok(s.lootHasRare, tag + ': no rare or better in the first three drops, the pity rule did not fire');
  }
}

function dayActions(s, strategy) {
  // strategy: 'study' study only / 'mixed' study+social+field / 'social' social only / 'lazy' slack off by day
  // the "first action" test uses freeAp: required lectures do not eat free points, so a full pool means the day just started
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
      // one indoor line: Help Desk → Table Tennis → Lecture Hall (1 point each)
      if (!s.today.doubt) rules.doubt(s);
      else if (!s.today.pingpong) rules.pingpong(s, 'lin');
      else rules.course(s);
    } else if (strategy === 'chill') {
      // Wenyu Building only: Piano + Table Tennis to max out mood, then a bit of Study Room
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
  // one fight: play cards until it ends, then settle. fights means "battles played this run", used to measure the growth curve.
  const fight = () => {
    const b = battle.startBattle(s);
    let guard = 0;
    while (!b.over && guard++ < 20) battle.playCard(s, b, 0);
    assert.ok(b.over, 'the battle never ended');
    rules.settleBattle(s, b);
  };

  if (strategy === 'smart' && s.day >= 3) {
    fight();
  } else if (strategy === 'mixed' && s.day % 2 === 1) {
    fight();
  } else if (strategy === 'fighter') {
    // study while fighting: lectures all day to pile up cards, a fight every night (meant to test enemy growth + loot snowballing)
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
  rules.requiredCourses(s); // the two required lectures on day 1 (endDay tops them up from then on)
  assert.ok(s.today.courses, 'day 1 required lectures were not settled');
  let steps = 0;
  while (s.phase !== 'ending' && steps++ < LIMIT) {
    if (s.phase === 'day') {
      dayActions(s, strategy);
      assert.ok(s.ap <= 0, 'daytime did not use up the Action Points');
      s.phase = 'night';
    } else if (s.phase === 'night') {
      night(s, strategy);
    } else if (s.phase === 'exam') {
      rules.runExam(s);
    } else {
      throw new Error('unknown phase: ' + s.phase);
    }
  }
  assert.ok(s.phase === 'ending', 'the run never terminated');
  assert.ok(s.gpa >= 0 && s.gpa <= CONFIG.gpaMax, 'GPA out of range');
  assert.equal(s.gpa, Math.round(s.gpa * 100) / 100, 'GPA precision is off');
  assert.equal(s.ending, endingOf(s), 'the ending judgement is inconsistent');
  return s;
}

// ---------------------------------------------------------------- run
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
console.log('by strategy', byStrategy);
console.log('finished ' + runs + ' runs');
console.log('ending distribution', counts);

for (const k of ['great', 'pass', 'warn']) {
  assert.ok(counts[k] > 0, 'ending "' + k + '" never appeared, the numbers are unbalanced');
}

// Wenyu Building only (no cards) must not reach "Scholar" — GPA and deck have to be two separate legs
assert.ok(Number(byStrategy.chill.gpa) < CONFIG.endingGreat,
  'mood and the Study Room alone can reach Scholar, the numbers are unbalanced: ' + byStrategy.chill.gpa);
// the indoor route must not be stronger than plain studying either
assert.ok(Number(byStrategy.indoor.gpa) <= Number(byStrategy.study.gpa) + 0.3,
  'indoor rooms pay out far more than studying: ' + byStrategy.indoor.gpa + ' vs ' + byStrategy.study.gpa);

// the same seed must be fully reproducible
const a = playOne(12345, 'mixed');
const b = playOne(12345, 'mixed');
assert.deepEqual(
  { gpa: a.gpa, mood: a.mood, knowledge: a.knowledge, ending: a.ending, day: a.day },
  { gpa: b.gpa, mood: b.mood, knowledge: b.knowledge, ending: b.ending, day: b.day },
  'same seed, different result'
);

// extreme sanity check: doing nothing (just riding out the nights) should still produce a GPA
const lazy = createState(42);
lazy.phase = 'day';
for (let d = 0; d < 6; d++) { lazy.ap = 0; lazy.phase = 'night'; rules.endDay(lazy); }
assert.equal(lazy.phase, 'exam');
rules.runExam(lazy);
assert.ok(lazy.gpa <= 2.0, 'slacking off still passes, attendance/knowledge have no effect');

console.log('all assertions passed ✓');
