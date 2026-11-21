// interiors.js — building → floor → room, pure data. Interiors are no longer a map; a room is just an option on a floor.
//
// Flow: campus (press E to enter) → elevator panel (floor plates stacked) → this floor's rooms → confirm panel → settle.

import { CONFIG } from '../data.js';

const R = CONFIG.room;
const sgn = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));

// A room = one option. action maps to a function in rules.js; pick means choose a friend first.
const ROOMS = {
  course: {
    id: 'course', name: 'Lecture Hall', icon: '🎓', action: 'course', ap: 1,
    tagline: 'Sit through a class, get one note card',
    desc: 'The lecture hall is empty. Someone saved a front-row seat, someone\'s asleep in the back, last period\'s notes still on the board.',
    effect: 'Knowledge +' + CONFIG.studyGain + ' (higher mood gets closer to the cap, Focus ×' + CONFIG.studyFocusMult + '), Mood −' + CONFIG.studyMoodCost + ', note +1',
  },
  doubt: {
    id: 'doubt', name: 'Help Desk', icon: '📎', action: 'doubt', ap: 1,
    tagline: 'Ask two questions, meet someone by the way',
    desc: 'The TA sits by the sofa, unmarked homework spread across the table.',
    effect: 'Knowledge +' + R.doubt.know + ', Mood ' + sgn(R.doubt.mood) + ', friendship +' + R.doubt.friend + ' with a random friend (daily)',
  },
  pingpong: {
    id: 'pingpong', name: 'Table Tennis', icon: '🏓', action: 'pingpong', ap: 1, pick: 'pingpong',
    bg: 'assets/bg/wenyu-pingpong.jpg',
    tagline: 'Like classic Pong — first to 7',
    desc: 'Table\'s free. Two paddles, a tube of balls dumped beside it. Find a partner.',
    effect: 'A game with a friend: win, Mood +' + R.pingpong.mood + ' / friendship +' + R.pingpong.friend + '; a little on a loss (daily)',
  },
  snooker: {
    id: 'snooker', name: 'Snooker Table', icon: '🎱', action: 'snooker', ap: 1, pick: 'snooker',
    bg: 'assets/bg/wenyu-snooker.jpg',
    tagline: '6 reds, 6 colours, one frame decides it',
    desc: 'Green baize, lamp hung low. Good for saying what you normally do not.',
    effect: 'A game with a friend: win, Mood +' + R.snooker.mood + ' / friendship +' + R.snooker.friend + '; a little on a loss (only if they have not chatted today)',
  },
  piano: {
    id: 'piano', name: 'Piano', icon: '🎹', action: 'piano', ap: 1,
    bg: 'assets/bg/wenyu-piano.jpg', freeEntry: true,
    tagline: 'Three octaves · play forever',
    desc: 'An upright piano, lid open. Nobody minds, so play.',
    effect: 'Free, play as you like; first time each day hitting ' + R.piano.notes + ' notes: Mood +' + R.piano.mood + ' (no payout after)',
  },
  studyroom: {
    id: 'studyroom', name: 'Study Room', icon: '📖', action: 'studyroom', ap: 1,
    bg: 'assets/bg/wenyu-study.jpg',
    tagline: 'Quiet notes, but they do not become cards',
    desc: 'Long tables run to the window. Quiet enough to hear the air con.',
    effect: 'Knowledge +' + R.studyroom.know + ', Mood ' + sgn(R.studyroom.mood) + ', no note card',
  },
  pray: {
    id: 'pray', name: 'Prayer Room', icon: '🕯️', action: 'pray', ap: 1,
    bg: 'assets/bg/wenyu-pray.jpg',
    tagline: 'Sit here when mood is low',
    desc: 'Rows of benches, coloured glass in the window. No idol, just quiet.',
    effect: 'Mood +' + R.pray.mood + ', but you only get in when mood ≤ ' + R.pray.moodMax + ' (daily)',
  },

  // ---- your room: three things that cost no AP + one bed ----
  desk: {
    id: 'desk', name: 'Desk', icon: '🪑', action: 'char', ap: 0,
    tagline: 'Check the stat math, costs no time',
    desc: 'Desk lamp, open notebook, a plan written and crossed out.',
    effect: 'Character panel: what each stat turns into in damage / HP, loot bonuses included',
  },
  wall: {
    id: 'wall', name: 'Calendar Wall', icon: '📅', action: 'calendar', ap: 0,
    tagline: 'How many days left this term',
    desc: 'A hand-written term schedule on the wall, a few days circled.',
    effect: '7-day timeline: what is on today, Final Exam on day 7',
  },
  roomie: {
    id: 'roomie', name: 'Your roommate, Zhe', icon: '🧑', action: 'roomie', ap: 0,
    tagline: 'Ask what you should do today',
    desc: 'Usually there, headphones on, other people\'s books piled on the desk.',
    effect: 'One line a day: he calls out today\'s event, otherwise reads your state (no numbers)',
  },
  bed: {
    id: 'bed', name: 'Bed', icon: '🛏️', action: 'bed', ap: 1,
    tagline: 'Lie down, call it a day',
    desc: 'Quilt unfolded. Light from the window lands right on the pillow.',
    effect: 'Mood +' + (R.bed ? R.bed.mood : 12) + ', ends the day and goes straight to night',
  },

  // ---- B1 Gym Floor: reaction minigame ----
  gym: {
    id: 'gym', name: 'Gym', icon: '🏋️', action: 'gym', ap: 1,
    bg: 'assets/elevator-test/cds1-b1.jpg',
    tagline: 'Press when the light hits, do not hesitate',
    desc: 'Plates racked up, mirror slightly fogged. Nobody is watching.',
    effect: 'Keep the rhythm for ' + R.gym.need + ' reps: Mood +' + R.gym.mood + ', Physique +' + R.gym.physique +
      ' (too many misses leaves only ' + R.gym.loseMood + ' / ' + R.gym.losePhysique + ', daily)',
  },
};

