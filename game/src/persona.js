// persona.js — the HKUTI report shown on the ending screen. Pure calculation:
// no DOM, no randomness. Every axis is derived from what the player actually did.
//
//   1. E Crowd / I Solo   ← chats + play + events  vs  lectures + solo study
//   2. A Gamble / S Steady ← night fights           vs  late-night study + early nights
//   3. B Body / M Mind     ← physique gained        vs  knowledge
//   4. P Push / D Drift    ← things actually done   vs  early nights + missed events
//
// Rule for ties: whenever both sides are zero the letter falls to the second one,
// so a player who does nothing always lands on ISMD (The Passer-By) rather than
// something flattering.
//
// This is not MBTI and it never claims to be. The letters only look familiar.

import { CONFIG, NPCS, TOPICS, LOOT } from '../data.js';

// Cards and loot from older saves carry no `en` field; look one up so the report never falls back to Chinese.
const cardLabel = (c) => c.en || (TOPICS.find((t) => t.id === c.topic) || {}).en || c.name;
const lootLabel = (l) => l.en || (LOOT.find((x) => x.id === l.id) || {}).en || l.name;

const AXES = [
  { pos: 'E', neg: 'I', posLabel: 'Crowd', negLabel: 'Solo', question: 'where your hours went' },
  { pos: 'A', neg: 'S', posLabel: 'Gamble', negLabel: 'Steady', question: 'how you spent your nights' },
  { pos: 'B', neg: 'M', posLabel: 'Body', negLabel: 'Mind', question: 'what you led with' },
  { pos: 'P', neg: 'D', posLabel: 'Push', negLabel: 'Drift', question: 'how hard you pushed' },
];

// 16 combinations. Title + one line, both deliberately dry rather than wacky.
export const PERSONA_TYPES = {
  EABP: ['The Campus Athlete', 'Knows everyone, sprints between lectures, never misses the 8am.'],
  EABD: ['The Yes Machine', 'Says yes first and plans later. Somehow still standing.'],
  EAMP: ['The Overcommitted', 'Three societies, two study groups, one collapsing calendar.'],
  EAMD: ['The Improviser', 'No plan, no notes, no problem. Mostly.'],
  ESBP: ['The Hall President', 'Eight hours of sleep, runs the floor, never late.'],
  ESBD: ['The Friendly Slacker', "Everyone's favourite person to do nothing with."],
  ESMP: ['The Group Project MVP', 'Always in the library, always with company.'],
  ESMD: ['The Regular', 'Same seat, same order, different day.'],
  IABP: ['The Night Runner', 'Unreachable by day. Very fast by night.'],
  IABD: ['The Solo Adventurer', 'Says little, has tried everything once.'],
  IAMP: ['The Silent Finisher', 'Says little. Finishes everything.'],
  IAMD: ['The Deep Diver', 'One tab, one rabbit hole, one entire day.'],
  ISBP: ['The Creature of Habit', 'Run, shower, sleep. Repeat until graduation.'],
  ISBD: ['The Bed Person', 'You and that bed have a committed relationship.'],
  ISMP: ['The Library Squatter', 'Nobody else dares sit there.'],
  ISMD: ['The Passer-By', 'You were enrolled. That is roughly the whole record.'],
};

const VERDICTS = {
  E: "You don't have a social life — you have a social schedule.",
  I: "Alone isn't lonely. It's where you recharge.",
  A: 'You act first; the thinking mostly catches up.',
  S: 'You kept every risk under control. Nothing happened.',
  B: 'You invested in the only asset that compounds: legs.',
  M: 'You turned every problem into a page problem.',
  P: "Your calendar is fuller than your tutor's.",
  D: 'The plan was decorative.',
};

function axis(pair, a, b) {
  const total = a + b;
  return {
    ...pair,
    letter: a > b ? pair.pos : pair.neg,
    label: a > b ? pair.posLabel : pair.negLabel,
    // percentage leaning towards the first side; null when neither side was used
    share: total > 0 ? Math.round((a / total) * 100) : null,
  };
}

export function buildPersona(s) {
  const st = s.stats || {};
  const n = (k) => Number(st[k]) || 0;

  const social = n('talk') + n('play') + n('events') * 0.6;
  const solo = n('studies') + n('indoor');
  // night fights are the only genuinely risky choice, so they weigh more
  const brave = n('fights') * 1.5;
  const safe = n('nightStudy') + n('rest') * 0.5;
  // physique is measured as growth from the starting value, plus the runs themselves
  const body = Math.max(0, s.physique - CONFIG.startPhysique) + n('field') * 2;
  const mind = s.knowledge / 2.5;
  // anything the player actively did, excluding the two compulsory lectures
  const push = n('course') + n('indoor') + n('talk') + n('play') +
    n('events') + n('field') + n('fights') + n('nightStudy');
  const missed = (s.calendar || []).filter((e) => e.missed).length;
  const drift = n('rest') * 2 + missed * 1.5;

  const axes = [
    axis(AXES[0], social, solo),
    axis(AXES[1], brave, safe),
    axis(AXES[2], body, mind),
    axis(AXES[3], push, drift),
  ];

  const code = axes.map((a) => a.letter).join('');
  const [name, line] = PERSONA_TYPES[code] || PERSONA_TYPES.ISMD;

  // whichever axis has the widest raw gap supplies the closing line
  const raw = [social - solo, brave - safe, body - mind, push - drift];
  let dom = 0;
  for (let i = 1; i < raw.length; i++) {
    if (Math.abs(raw[i]) > Math.abs(raw[dom])) dom = i;
  }

  const counts = {
    lectures: n('studies'),
    soloStudy: n('indoor'),
    chats: n('talk'),
    play: n('play'),
    events: n('events'),
    runs: n('field'),
    fights: n('fights'),
    wins: s.battleWins || 0,
    lateNights: n('nightStudy'),
    earlyNights: n('rest'),
  };

  const friendIds = Object.keys(s.friend || {});
  let topFriend = null;
  for (const id of friendIds) {
    if (!topFriend || s.friend[id] > s.friend[topFriend]) topFriend = id;
  }

  const bestCard = (s.deck || []).reduce((b, c) => (!b || c.power > b.power ? c : b), null);
  const loot = (s.loot || []).slice();
  const best = loot.sort((a, b) => b.value - a.value)[0] || null;

  return {
    code,
    name,
    line,
    axes: axes.map((a, i) => ({ ...a, gap: Math.abs(raw[i]) })),
    verdict: VERDICTS[axes[dom].letter],
    dominant: axes[dom],
    counts,
    topFriend: topFriend
      ? { id: topFriend, name: NPCS[topFriend].en || NPCS[topFriend].name, value: s.friend[topFriend] }
      : null,
    bestCard: bestCard ? { ...bestCard, label: cardLabel(bestCard) } : null,
    lootCount: loot.length,
    bestLoot: best ? { ...best, label: lootLabel(best) } : null,
    eventsDone: (s.calendar || []).filter((e) => e.done).length,
    eventsMissed: missed,
    collapsed: !!s.collapsedOnce,
  };
}
