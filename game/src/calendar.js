// calendar.js — 日历：条目、当天出发点、错过判定。纯数据，不碰 DOM、不碰规则结算。
// 结算在 rules.doEvent 里做，这里只回答「今天有什么」「这一条能不能去」。

import { EVENTS, EVENT_PLACES } from '../data.js';

// 开局从模板复制一份；之后 done / missed 都写在 state.calendar 上
export function freshCalendar() {
  return EVENTS.map((e) => ({
    id: e.id,
    day: e.day,
    kind: e.kind,
    title: e.title,
    place: e.place,
    host: e.host || null,
    ap: e.ap,
    know: e.know || 0,
    mood: e.mood || 0,
    physique: e.physique || 0,
    desc: e.desc || '',
    done: false,
    missed: false,
  }));
}

export function entriesOf(s, day) {
  return (s.calendar || []).filter((e) => e.day === day);
}

// 今天还没做、也还没错过的那一条（一天最多一场）
export function activeEntry(s) {
  return (s.calendar || []).find((e) => e.day === s.day && !e.done && !e.missed) || null;
}

export function placeOf(entry) {
  return entry ? EVENT_PLACES[entry.place] || null : null;
}

// 当天在校园上多出来的那个点：走到这里按 E 才能出发
export function eventSpots(s) {
  const e = activeEntry(s);
  if (!e) return [];
  const p = placeOf(e);
  if (!p) return [];
  return [{
    id: 'event',
    x: p.x,
    y: p.y,
    name: e.title,
    icon: '📌',
    kind: 'event',
    hint: '今天的日程：' + e.title + '（' + p.name + '）',
    labelBelow: true,
    entry: e,
  }];
}

// 翻页时把过去没做的划掉，返回这一批被划掉的条目（交给 rules 记手记）
export function expirePast(s) {
  const gone = [];
  for (const e of s.calendar || []) {
    if (e.day < s.day && !e.done && !e.missed) {
      e.missed = true;
      gone.push(e);
    }
  }
  return gone;
}

// 面板上那一行「知识 +6 · 心境 +6」
export function effectLine(entry) {
  const bits = [];
  if (entry.know) bits.push('知识 +' + entry.know);
  if (entry.mood) bits.push('心境 ' + (entry.mood > 0 ? '+' + entry.mood : '−' + Math.abs(entry.mood)));
  if (entry.physique) bits.push('体质 +' + entry.physique);
  return bits.join(' · ') || '没什么实际收益';
}
