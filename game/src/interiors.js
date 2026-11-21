// interiors.js — 室内场景数据（纯数据，不碰 DOM、不碰 canvas）。
// 每个场景 = 一张 24×15 的 ASCII 平面 + 若干交互点 + 一个调色板。
// 楼层之间靠电梯连通：进楼先到「电梯厅」，电梯面板上每层标着这层有什么。

import { CONFIG } from '../data.js';

export const IW = 24;
export const IH = 15;
export const ITILE = 32;

// # 墙   . 地面   B 课桌/书桌   T 乒乓球台   G 斯诺克台   P 钢琴   O 沙发   E 电梯门   D 楼门
export const ISOLID = new Set(['#', 'B', 'T', 'G', 'P', 'O', 'E', 'D']);

const PAL = {
  lobby: { a: '#3b4354', b: '#414a5e', wall: '#171a21', edge: '#4d5871', line: '#333b4b' },
  teach: { a: '#5a5140', b: '#635945', wall: '#1e1a15', edge: '#73654c', line: '#453e31' },
  play:  { a: '#3f5247', b: '#45594d', wall: '#18211c', edge: '#53705d', line: '#33443a' },
  study: { a: '#46505e', b: '#4c5766', wall: '#1b2029', edge: '#5b6879', line: '#37414e' },
  quiet: { a: '#4a4560', b: '#514b69', wall: '#1e1b29', edge: '#5f5779', line: '#393450' },
};

// 三栋楼共用同一个电梯厅平面：进楼 → 站在电梯口 → 选楼层。
const LOBBY = [
  '########################',
  '#......................#',
  '#......................#',
  '#......BBBBBBBB........#',
  '#......................#',
  '#......................#',
  '#......................#',
  'D......................#',
  '#......................#',
  '#......................#',
  '#...OOO........OOO.....#',
  '#...OOO........OOO.....#',
  '#......................#',
  '#......................#',
  '###########EE###########',
];

const FLOOR_TEACH = [
  '########################',
  '#......................#',
  '#..BBBB....BBBB........#',
  '#..BBBB....BBBB........#',
  '#......................#',
  '#......................#',
  '#..BBBB....BBBB...OOO..#',
  '#..BBBB....BBBB...OOO..#',
  '#......................#',
  '#......................#',
  '#................BB....#',
  '#......................#',
  '#......................#',
  '#......................#',
  '###########EE###########',
];

const FLOOR_PLAY = [
  '########################',
  '#......................#',
  '#...TTTT...............#',
  '#...TTTT...............#',
  '#......................#',
  '#......................#',
  '#..............GGGG....#',
  '#..............GGGG....#',
  '#......................#',
  '#......................#',
  '#.........PP...........#',
  '#......................#',
  '#......................#',
  '#......................#',
  '###########EE###########',
];

const FLOOR_STUDY = [
  '########################',
  '#......................#',
  '#..BBBBBB..BBBBBB......#',
  '#..BBBBBB..BBBBBB......#',
  '#......................#',
  '#......................#',
  '#..BBBBBB..BBBBBB......#',
  '#..BBBBBB..BBBBBB......#',
  '#......................#',
  '#......................#',
  '#..BBBBBB..BBBBBB......#',
  '#..BBBBBB..BBBBBB......#',
  '#......................#',
  '#......................#',
  '###########EE###########',
];

const FLOOR_QUIET = [
  '########################',
  '#......................#',
  '#......................#',
  '#.....OOOOOOOO.........#',
  '#.....OOOOOOOO.........#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#..........BB..........#',
  '#......................#',
  '#......................#',
  '#......................#',
  '###########EE###########',
];

// 电梯口/楼门永远在同一个位置，所以两栋楼的电梯厅可以共用一份交互点。
const LOBBY_SPOTS = [
  { id: 'lift', x: 11, y: 13, name: '电梯', icon: '🛗', kind: 'elevator', hint: '选楼层：层间移动不花行动点' },
  { id: 'gate', x: 1, y: 7, name: '出口', icon: '🚪', kind: 'leave', hint: '走出这栋楼，回校园' },
];

const R = CONFIG.room;
const sgn = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));