// building → floor (larger level is higher, may be negative) → which rooms sit on that floor
export const BUILDING_FLOORS = {
  cds1: {
    id: 'cds1',
    name: 'CDS-1',
    full: 'CDS-1 Main Teaching Building',
    bg: 'assets/bg/cds1-lobby.jpg', // this lobby image shows when the elevator panel opens
    floors: [
      {
        level: 5, label: '5F', name: 'Lab Floor', locked: true,
        rooms: [], note: 'Register for the lab on 3F first',
        bg: 'assets/elevator-test/cds1-f5.jpg',
      },
      {
        level: 3, label: '3F', name: 'Teaching Floor',
        rooms: [ROOMS.course, ROOMS.doubt],
        bg: 'assets/elevator-test/cds1-f3.jpg',
      },
      {
        level: -1, label: 'B1', name: 'Gym Floor',
        rooms: [ROOMS.gym],
        bg: 'assets/elevator-test/cds1-b1.jpg',
      },
    ],
  },
  wenyu: {
    id: 'wenyu',
    name: 'Wenyu Building',
    full: 'Wenyu Building',
    floors: [
      {
        level: 3, label: '3F', name: 'Quiet Floor',
        rooms: [ROOMS.pray],
        bg: 'assets/elevator-test/wenyu-f3.jpg',
      },
      {
        level: 2, label: '2F', name: 'Study Floor',
        rooms: [ROOMS.studyroom],
        bg: 'assets/bg/wenyu-study.jpg',
      },
      {
        level: 1, label: '1F', name: 'Activity Floor',
        rooms: [ROOMS.pingpong, ROOMS.snooker, ROOMS.piano],
        bg: 'assets/elevator-test/wenyu-f1.jpg',
      },
    ],
  },

  // Dormitory: one floor, the door opens into your room. Three things that cost no time + one bed.
  dorm: {
    id: 'dorm',
    name: 'Dormitory',
    full: 'Dorm 2',
    floors: [
      {
        level: 1, label: '1F', name: 'Your room',
        rooms: [ROOMS.desk, ROOMS.wall, ROOMS.roomie, ROOMS.bed],
      },
    ],
  },
};

export function buildingOf(id) {
  return BUILDING_FLOORS[id] || null;
}

// what is on the floor, printed to the right of the floor plate
export function roomsText(floor) {
  if (floor.locked) return floor.note || 'Not open';
  return floor.rooms.map((r) => r.name).join(' · ');
}

export function floorByLevel(building, level) {
  return building.floors.find((f) => f.level === level) || null;
}
