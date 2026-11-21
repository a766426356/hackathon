// data.js — 全部数值 / 地图 / 文案。改平衡性只需要动这个文件。

export const CONFIG = {
  schoolName: '张江学园',
  maxDay: 7, // 第 7 天考试

  // 每天 5 个行动点 = 2 节必修大课（每天开头自动结算，不占自由点）+ 3 点自由支配
  requiredCourses: 2,
  freeAp: 3,
  totalAp: 5,

  startMood: 60,
  moodMin: 0,
  moodMax: 100,

  // 三属性各只管一件事：知识 → 战斗伤害；心境 → 白天收益倍率；体质 → 血量
  startPhysique: 6,
  hpPerPhysique: 1.2,
  physiqueCap: 60,

  studyGain: 7,
  studyMoodCost: 4,
  studyFocusMult: 1.5,
  // 必修课给固定的一小份（不受心境影响）：必修不是选择，不该拿它奖励高心情
  requiredCourseGain: 3,
  requiredCourseMoodCost: 2,
  deckCap: 8,

  socialGain: 12,
  socialMood: 10,
  friendSupportAt: 40,

  fieldMood: 12,
  fieldPhysique: 4,
  restMood: 12,
  boardKnowledge: 4,
  boardFriend: 5,
  boardMoodCost: 2,

  nightStudyGain: 5,
  nightStudyMoodCost: 8,

  winMood: 12,
  winKnowledge: 4,
  loseMood: 15,
  loseKnowledge: 5,

  collapseMood: 20,
  collapseAp: 1,

  examBase: 1.0,
  examKnowledgeDiv: 170,
  examMoodScale: 0.5,
  gpaMax: 4.3,

  endingPass: 2.5,
  endingGreat: 3.4,
  endingGreatWins: 2,

  battle: {
    rounds: 4,
    handSize: 3,
    enemyHp: 38,
    playerBaseHp: 30,
    ddlRound: 3,
    ddlMult: 2,
    fillerPower: 7,
    supportHeal: 8,
  },

  // 房间数值：一处定义，interiors.js 的说明文案和 rules.js 的结算都读这里
  room: {
    doubt:     { know: 2, mood: -1, friend: 5 },
    pingpong:  { mood: 9, friend: 6 },
    snooker:   { mood: 8, friend: 8 },
    piano:     { mood: 12, notes: 4 },
    studyroom: { know: 5, mood: -2 },
    pray:      { mood: 15, moodMax: 45 },
  },
};

// ---------------------------------------------------------------- 地图
export const COLS = 24;
export const ROWS = 15;
export const TILE = 32;
export const MAP_W = COLS * TILE;
export const MAP_H = ROWS * TILE;

export const BUILDINGS = [
  { id: 'cds1',  name: 'CDS-1', x: 2,  y: 2,  w: 5, h: 3, roof: '#c1666b', wall: '#e8ddc8' },
  { id: 'wenyu', name: '文娱楼', x: 17, y: 2,  w: 5, h: 3, roof: '#c98b3b', wall: '#f0e6d2' },
  { id: 'club',  name: '社团楼', x: 2,  y: 10, w: 4, h: 3, roof: '#7f6bb0', wall: '#e8ddc8' },
  { id: 'dorm',  name: '宿舍',   x: 9,  y: 10, w: 6, h: 3, roof: '#5b8bb0', wall: '#f0e6d2' },
];

const TREE_SPOTS = [
  [13, 2], [14, 2], [13, 3], [22, 5], [1, 9], [16, 6], [17, 6],
  [6, 12], [7, 12], [16, 12], [17, 12], [21, 9], [2, 6], [22, 11],
];

const POND_SPOTS = [[7, 8], [8, 8], [7, 9], [8, 9]];

function buildGrid() {
  const g = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      row.push(edge ? 'T' : '.');
    }
    g.push(row);
  }
  const put = (x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };

  // 主干道
  for (let x = 1; x < COLS - 1; x++) if (g[6][x] !== 'T') put(x, 6, '=');
  for (let y = 5; y < ROWS - 1; y++) put(11, y, '=');
  for (let y = 6; y <= 9; y++) put(20, y, '=');
  for (let x = 4; x <= 11; x++) put(x, 5, '=');
  for (let x = 11; x <= 19; x++) put(x, 5, '=');

  for (const [x, y] of POND_SPOTS) put(x, y, 'W');
  for (const [x, y] of TREE_SPOTS) put(x, y, 'T');

  for (const b of BUILDINGS) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) put(x, y, 'B');
    }
  }
  put(11, 6, 'B'); // 公告板
  return g.map((r) => r.join(''));
}

export const MAP = buildGrid();
export const SPAWN = { x: 11, y: 9 };

