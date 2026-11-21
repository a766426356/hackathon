// calendar.js — the calendar: entries, today's starting point, miss checks. Pure data, no DOM, no rule settlement.
// Settlement happens in rules.doEvent; this file only answers "what is on today" and "can this one be attended".

import { EVENTS, EVENT_PLACES } from '../data.js';

// copy the template at game start; after that done / missed live on state.calendar
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

// the entry for today that is neither done nor missed (at most one per day)
export function activeEntry(s) {
  return (s.calendar || []).find((e) => e.day === s.day && !e.done && !e.missed) || null;
}

export function placeOf(entry) {
  return entry ? EVENT_PLACES[entry.place] || null : null;
}

// the extra dot that appears on campus for the day: walk there and press E to set off
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
    hint: 'On the calendar today: ' + e.title + ' (' + p.name + ')',
    labelBelow: true,
    entry: e,
  }];
}

// when the day turns, cross out whatever went undone; return the crossed-out entries (rules logs them)
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

// the "Knowledge +6 · Mood +6" line on the panel
export function effectLine(entry) {
  const bits = [];
  if (entry.know) bits.push('Knowledge +' + entry.know);
  if (entry.mood) bits.push('Mood ' + (entry.mood > 0 ? '+' + entry.mood : '−' + Math.abs(entry.mood)));
  if (entry.physique) bits.push('Physique +' + entry.physique);
  return bits.join(' · ') || 'no real gain';
}
