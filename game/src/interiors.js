// interiors.js — 楼 → 楼层 → 房间的纯数据。室内不再走地图，房间就是一层里的几个选项。
//
// 层级：校园（按 E 进楼）→ 电梯面板（竖排楼层牌）→ 这一层的房间选项 → 确认面板 → 结算。

import { CONFIG } from '../data.js';

const R = CONFIG.room;
const sgn = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));

// 房间 = 一个选项。action 对应 rules.js 里的函数；pick 表示要先选一位朋友。
const ROOMS = {
  course: {
    id: 'course', name: '大课教室', icon: '🎓', action: 'course', ap: 1,
    tagline: '上一节课，换一张笔记卡',
    desc: '阶梯教室空着。前排有人占座，后排有人睡觉，黑板上还留着上一节的板书。',
    effect: '知识 +' + CONFIG.studyGain + '（心情越高越接近上限，专注 ×' + CONFIG.studyFocusMult + '），心情 −' + CONFIG.studyMoodCost + '，笔记 +1 张',
  },
  doubt: {
    id: 'doubt', name: '答疑角', icon: '📎', action: 'doubt', ap: 1,
    tagline: '问两道题，顺手认识一个人',
    desc: '助教坐在沙发边上，桌上摊着一沓没改完的作业。',
    effect: '知识 +' + R.doubt.know + '，心情 ' + sgn(R.doubt.mood) + '，和随机一位朋友的友谊 +' + R.doubt.friend + '（每天 1 次）',
  },
  pingpong: {
    id: 'pingpong', name: '乒乓球台', icon: '🏓', action: 'pingpong', ap: 1, pick: 'pingpong',
    bg: 'assets/bg/wenyu-pingpong.jpg',
    tagline: '和 classic Pong 一样，先到 7 分',
    desc: '台子空着，边上扔着两副拍子和一筒球。想打就得找人。',
    effect: '和一位朋友打一局：赢心情 +' + R.pingpong.mood + ' / 友谊 +' + R.pingpong.friend + '，输了也有少量（每天 1 次）',
  },
  snooker: {
    id: 'snooker', name: '斯诺克台', icon: '🎱', action: 'snooker', ap: 1, pick: 'snooker',
    bg: 'assets/bg/wenyu-snooker.jpg',
    tagline: '6 红 6 彩，一局定胜负',
    desc: '绿呢台面，灯压得很低。这地方适合边打球边说点平时不说的话。',
    effect: '和一位朋友打一局：赢心情 +' + R.snooker.mood + ' / 友谊 +' + R.snooker.friend + '，输了也有少量（TA 今天还没和你聊过才行）',
  },
  piano: {
    id: 'piano', name: '钢琴', icon: '🎹', action: 'piano', ap: 1,
    bg: 'assets/bg/wenyu-piano.jpg', freeEntry: true,
    tagline: '三个八度 · 无限弹',
    desc: '一架立式钢琴，琴盖是开的。没人管，你可以弹。',
    effect: '免费、随便弹；每天第一次弹满 ' + R.piano.notes + ' 个音：心情 +' + R.piano.mood + '（之后不再结算）',
  },
  studyroom: {
    id: 'studyroom', name: '自习室', icon: '📖', action: 'studyroom', ap: 1,
    bg: 'assets/bg/wenyu-study.jpg',
    tagline: '安静记一点，但写不成卡',
    desc: '长桌一路排到窗边，安静得能听见空调。',
    effect: '知识 +' + R.studyroom.know + '，心情 ' + sgn(R.studyroom.mood) + '，不产出笔记卡',
  },
  pray: {
    id: 'pray', name: '祷告室', icon: '🕯️', action: 'pray', ap: 1,
    bg: 'assets/bg/wenyu-pray.jpg',
    tagline: '心情低的时候进来坐坐',
    desc: '一排长椅，窗上有彩色的玻璃。没有神像，只有安静。',
    effect: '心情 +' + R.pray.mood + '，但只有心情 ≤ ' + R.pray.moodMax + ' 时才进得去（每天 1 次）',
  },

  // ---- 寝室：不花行动点的三件事 + 一张床 ----
  desk: {
    id: 'desk', name: '书桌', icon: '🪑', action: 'char', ap: 0,
    tagline: '看属性换算，不花时间',
    desc: '台灯、摊开的笔记本、一张写满又划掉的计划。',
    effect: '角色面板：三个属性各自换算成多少伤害 / 多少血，战利品加成也在里面',
  },
  wall: {
    id: 'wall', name: '日历墙', icon: '📅', action: 'calendar', ap: 0,
    tagline: '学期还剩几天',
    desc: '墙上钉着一张手写的学期表，某几天被人圈了出来。',
    effect: '7 天时间轴：今天有什么活动、第 7 天期末考',
  },
  roomie: {
    id: 'roomie', name: '室友 哲', icon: '🧑', action: 'roomie', ap: 0,
    tagline: '问一句今天该干什么',
    desc: '他基本一直在，戴着耳机，桌上堆着别人的书。',
    effect: '每天一句判断：今天有活动会直接报给你，其余时候按你的状态说话（不产数值）',
  },
  bed: {
    id: 'bed', name: '床', icon: '🛏️', action: 'bed', ap: 1,
    tagline: '躺下，今天到此为止',
    desc: '被子没叠。窗外的光刚好落在枕头边上。',
    effect: '心情 +' + (R.bed ? R.bed.mood : 12) + '，立刻结束白天进入夜晚',
  },
};