// ---------------------------------------------------------------- 交互点
export const INTERACTABLES = [
  { id: 'cds1',  name: 'CDS-1', icon: '🏫', kind: 'enter', building: 'cds1', x: 4, y: 5, hint: '进楼：电梯厅 → 3F 教学楼层（大课教室 / 答疑角）' },
  { id: 'wenyu', name: '文娱楼', icon: '🎱', kind: 'enter', building: 'wenyu', x: 19, y: 5, hint: '进楼：乒乓球 / 斯诺克 / 钢琴 / 自习室 / 祷告室' },
  { id: 'board', name: '公告板', icon: '📋', kind: 'board', x: 11, y: 7, labelBelow: true, hint: '当日日程：小量知识 + 一段友谊' },
  { id: 'lin',   name: '林 · 文娱楼', icon: '☕', kind: 'social', npc: 'lin', x: 16, y: 5, hint: '聊天：友谊 +、心情 +' },
  { id: 'chen',  name: '陈 · 社团楼', icon: '🎭', kind: 'social', npc: 'chen', x: 2, y: 13, hint: '聊天：友谊 +、心情 +' },
  { id: 'zhou',  name: '周 · 社团楼', icon: '🎧', kind: 'social', npc: 'zhou', x: 5, y: 13, hint: '聊天：友谊 +、心情 +' },
  { id: 'field', name: '操场', icon: '🏃', kind: 'field', x: 20, y: 9, hint: '跑步：心情 +，获得「专注」' },
  { id: 'dorm',  name: '宿舍', icon: '🛏️', kind: 'rest', x: 11, y: 13, hint: '休息：心情 +，直接结束白天' },
];

// ---------------------------------------------------------------- NPC / 卡 / 敌人
export const NPCS = {
  lin:  { id: 'lin',  name: '林', place: '文娱楼', color: '#d98b8b', taunt: '「输的人请奶茶。」', lines: [
    '这周的读书会你来吗？我带了手冲。',
    '别把绩点当成全部啊……虽然我也做不到。',
    '累了就来坐坐，我请你喝一杯。',
  ] },
  chen: { id: 'chen', name: '陈', place: '社团楼', color: '#7fa8d9', taunt: '「我高中可是校队的。」', lines: [
    '社团招新还差一个人，就你了。',
    '排练到十点，反正也睡不着。',
    '你上次那个点子，其实挺有意思的。',
  ] },
  zhou: { id: 'zhou', name: '周', place: '社团楼', color: '#9ad98b', taunt: '「让我先热个身。」', lines: [
    '听说 CDS-1 三楼的自习位，晚上特别安静。',
    '我把重点整理成卡片了，要不要？',
    '熬夜是会写在脸上的。',
  ] },
};

export const TOPICS = [
  { id: 'linalg', name: '线性代数·特征值', power: 9 },
  { id: 'bayes',  name: '概率论·贝叶斯',   power: 10 },
  { id: 'rbtree', name: '数据结构·红黑树', power: 11 },
  { id: 'deadlock', name: '操作系统·死锁', power: 9 },
  { id: 'dfa',    name: '编译原理·DFA',    power: 8 },
  { id: 'writing', name: '学术写作·论证',  power: 10 },
];

export const ENEMIES = [
  { id: 'tuo',   name: '拖延兽',   atk: 6, moodCost: 2, desc: '把你的「明天再说」具象化。' },
  { id: 'ghost', name: '冒名顶替幽灵', atk: 5, moodCost: 3, desc: '它一直在你耳边说：你只是运气好。' },
  { id: 'juan',  name: '内卷王',   atk: 7, moodCost: 2, desc: '别人都在跑，你凭什么停。' },
];

// ---------------------------------------------------------------- 文案
export const TEXTS = {
  intro: '张江学园的第七天是期末。每天两节大课是必上的，除此之外你还有三个行动点，' +
    '可以进楼上课、找人打球、去操场跑两圈。走进 CDS-1 或文娱楼，先到电梯厅，再选楼层' +
    '——楼层之间走动不花行动点，只有真的做一件事才花。晚上只能选一件事：继续深造，' +
    '或者去打一只占位怪物。你记下的每一行笔记，都会变成晚上能打出去的牌。',
  introRules: [
    'WASD / 方向键走路，E 或空格交互，也可以直接点标签。',
    '每天 5 个行动点：2 节必修大课自动结算，剩下 3 点自己分配。',
    '三属性各管一件事：知识 → 夜战伤害；心境 → 白天收益；体质 → 血量上限。',
    '进楼先到电梯厅，电梯面板上标着每层有什么；层间移动 0 行动点。',
    '房间会先弹确认面板：看清代价再点「开始」。点右侧「角色」看自己的属性换算。',
  ],
  nightTitle: '夜晚',
  nightStudy: '宿舍深造',
  nightStudyDesc: '在台灯下继续啃书。稳，但会把自己越拧越紧。',
  nightFight: '出门夜战',
  nightFightDesc: '用白天的笔记打一只占位怪物。赢了大回心情、补一点知识；输了心情大跌。',
  examTitle: '期末考',
  endings: {
    great: { name: '学神与侠客', text: '成绩单上是一行漂亮的数字。牌组里那几张笔记，陪你熬过了六个夜晚。' },
    pass:  { name: '顺利过线', text: '及格线以上，日子照旧。至少你没把自己弄丢。' },
    warn:  { name: '延毕警告', text: '成绩单被退回，辅导员约你谈话。那些没打的仗，最后还是找上门来。' },
  },
  battleIntro: '一个占位怪物从走廊尽头浮出来。',
};
