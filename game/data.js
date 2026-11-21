// data.js — every number, map and string. Balance changes only touch this file.

export const CONFIG = {
  schoolName: 'HKU Zhangjiang Campus',
  maxDay: 7, // exam on day 7

  // 5 AP a day = 2 required lectures (settled at day start, no free AP) + 3 you control
  requiredCourses: 2,
  freeAp: 3,
  totalAp: 5,

  startMood: 60,
  moodMin: 0,
  moodMax: 100,

  // One job per stat: Knowledge → battle damage; Mood → daytime gain multiplier; Physique → HP
  startPhysique: 6,
  hpPerPhysique: 1.2,
  physiqueCap: 60,

  studyGain: 7,
  studyMoodCost: 4,
  studyFocusMult: 1.5,
  // Required lectures pay a small flat amount (Mood-proof): not a choice, so no mood bonus
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
    enemyHpPerNight: 12,   // night N = enemyHp + (N-1) × this
    enemyAtkPerNight: 1,
    playerBaseHp: 30,
    ddlRound: 3,
    ddlMult: 2,
    fillerPower: 7,
    supportHeal: 8,
  },

  // Loot only scales the exits, never the stats, so it cannot blow past GPA.
  // Each bonus type is capped, so six nights do not roll into absurd numbers.
  lootCap: 0.6,

  // Room values: defined once — interiors.js reads them for copy, rules.js for settlement
  room: {
    doubt:     { know: 2, mood: -1, friend: 5 },
    pingpong:  { mood: 9, friend: 6, loseMood: 3, loseFriend: 2, drawMood: 6, drawFriend: 4 },
    snooker:   { mood: 8, friend: 8, loseMood: 3, loseFriend: 3, drawMood: 5, drawFriend: 5 },
    piano:     { mood: 12, notes: 16 },
    studyroom: { know: 5, mood: -2 },
    pray:      { mood: 15, moodMax: 45 },
    bed:       { mood: 12 },
    roomie:    { any: 0 },
    desk:      { any: 0 },
    wall:      { any: 0 },
    // minigames: win / lose pay differently — see rules.field / rules.gym
    gym:       { mood: 6, physique: 6, loseMood: 2, losePhysique: 2, need: 6 },
  },
};

// ---------------------------------------------------------------- campus (one pre-drawn big image)
// Image is 1024×1024, canvas shows it at 768×768 (S = 768/1024 = 0.75).
// Collision is no longer tiles but a set of walkable rectangles: roads, plazas, corridors, venue steps.
// Edit those rectangles to change where you can walk; no need to re-trace the floor tiles.
export const CAMPUS = {
  src: 'assets/campus-bg.jpg',
  w: 1536,
  h: 1536,
  label: 'HKU Zhangjiang Campus',
  zoom: 1.7,        // camera zoom: larger sits closer to the character, smaller sees farther
  playerScale: 0.8, // character size on the image (1 = raw pixels)
  speed: 240,       // walking speed (canvas px/sec)
};

export const MAP_W = 768;
export const MAP_H = 768;

// Walkable rectangles in image coordinates (x, y, w, h) — 1536x1536 pixel map
export const WALKABLE = [
  { id: 'top', x: 0, y: 40, w: 1536, h: 75 },          // north main road
  { id: 'west', x: 20, y: 100, w: 105, h: 920 },        // Jichuang Road
  { id: 'curve', x: 20, y: 990, w: 250, h: 275 },       // the southwest bend into Jidian Road
  { id: 'bottom', x: 0, y: 1240, w: 1536, h: 105 },     // Jidian Road
  { id: 'east', x: 1425, y: 100, w: 105, h: 1140 },     // Fangchun Road
  { id: 'axis', x: 600, y: 690, w: 305, h: 560 },       // the central paved axis + round plaza
  { id: 'corrW', x: 596, y: 110, w: 55, h: 590 },       // walkway west of the HKU building
  { id: 'corrE', x: 895, y: 110, w: 50, h: 590 },       // walkway east of it, along the pitch
  { id: 'apron7', x: 235, y: 595, w: 320, h: 70 },      // paving in front of 7#
  { id: 'apron5', x: 940, y: 595, w: 365, h: 75 },      // paving in front of 5#, joins the east walkway
  { id: 'courts', x: 140, y: 365, w: 435, h: 55 },      // path below the courts
  { id: 'cdsW', x: 888, y: 690, w: 58, h: 555 },        // paving west of CDS-1 / CDS-2
  { id: 'cdsgap', x: 890, y: 955, w: 520, h: 60 },      // between CDS-1 and CDS-2
  { id: 'xWalkW', x: 105, y: 595, w: 140, h: 90 },      // crossing from Jichuang Road to 7#
  { id: 'xWalkS', x: 575, y: 600, w: 40, h: 110 },      // crossing from the courts down to the axis
];


