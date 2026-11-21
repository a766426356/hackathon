// persona.js — 结局的「人格报告」。纯计算，不碰 DOM、不碰随机。
//
// 四个轴，每个轴都由真实行为算出来，不是随机分配：
//   1. E 人群 / I 独处   ← 社交+娱乐 vs 上课+自习
//   2. A 冒险 / S 稳妥   ← 夜战场次 vs 夜读+躺平
//   3. B 身体 / M 脑子   ← 体质增长 vs 知识
//   4. P 计划 / F 随缘   ← 参加过的活动 vs 错过的活动
// 任何一边为 0 时一律落到后一个字母，所以「什么都不做」会稳定得到 ISMF。

import { CONFIG } from '../data.js';
import { NPCS } from '../data.js';

const AXIS_PAIRS = [
  { pos: 'E', neg: 'I', posLabel: '热闹', negLabel: '独处', question: '你把时间花在谁身上' },
  { pos: 'A', neg: 'S', posLabel: '冒险', negLabel: '稳妥', question: '晚上你怎么过' },
  { pos: 'B', neg: 'M', posLabel: '身体', negLabel: '脑子', question: '你先动哪儿' },
  // 第四轴刻意不是「计划 / 随缘」而是「投入 / 随缘」：
  // 只用日历条目分不出「天天泡自习室」和「什么都没做」，两者都会变成 ISMF。
  { pos: 'P', neg: 'F', posLabel: '投入', negLabel: '随缘', question: '这七天你投入了多少' },
];

// 16 种组合。前四位是字母，后面是称号和一句话。
// 「脑子」那一侧的称号刻意写成做事方式而不是地点 —— 一个从不学习但仍很投入的人
// 也会落到这一侧，叫「学神」或者「图书馆里最受欢迎的人」就不对了。
const TYPES = {
  EABP: ['全场焦点的运动型', '一整天在楼里楼外跑，晚上还敢出门。'],
  EABF: ['想到就做的野孩子', '计划是什么？先跑两圈再说。'],
  EAMP: ['什么都想掺一脚的人', '课要上、人要聊、活动不能落下。'],
  EAMF: ['临场发挥型', '全靠当天的状态，反正总能活下来。'],
  ESBP: ['稳当的班长', '作息规律、身体扎实、还从不迟到。'],
  ESBF: ['看起来很好说话的咸鱼', '谁叫你出去玩你都说好，然后回去睡觉。'],
  ESMP: ['谁来约都答应的好人', '你的日程表是别人替你填的。'],
  ESMF: ['谁都能聊两句的散人', '不深交，但整栋楼都认识你。'],
  IABP: ['一个人夜跑的狠人', '白天见不到你，晚上操场见。'],
  IABF: ['独来独往的冒险家', '不太说话，但什么都敢试。'],
  IAMP: ['闷头推进的人', '想清楚再动手，很少浪费。'],
  IAMF: ['沉浸式摸鱼', '一个人、一张桌子、一整天。'],
  ISBP: ['规律作息的运动宅', '跑步、睡觉、再来一遍。'],
  ISBF: ['床是本体', '你和那张床建立了深厚的感情。'],
  ISMP: ['自习室钉子户', '那个位子没人敢坐。'],
  ISMF: ['安静的过客', '你来过，但没人记得你干了什么。'],
};

const VERDICTS = {
  E: '你不是在社交，就是在去社交的路上。',
  I: '一个人待着对你不是孤独，是充电。',
  A: '你的选择大多是先做再说——好在运气不错。',
  S: '你把风险控制得很好，代价是什么都还没发生。',
  B: '身体是革命的本钱，你把这笔本钱花得很值。',
  M: '你把所有问题都变成了纸上的问题。',
  P: '你的日程比辅导员还满。',
  F: '计划表在你这里只是装饰。',
};

function axis(pair, a, b) {
  const total = a + b;
  return {
    ...pair,
    letter: a > b ? pair.pos : pair.neg,
    label: a > b ? pair.posLabel : pair.negLabel,
    // 正方向占多少；两边都是 0 时给 null，界面上显示「没干过」
    share: total > 0 ? Math.round((a / total) * 100) : null,
  };
}

export function buildPersona(s) {
  const st = s.stats || {};
  const n = (k) => Number(st[k]) || 0;

  // 娱乐和活动都算「跟人打交道」，但权重低于纯聊天
  const social = n('talk') + n('play') + n('events') * 0.6;
  const solo = n('studies') + n('indoor');
  // 夜战是唯一的高风险选择，所以权重高一点
  const brave = n('fights') * 1.5;
  const safe = n('nightStudy') + n('rest') * 0.5;
  // 体质用「比开局多了多少」算，跑步次数再加一点，避免只看最终值
  const body = Math.max(0, s.physique - CONFIG.startPhysique) + n('field') * 2;
  const mind = s.knowledge / 2.5;
  const missed = (s.calendar || []).filter((e) => e.missed).length;
  // 主动做过的事（不含必修课，否则每个玩家都凭空有 12 次「投入」）
  const push = n('course') + n('indoor') + n('talk') + n('play') +
    n('events') + n('field') + n('fights') + n('nightStudy');
  // 躺下结束白天、以及被划掉的活动，都算「随缘」
  const drift = n('rest') * 2 + missed * 1.5;
  const done = (s.calendar || []).filter((e) => e.done).length;

  const axes = [
    axis(AXIS_PAIRS[0], social, solo),
    axis(AXIS_PAIRS[1], brave, safe),
    axis(AXIS_PAIRS[2], body, mind),
    axis(AXIS_PAIRS[3], push, drift),
  ];

  const code = axes.map((a) => a.letter).join('');
  const [name, line] = TYPES[code] || TYPES.ISMF;

  // 原始数值差最大的那一轴决定那句毒舌（全 0 时落在第一轴，字母是后一个）
  const raw = [social - solo, brave - safe, body - mind, push - drift];
  let dom = 0;
  for (let i = 1; i < raw.length; i++) {
    if (Math.abs(raw[i]) > Math.abs(raw[dom])) dom = i;
  }

  const counts = {
    studies: n('studies'),
    indoor: n('indoor'),
    talk: n('talk'),
    play: n('play'),
    events: n('events'),
    field: n('field'),
    fights: n('fights'),
    wins: s.battleWins || 0,
    nightStudy: n('nightStudy'),
    rest: n('rest'),
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
    topFriend: topFriend ? { id: topFriend, name: NPCS[topFriend].name, value: s.friend[topFriend] } : null,
    bestCard,
    lootCount: loot.length,
    bestLoot: best,
    eventsDone: done,
    eventsMissed: missed,
    collapsed: !!s.collapsedOnce,
  };
}