export const SCENES = {
  'cds1.lobby': {
    id: 'cds1.lobby',
    building: 'cds1',
    title: 'CDS-1 · 电梯厅',
    tag: '1F 电梯厅',
    map: LOBBY,
    pal: PAL.lobby,
    spawn: { x: 11, y: 12 },
    spots: LOBBY_SPOTS,
  },
  'cds1.f3': {
    id: 'cds1.f3',
    building: 'cds1',
    title: 'CDS-1 · 教学楼层',
    tag: '3F 教学楼层',
    map: FLOOR_TEACH,
    pal: PAL.teach,
    spawn: { x: 11, y: 12 },
    spots: [
      {
        id: 'cds1.course', x: 8, y: 5, name: '大课教室', icon: '🎓', kind: 'room', action: 'course', ap: 1, hint: '上一节课，换一张笔记卡',
        desc: '阶梯教室空着。前排有人占座，后排有人睡觉，黑板上还留着上一节的板书。',
        effect: '知识 +' + CONFIG.studyGain + '（心情越高越接近上限，专注 ×' + CONFIG.studyFocusMult + '），心情 −' + CONFIG.studyMoodCost + '，笔记 +1 张',
      },
      {
        id: 'cds1.doubt', x: 19, y: 5, name: '答疑角', icon: '📎', kind: 'room', action: 'doubt', ap: 1, hint: '问两道题，顺手认识一个人',
        desc: '助教坐在沙发边上，桌上摊着一沓没改完的作业。',
        effect: '知识 +' + R.doubt.know + '，心情 ' + sgn(R.doubt.mood) + '，和随机一位朋友的友谊 +' + R.doubt.friend + '（每天 1 次）',
      },
      { id: 'lift', x: 11, y: 13, name: '电梯', icon: '🛗', kind: 'elevator', hint: '回电梯厅，或去别的楼层' },
    ],
  },
  'wenyu.lobby': {
    id: 'wenyu.lobby',
    building: 'wenyu',
    title: '文娱楼 · 电梯厅',
    tag: '1F 电梯厅',
    map: LOBBY,
    pal: PAL.lobby,
    spawn: { x: 11, y: 12 },
    spots: LOBBY_SPOTS,
  },
  'wenyu.f1': {
    id: 'wenyu.f1',
    building: 'wenyu',
    title: '文娱楼 · 活动层',
    tag: '1F 活动层',
    map: FLOOR_PLAY,
    pal: PAL.play,
    spawn: { x: 11, y: 12 },
    spots: [
      {
        id: 'wenyu.tt', x: 5, y: 4, name: '乒乓球台', icon: '🏓', kind: 'room', action: 'pingpong', ap: 1, pick: 'pingpong', labelBelow: true, hint: '找个人打两局',
        desc: '台子空着，边上扔着两副拍子和一筒球。想打就得找人。',
        effect: '心情 +' + R.pingpong.mood + '，选一位朋友：友谊 +' + R.pingpong.friend + '（每天 1 次）',
      },
      {
        id: 'wenyu.snooker', x: 16, y: 8, name: '斯诺克台', icon: '🎱', kind: 'room', action: 'snooker', ap: 1, pick: 'snooker', labelBelow: true, hint: '约一局，聊点真的',
        desc: '绿呢台面，灯压得很低。这地方适合边打球边说点平时不说的话。',
        effect: '心情 +' + R.snooker.mood + '，选一位朋友：友谊 +' + R.snooker.friend + '（TA 今天还没和你聊过才行）',
      },
      {
        id: 'wenyu.piano', x: 10, y: 9, name: '钢琴', icon: '🎹', kind: 'piano', action: 'piano', ap: 1, hint: '弹几个音',
        desc: '一架立式钢琴，琴盖是开的。没人管，你可以弹。',
        effect: '弹够 4 个音：心情 +' + R.piano.mood + '（每天 1 次）',
      },
      { id: 'lift', x: 11, y: 13, name: '电梯', icon: '🛗', kind: 'elevator', hint: '回电梯厅，或去别的楼层' },
    ],
  },
  'wenyu.f2': {
    id: 'wenyu.f2',
    building: 'wenyu',
    title: '文娱楼 · 自习层',
    tag: '2F 自习层',
    map: FLOOR_STUDY,
    pal: PAL.study,
    spawn: { x: 11, y: 12 },
    spots: [
      {
        id: 'wenyu.studyroom', x: 9, y: 5, name: '自习室', icon: '📖', kind: 'room', action: 'studyroom', ap: 1, hint: '安静记一点，但写不成卡',
        desc: '长桌一路排到窗边，安静得能听见空调。',
        effect: '知识 +' + R.studyroom.know + '，心情 ' + sgn(R.studyroom.mood) + '，不产出笔记卡',
      },
      { id: 'lift', x: 11, y: 13, name: '电梯', icon: '🛗', kind: 'elevator', hint: '回电梯厅，或去别的楼层' },
    ],
  },
  'wenyu.f3': {
    id: 'wenyu.f3',
    building: 'wenyu',
    title: '文娱楼 · 静室层',
    tag: '3F 静室层',
    map: FLOOR_QUIET,
    pal: PAL.quiet,
    spawn: { x: 11, y: 12 },
    spots: [
      {
        id: 'wenyu.pray', x: 11, y: 9, name: '祷告室', icon: '🕯️', kind: 'room', action: 'pray', ap: 1, hint: '心情低的时候进来坐坐',
        desc: '一排长椅，窗上有彩色的玻璃。没有神像，只有安静。',
        effect: '心情 +' + R.pray.mood + '，但只有心情 ≤ ' + R.pray.moodMax + ' 时才进得去（每天 1 次）',
      },
      { id: 'lift', x: 11, y: 13, name: '电梯', icon: '🛗', kind: 'elevator', hint: '回电梯厅，或去别的楼层' },
    ],
  },
};

// 楼 → 电梯菜单。「未开放」的楼层也列出来，让人看见这栋楼的结构。
export const BUILDING_FLOORS = {
  cds1: {
    id: 'cds1',
    name: 'CDS-1',
    full: 'CDS-1 主教学楼',
    lobby: 'cds1.lobby',
    floors: [
      { id: 'cds1.lobby', label: '大堂', name: '电梯厅', rooms: '电梯 · 出口' },
      { id: 'cds1.f3', label: '3F', name: '教学楼层', rooms: '大课教室 · 答疑角' },
      { id: null, label: '5F', name: 'lab 层', rooms: '实验台 · 组会 · 机房', locked: true },
      { id: null, label: 'B1', name: 'gym 层', rooms: '健身房 · 泳池 · 更衣室', locked: true },
    ],
  },
  wenyu: {
    id: 'wenyu',
    name: '文娱楼',
    full: '文娱楼',
    lobby: 'wenyu.lobby',
    floors: [
      { id: 'wenyu.lobby', label: '大堂', name: '电梯厅', rooms: '电梯 · 出口' },
      { id: 'wenyu.f1', label: '1F', name: '活动层', rooms: '乒乓球 · 斯诺克 · 钢琴' },
      { id: 'wenyu.f2', label: '2F', name: '自习层', rooms: '自习室' },
      { id: 'wenyu.f3', label: '3F', name: '静室层', rooms: '祷告室' },
    ],
  },
};

export function sceneOf(id) {
  return SCENES[id] || null;
}