export const SPAWN = { x: 748, y: 1120 };

// ---------------------------------------------------------------- interactables
// Image coordinates too; only three things are enterable/usable: Stadium, Wenyu Building (5#), CDS-1.
export const INTERACTABLES = [
  {
    id: 'field', name: 'Stadium', icon: '🏃', kind: 'field', x: 917, y: 300,
    bg: 'assets/bg/field.jpg',
    desc: 'Evening field, track all but empty, wind nudging the goal nets.',
    effect: 'Two laps: Mood +' + CONFIG.fieldMood + ', Physique +' + CONFIG.fieldPhysique +
      ' (into max HP), gain Focus (next study ×' + CONFIG.studyFocusMult + ')',
    ap: 1,
    hint: 'Two laps: Mood +, gain Focus',
  },
  { id: 'wenyu', name: 'Wenyu Building', icon: '🎱', kind: 'enter', building: 'wenyu', x: 1130, y: 632, labelBelow: true, hint: '5#: Table Tennis / Snooker / Piano / Study Room / Prayer Room' },
  { id: 'cds1', name: 'CDS-1', icon: '🏫', kind: 'enter', building: 'cds1', x: 1140, y: 985, labelBelow: true, hint: 'Teaching Floor 3F: Lecture Hall / Help Desk' },
  { id: 'board', name: 'Notice Board', icon: '📋', kind: 'board', x: 700, y: 940, hint: "Today's agenda: a little Knowledge + some friendship" },
  { id: 'lin', name: 'Lin', icon: '☕', kind: 'social', npc: 'lin', x: 635, y: 810, hint: 'Chat: friendship +, Mood +' },
  { id: 'chen', name: 'Chen', icon: '🎭', kind: 'social', npc: 'chen', x: 870, y: 1120, hint: 'Chat: friendship +, Mood +' },
  { id: 'zhou', name: 'Zhou', icon: '🎧', kind: 'social', npc: 'zhou', x: 640, y: 1200, hint: 'Chat: friendship +, Mood +' },
  { id: 'dorm', name: 'Dormitory', icon: '🛏️', kind: 'enter', building: 'dorm', x: 620, y: 1080, labelBelow: true, hint: '2#: your room (Bed / Desk / Calendar Wall / roommate)' },
];

// Roommate: always in your room, no friendship bar, just a read on what today needs.
export const ROOMMATE = { id: 'zhe', name: 'Zhe', place: 'your room', color: '#b8a0d9' };

// ---------------------------------------------------------------- calendar events
// Events are not in rooms but at a campus start point: walk there that day and press E.
// Same image coordinates (1536x1536), deliberately far from the fixed interactables.
export const EVENT_PLACES = {
  club:  { x: 300, y: 630, name: 'West Plaza' },
  field: { x: 917, y: 180, name: 'Stadium' },
  wenyu: { x: 1000, y: 632, name: 'Wenyu Building entrance' },
  cds1:  { x: 1150, y: 985, name: 'CDS-1 entrance' },
  gate:  { x: 1475, y: 1150, name: 'Fangchun Road South' },
};

