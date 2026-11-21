// data.js — 全部数值 / 地图 / 文案。改平衡性只需要动这个文件。

export const CONFIG = {
  schoolName: '张江学园',
  maxDay: 7, // 第 7 天考试
  startAp: 3,
  startMood: 60,
  moodMin: 0,
  moodMax: 100,

  studyGain: 7,
  studyMoodCost: 4,
  studyFocusMult: 1.5,
  deckCap: 8,

  socialGain: 12,
  socialMood: 10,
  friendSupportAt: 40,

  fieldMood: 12,
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
  examKnowledgeDiv: 130,
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
    hpPerKnowledge: 6,
    hpPerMood: 8,
    ddlRound: 3,
    ddlMult: 2,
    fillerPower: 7,
    supportHeal: 8,
  },

  // 房间数值：一处定义，interiors.js 的说明文案和 rules.js 的结算都读这里
  room: {
    doubt:     { know: 2, mood: -1, friend: 5 },
    pingpong:  { mood: 9, friend: 6, loseMood: 3, loseFriend: 2, drawMood: 6, drawFriend: 4 },
    snooker:   { mood: 8, friend: 8, loseMood: 3, loseFriend: 3, drawMood: 5, drawFriend: 5 },
    piano:     { mood: 12, notes: 16 },
    studyroom: { know: 5, mood: -2 },
    pray:      { mood: 15, moodMax: 45 },
  },
};

// ---------------------------------------------------------------- 校园（一张画好的大图）
// 图片是 1024×1024，画布按 768×768 等比显示（S = 768/1024 = 0.75）。
// 碰撞不再是格子，而是一组「可以走的矩形」：道路、广场、走廊、场馆前的台阶。
// 这样只要改这几个矩形就能改可行走范围，不用跟着图重新描一遍地砖。
export const CAMPUS = {
  src: 'assets/campus.jpg',
  w: 1024,
  h: 1024,
  label: '张江学园 · 集电校区',
  zoom: 1.7,        // 镜头放大倍数：越大越贴近人物，越小看得越远
  playerScale: 0.8, // 小人在图上的大小（1 = 原始像素尺寸）
  speed: 240,       // 走动速度（画布像素/秒）
};

export const MAP_W = 768;
export const MAP_H = 768;

// 图片坐标系下的可行走矩形（x, y, w, h）
export const WALKABLE = [
  { id: 'top', x: 0, y: 30, w: 1024, h: 75 },          // 北侧主路
  { id: 'west', x: 0, y: 30, w: 75, h: 520 },          // 集创路
  { id: 'mid', x: 40, y: 405, w: 905, h: 75 },         // 中间那条横路
  { id: 'east', x: 920, y: 285, w: 95, h: 640 },       // 芳春路
  { id: 'bottom', x: 0, y: 845, w: 1024, h: 90 },      // 集电路
  { id: 'curve', x: 0, y: 440, w: 130, h: 440 },       // 西南那条弯道
  { id: 'eaststrip', x: 855, y: 395, w: 90, h: 470 },  // CDS 楼东侧的铺装
  { id: 'corrW', x: 405, y: 70, w: 60, h: 465 },       // 6# 西侧走廊
  { id: 'corrE', x: 575, y: 70, w: 50, h: 465 },       // 6# 东侧走廊（体育场边）
  { id: 'plaza', x: 410, y: 505, w: 225, h: 365 },     // 中央圆形广场
  { id: 'cdsgap', x: 555, y: 650, w: 325, h: 55 },     // CDS-1 / CDS-2 之间
  { id: 'courtApron', x: 85, y: 70, w: 330, h: 75 },   // 球场前的步道
];


export const SPAWN = { x: 520, y: 520 };

// ---------------------------------------------------------------- 交互点
// 坐标同样是图片坐标；只做三处「能进去/能用」：体育场、文娱楼（5#）、CDS-1。
export const INTERACTABLES = [
  { id: 'field', name: '体育场', icon: '🏃', kind: 'field', x: 612, y: 250, hint: '跑两圈：心情 +，获得「专注」' },
  { id: 'wenyu', name: '文娱楼', icon: '🎱', kind: 'enter', building: 'wenyu', x: 745, y: 405, labelBelow: true, hint: '5#：乒乓球 / 斯诺克 / 钢琴 / 自习室 / 祷告室' },
  { id: 'cds1', name: 'CDS-1', icon: '🏫', kind: 'enter', building: 'cds1', x: 745, y: 668, labelBelow: true, hint: '教学楼层 3F：大课教室 / 答疑角' },
  { id: 'board', name: '公告板', icon: '📋', kind: 'board', x: 520, y: 640, hint: '当日日程：小量知识 + 一段友谊' },
  { id: 'lin', name: '林', icon: '☕', kind: 'social', npc: 'lin', x: 592, y: 548, hint: '聊天：友谊 +、心情 +' },
  { id: 'chen', name: '陈', icon: '🎭', kind: 'social', npc: 'chen', x: 445, y: 700, hint: '聊天：友谊 +、心情 +' },
  { id: 'zhou', name: '周', icon: '🎧', kind: 'social', npc: 'zhou', x: 505, y: 790, hint: '聊天：友谊 +、心情 +' },
  { id: 'dorm', name: '宿舍', icon: '🛏️', kind: 'rest', x: 300, y: 840, labelBelow: true, hint: '2#：休息，直接结束白天' },
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
  intro: '张江学园的第七天是期末。白天你有三个行动点：进楼上课、找人打球、去操场跑两圈。' +
    '走进 CDS-1 或文娱楼，先到电梯厅，再选楼层——楼层之间走动不花行动点，' +
    '只有真的做一件事才花。晚上只能选一件事：继续深造，或者去打一只占位怪物。' +
    '你记下的每一行笔记，都会变成晚上能打出去的牌。',
  introRules: [
    'WASD / 方向键走路，E 或空格交互，也可以直接点标签。',
    '进楼先到电梯厅，电梯面板上标着每层有什么；层间移动 0 行动点。',
    '房间会先弹确认面板：看清代价再点「开始」。',
    '每天 3 点行动点，用完自动进入夜晚。心情是乘数，同时决定学习收益和战斗伤害。',
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