// 楼 → 楼层（level 越大越高，可正可负）→ 这一层有哪些房间
export const BUILDING_FLOORS = {
  cds1: {
    id: 'cds1',
    name: 'CDS-1',
    full: 'CDS-1 主教学楼',
    bg: 'assets/bg/cds1-lobby.jpg', // 打开电梯面板时就铺这张大堂图
    floors: [
      {
        level: 5, label: '5F', name: 'lab 层', locked: true,
        rooms: [], note: '要先在 3F 注册实验课',
        bg: 'assets/elevator-test/cds1-f5.jpg',
      },
      {
        level: 3, label: '3F', name: '教学楼层',
        rooms: [ROOMS.course, ROOMS.doubt],
        bg: 'assets/elevator-test/cds1-f3.jpg',
      },
      {
        level: -1, label: 'B1', name: 'gym 层', locked: true,
        rooms: [], note: '还在装修',
        bg: 'assets/elevator-test/cds1-b1.jpg',
      },
    ],
  },
  wenyu: {
    id: 'wenyu',
    name: '文娱楼',
    full: '文娱楼',
    floors: [
      {
        level: 3, label: '3F', name: '静室层',
        rooms: [ROOMS.pray],
        bg: 'assets/elevator-test/wenyu-f3.jpg',
      },
      {
        level: 2, label: '2F', name: '自习层',
        rooms: [ROOMS.studyroom],
        bg: 'assets/bg/wenyu-study.jpg',
      },
      {
        level: 1, label: '1F', name: '活动层',
        rooms: [ROOMS.pingpong, ROOMS.snooker, ROOMS.piano],
        bg: 'assets/elevator-test/wenyu-f1.jpg',
      },
    ],
  },

  // 寝室：单层楼，进门就是一间屋子。三件不花时间的事 + 一张床。
  dorm: {
    id: 'dorm',
    name: '宿舍',
    full: '2# 宿舍',
    floors: [
      {
        level: 1, label: '1F', name: '寝室',
        rooms: [ROOMS.desk, ROOMS.wall, ROOMS.roomie, ROOMS.bed],
      },
    ],
  },
};

export function buildingOf(id) {
  return BUILDING_FLOORS[id] || null;
}

// 一层有哪些东西，写在楼层牌右边
export function roomsText(floor) {
  if (floor.locked) return floor.note || '未开放';
  return floor.rooms.map((r) => r.name).join(' · ');
}

export function floorByLevel(building, level) {
  return building.floors.find((f) => f.level === level) || null;
}