// 5 events over 7 days; day 1 stays empty as a teaching day. Skipping is just a note, no penalty (ddl handles that).
export const EVENTS = [
  {
    id: 'ev.club', day: 2, kind: 'event', title: 'Club Fair', place: 'club', host: 'chen', ap: 1,
    know: 0, mood: 8, physique: 6,
    desc: 'Chen has a table downstairs, poster still hand-drawn. "Just a name," he says. "No need to come."',
  },
  {
    id: 'ev.run', day: 3, kind: 'event', title: 'Night Run Club', place: 'field', host: 'zhou', ap: 1,
    know: 0, mood: 4, physique: 10,
    desc: 'Zhou drags you around the stadium. By lap three he stops talking.',
  },
  {
    id: 'ev.read', day: 4, kind: 'event', title: 'Book Club', place: 'wenyu', host: 'lin', ap: 1,
    know: 6, mood: 6, physique: 0,
    desc: 'Lin brings pour-over and two old books. Three people show up.',
  },
  {
    id: 'ev.team', day: 5, kind: 'event', title: 'Team Training', place: 'field', host: 'chen', ap: 2,
    know: 0, mood: -5, physique: 18,
    desc: 'Chen slaps the training sheet on the table: two hours today, we talk after.',
  },
  {
    id: 'ev.visit', day: 6, kind: 'event', title: 'Company Visit', place: 'gate', host: null, ap: 2,
    know: 10, mood: -6, physique: 0,
    desc: 'You tag along on the list, come back after dark with an armful of handouts nobody wanted.',
  },
];

// ---------------------------------------------------------------- loot
// Only scales the exits: damage hits harder, hp keeps you standing, day pays better.
// en feeds the English personality report at the endings; in-game UI uses name.
export const LOOT = [
  { id: 'loot.tail',  name: "Procrastination Beast's Tail",   en: "Procrastination Beast's Tail", rarity: 'common',    kind: 'damage', value: 0.08,
    desc: 'You tear it off and it is still saying "tomorrow".' },
  { id: 'loot.shoe',  name: 'Worn-Out Running Shoes',       en: 'Worn-Out Running Shoes', rarity: 'common',    kind: 'hp',     value: 0.10,
    desc: 'Soles worn flat, but they still fit.' },
  { id: 'loot.lamp',  name: 'Dorm Desk Lamp',       en: 'Dorm Desk Lamp', rarity: 'common',    kind: 'day',    value: 0.08,
    desc: 'The shade sits crooked; the light lands right on the page.' },

  { id: 'loot.page',  name: 'The Torn-Out First Page',   en: 'The Torn-Out First Page', rarity: 'rare',      kind: 'damage', value: 0.18,
    desc: 'That page said "forget it". You tore it out.' },
  { id: 'loot.mask',  name: "Impostor's Mask",     en: "Impostor's Mask", rarity: 'rare',      kind: 'hp',     value: 0.20,
    desc: 'Wear it and the voice gets a little quieter.' },
  { id: 'loot.plan',  name: "Grind King's Timetable", en: "Grind King's Timetable", rarity: 'rare',      kind: 'day',    value: 0.15,
    desc: "Someone else's timetable. You copied half, then tore it up." },

  { id: 'loot.hunt',  name: "Hunter's Instinct",     en: "Hunter's Instinct", rarity: 'legendary', kind: 'damage', value: 0.25,
    desc: 'You start hearing them breathe before they swing.' },
  { id: 'loot.jersey', name: 'Varsity Jersey',      en: 'Varsity Jersey', rarity: 'legendary', kind: 'hp',     value: 0.25,
    desc: 'A number nobody else wanted. It fits you.' },
  { id: 'loot.clock', name: "Someone Else's Alarm",     en: "Someone Else's Alarm", rarity: 'legendary', kind: 'day',    value: 0.20,
    desc: 'It rings an hour before yours, so you get up too.' },
];

export const LOOT_WEIGHT = { common: 60, rare: 30, legendary: 10 };
export const LOOT_KIND = { damage: 'Night damage', hp: 'Max HP', day: 'Daytime gain' };

// ---------------------------------------------------------------- NPC / cards / enemies
export const NPCS = {
  lin:  { id: 'lin',  name: 'Lin', en: 'Lin', place: 'Wenyu Building', color: '#d98b8b', taunt: '"Loser buys bubble tea."', lines: [
    'Coming to Book Club this week? I brought pour-over.',
    "Don't make GPA your whole life… not that I can help it.",
    "If you're worn out, come sit. My treat.",
  ] },
  chen: { id: 'chen', name: 'Chen', en: 'Chen', place: 'Club Building', color: '#7fa8d9', taunt: '"I was varsity in high school."', lines: [
    'Club Fair is one person short. You.',
    'Rehearsal runs to ten. Not like we sleep anyway.',
    'That idea of yours last time. It was actually good.',
  ] },
  zhou: { id: 'zhou', name: 'Zhou', en: 'Zhou', place: 'Club Building', color: '#9ad98b', taunt: '"Let me warm up first."', lines: [
    'The seats on CDS-1 3F go dead quiet at night.',
    'I put the key points on cards. Want them?',
    'Late nights show on your face.',
  ] },
};

// en feeds the English personality report at the endings (in-game UI uses name)
export const TOPICS = [
  { id: 'linalg', name: 'Linear Algebra · Eigenvalues', en: 'Linear Algebra · Eigenvalues', power: 9 },
  { id: 'bayes',  name: 'Probability · Bayes',   en: 'Probability · Bayes', power: 10 },
  { id: 'rbtree', name: 'Data Structures · Red-Black Trees', en: 'Data Structures · Red-Black Trees', power: 11 },
  { id: 'deadlock', name: 'Operating Systems · Deadlock', en: 'Operating Systems · Deadlock', power: 9 },
  { id: 'dfa',    name: 'Compilers · DFA',    en: 'Compilers · DFA', power: 8 },
  { id: 'writing', name: 'Academic Writing · Argument',  en: 'Academic Writing · Argument', power: 10 },
];

export const ENEMIES = [
  { id: 'tuo',   name: 'Procrastination Beast',   atk: 6, moodCost: 2, desc: 'Your "tomorrow" given a body.' },
  { id: 'ghost', name: 'Impostor Ghost', atk: 5, moodCost: 3, desc: 'It keeps whispering that you just got lucky.' },
  { id: 'juan',  name: 'Rat-Race King',   atk: 7, moodCost: 2, desc: 'Everyone else is running. Why do you get to stop.' },
];

// ---------------------------------------------------------------- copy
export const TEXTS = {
  intro: 'By day you get three free Action Points: sit in a lecture, talk to someone, run laps on the track. ' +
    'Step into CDS-1 or the Wenyu Building and you land in the elevator lobby, then pick a floor — moving between floors costs nothing, ' +
    'only doing something does. At night you pick one thing: keep the lamp on and study, or go out and fight. ' +
    'Every note you write becomes a card you can play at night.',
  introRules: [
    'WASD / arrows to walk, E or Space to interact, or just click a label.',
    'A building drops you in the elevator lobby; the panel lists every floor. Floor to floor: 0 AP.',
    'Rooms show a confirm panel first: read the cost, then press Start.',
    '3 AP a day; when it runs out, night falls. Mood is a multiplier on both study gain and battle damage.',
  ],
  nightTitle: 'Night',
  nightStudy: 'Study in your room',
  nightStudyDesc: 'Keep grinding under the desk lamp. Steady, but the screw tightens every turn.',
  nightFight: 'Night Fight',
  nightFightDesc: 'Throw your daytime notes at a placeholder monster. Win: big Mood, some Knowledge. Lose: Mood drops hard.',
  examTitle: 'Final Exam',
  endings: {
    great: { name: 'Scholar and Daredevil', text: 'A clean row of numbers on the transcript. The few notes left in your deck carried you through six nights.' },
    pass:  { name: 'Made the Cut', text: 'Above the line, life goes on. At least you did not lose yourself.' },
    warn:  { name: 'Deferral Warning', text: 'The transcript came back. Your advisor wants a word. The fights you skipped found you anyway.' },
  },
  battleIntro: 'A placeholder monster floats up from the end of the hall.',
};
