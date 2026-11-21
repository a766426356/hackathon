# HKU Zhangjiang Campus · Seven Days

A small game about growing by day and choosing by night. 7 days, then the Final Exam settles your GPA.

Zero dependencies, zero build: plain ES Modules + Canvas. All the numbers live in `data.js`; balance changes touch that file only.

## Running

```bash
./serve.sh          # port 8000 by default
# or
python3 -m http.server 8000
```

Open <http://localhost:8000>.

> It has to be served over http — double-clicking `index.html` will not work: ES modules get blocked by CORS on `file://`.

## How to play

- **Daytime**: **3 Action Points** a day. Walk around the campus (WASD / arrow keys), stand in the ring and press `E` or space to interact, or just click a label.
- **Campus map**: `game/assets/campus.jpg`. Only three places work — the **Stadium** (top of the map), the **Wenyu Building = 5#** and **CDS-1**; every other building is scenery.
- **Camera**: zoomed 1.7× and following the player (`CAMPUS.zoom / playerScale / speed` in `data.js` are tunable); only the area around the player is drawn.
- **Entering a building**: walk to the entrance and press `E` → elevator panel (vertical floor plates) → pick a floor → the floor lists its rooms as options → click one to do it.
  Moving between floors costs 0 Action Points; only actually doing something spends them. Afterwards you are back on that floor and can do the next thing.
- **Rooms**: clicking an option opens a confirm panel first (cost + today's effect); nothing is settled until you press "Start".
- **Night**: pick one of two. Study in the Dormitory (Knowledge +, Mood −) or go out and fight (4-round card battle).
- **Day 7**: Final Exam. GPA is settled from Knowledge and Mood, and you land on one of three endings.

Fixed spots on the campus: the **Stadium** (Mood +, grants Focus for a ×1.5 next study session), the **Dormitory** (Dorm 2 entrance: Mood +, ends the day straight away),
the **Notice Board** (a little Knowledge + one friendship), **Lin / Chen / Zhou** (chat: friendship +, Mood +; friendship ≥ 40 unlocks their support card).

### What is inside the buildings

| Building | Floor | Rooms (1 AP each) |
|---|---|---|
| **CDS-1** | Teaching Floor 3F | **Lecture Hall**: Knowledge +7 (× Mood, ×1.5 with Focus) / Mood −4 / produces one note card · **Help Desk**: Knowledge +2 / Mood −1 / friendship +5 with a random friend (once a day) |
| | Lab Floor 5F · Gym Floor B1 | greyed out on the elevator panel (not open yet) |
| **Wenyu Building** | Activity Floor 1F | **Table Tennis Table**: a real game of Pong, a win gives Mood +9 / friendship +6 and a loss still gives a little (once a day) · **Snooker Table**: a real 6-red 6-colour frame, a win gives Mood +8 / friendship +8 (needs that person unchatted today) · **Piano**: real piano samples, free and unlimited; the first full 16 notes each day give Mood +12 |
| | Study Floor 2F | **Study Room**: Knowledge +5 / Mood −2 / **no note card** (the GPA route) |
| | Quiet Floor 3F | **Prayer Room**: Mood +15, only enterable while Mood ≤ 45 (once a day) |

Mood is a global multiplier (`0.5 + 0.01 × Mood`) that applies to both study gain and battle damage; when Mood hits zero you "collapse once" and have only 1 Action Point the next day.

### The three minigames on 1F

- **Piano**: 3 octaves (C3–C6) of real Salamander Grand Piano samples, local in `assets/audio/piano/`, no network needed.
  Click keys with mouse / touch, or play the low register with `Z X C V…` and the mid-high register with `Q W E R…`; hold `space` for sustain.
  You can keep playing; only the first full 16 notes each day cost 1 AP and settle Mood +12, playing on after that settles nothing and nothing kicks you out.
- **Table Tennis**: classic Pong with better looks, first to 7. Drag with mouse / touch, or steer the paddle with `W` `S` (`↑` `↓`);
  the ball gets faster as the rally goes on, and Lin / Chen / Zhou each play at a different strength. Win, draw and loss settle Mood and friendship differently.
- **Snooker**: lightweight 6-red 6-colour snooker with real collisions, friction, cushion bounce and pocket detection. Aim with the mouse,
  hold the left button to build power and release to shoot; `←` `→` fine-tune the angle and `space` charges a shot too. The rules are simplified but complete:
  reds and colours alternate, colours respot, a foul costs 4 points, and at the end you clear the colours in order — once the reds are gone, the score decides.

All three minigames sit inside a modal, rendered with Canvas and with Web Audio synthesising the SFX live — no runtime dependency added.
Cueing out early / closing the lid costs no Action Points; only finishing a game and settling it does.

## Core mechanics

1. **Your notes are your weapons**: each study session produces one named knowledge card; studying the same topic again gives that card power +2 (cap 14). Your night deck is exactly what you studied by day.
2. **Socialising buys combat power**: friendship unlocks support cards that heal HP and restore Mood in battle.
3. **Scarcity is the decision**: 3 Action Points + the Mood multiplier + the bottoming-out penalty force you to choose between "study a bit more" and "go get some air".

## Layout

```
index.html          mount point + sidebar
styles.css          pixel-art UI (system fonts, no external assets)
data.js             CONFIG numbers / map / interactables / cards / enemies / copy
src/state.js        state, derived numbers, save/load (xorshift32, serialisable RNG)
src/rules.js        action settlement / night advance / exam (pure functions)
src/battle.js       night battle logic (draw, play, enemy turn)
src/world.js        campus canvas: map rendering + follow camera, rect collision, movement, proximity interaction
assets/campus.jpg   campus map image (1024×1024, canvas shows it at 768×768)
src/interiors.js    building → floor → room plain data (incl. per-floor background image, locked notes)
src/ui.js           HUD / labels / log / deck / elevator panel / floor options / room and picker panels
src/audio.js        piano sample loading and Web Audio mixing; synthesised SFX for the minigames
src/minigames/piano.js    playable 3-octave piano (mouse / touch / keyboard / sustain)
src/minigames/pong.js     classic Pong + neon table rendering + AI opponent
src/minigames/snooker.js  lightweight 6-red 6-colour snooker: physics, aiming line, rules, AI
assets/audio/piano/       Salamander Grand Piano samples (CC-BY 3.0, see LICENSE.md)
src/main.js         boot, input, building entry flow (elevator → floor → room) and the phase state machine
tests/sim.mjs       runs 700 games headless: invariants + ending distribution + reproducibility
tests/maps.mjs      map health check: size, standing room at interactables, reachable from spawn
serve.sh            local static server
```

Saves go to `localStorage` (key `zjxy.save.v3`) and are restored on reload — including which building, which floor and where you were standing. The title screen offers "Continue". `?seed=123` pins the RNG seed for reproduction.

## Tests

```bash
node tests/sim.mjs     # 700 games (7 strategies × 100 seeds)
node tests/maps.mjs    # campus walkable areas + floor/room data consistency
```

`maps` asserts: the 12 walkable rectangles on the campus form one connected piece, every interactable has a standing spot within 46px; no building has duplicate floor levels, every open floor has rooms, and every room's action resolves to a function in rules.js.
`sim` asserts: Mood/Knowledge/friendship stay in range, the deck never exceeds its cap, the run always terminates, the same seed gives the same result, slacking off cannot score high,
and all three endings show up. Two more are guards added this round — **Wenyu Building only (no cards) cannot touch "Scholar"**
and **the indoor route must not be clearly stronger than plain studying**.

| Strategy | GPA | Notes |
|---|---|---|
| study | 3.03 | Lecture Hall only |
| mixed | 3.33 (2.3 wins) | study + social + night battle every other day |
| social | 2.07 | chat only |
| lazy | 2.09 | slack off all day |
| smart | 4.15 (4 fights, 4 wins) | Stadium first when Mood is low, socialise every other day |
| indoor | 2.98 | Help Desk + Table Tennis + Lecture Hall (no night battles, so no Scholar) |
| chill | 2.84 | Piano + Table Tennis + Study Room (new; proves a "pure Mood route" cannot score high) |

Ending distribution: the original 5 strategies give `great 27% / pass 32% / warn 41%`; adding the two indoor strategies gives `19% / 52% / 29%`
(neither of those two fights, so neither can take the Scholar that needs "GPA ≥ 3.4 and at least 2 wins"). Target bands are `20–35 / 30–40 / 25–40`.

## Not built yet

CDS-1's Lab Floor 5F / Gym Floor B1 (already listed and greyed out on the elevator panel), the big lion photo spot, the campus gate exit / Company Visit,
the calendar and the ddl boss, a proper villain theme (right now they are placeholder monsters: Procrastination Beast / Impostor Ghost / Rat-Race King),
main-loop BGM, mobile polish, ending CG.

The full design for the multi-floor structure and the calendar is one directory up from the repo root, in `design-multi-floor-and-calendar.md`.

If the villain theme needs swapping, just edit `ENEMIES` in `data.js` — the shape is already reserved (`atk` / `moodCost` / `desc`).

## Three-minute demo path

1. **0:00** Set it up in one line: every note you take by day is a card you can throw at night.
2. **0:20** Walk two steps up to the Notice Board and press `E`: Knowledge +4, and you have talked to Lin. Point at "Log" on the right.
3. **0:40** Walk to CDS-1 (on the right) and press `E` to enter → pick **Teaching Floor 3F** on the elevator panel → walk to "Lecture Hall" and press `E` → the panel reads "Knowledge +7 / Mood −4 / note +1" → click "Start". The "Deck" on the right grows.
4. **1:10** Action Points run out and night falls: choose "Study in the Dormitory" and point out Mood dropping from 60 to 52 — the next study session already pays less (the multiplier in the HUD).
5. **1:40** On day 2 hit the **Stadium** (top of the map) for Focus, then go back to the 3F Lecture Hall and compare the payout for the same action (×1.5).
   On the way, drop into the Wenyu Building: all three things on `1F` are playable — real samples on the Piano, Pong as Table Tennis, a full frame of Snooker;
   `2F` Study Room gives Knowledge but no cards, and the `3F` Prayer Room refuses you while Mood is high — three things that say "a floor is not a menu, it is a trade-off".
6. **2:10** On any night pick "Night battle": playing a card is throwing your own notes; losing costs Mood −15 and Knowledge −5, which shows "if you are not prepared, do not force it".
7. **2:40** Click "End the day → Study in the Dormitory" until day 7 to show the GPA settlement and the ending; run through the three ending conditions in one sentence.
8. Close: the villains are placeholders right now (Procrastination Beast / Impostor Ghost / Rat-Race King) and swapping the theme only touches `data.js`; the next version hooks up the calendar, and a ddl becomes that night's boss.

## Open-source references and asset licences

- **Piano samples**: *Salamander Grand Piano* by Alexander Holm, **CC-BY 3.0**.
  This project only takes 13 mp3s (C / D# / F# / A in each octave, C3–C6) into `assets/audio/piano/`,
  and pitches the remaining notes via playbackRate. Full licence and provenance in `assets/audio/piano/LICENSE.md`.
- **Snooker implementation**: no third-party library is pulled in; the physics and rules are this repo's own lightweight version,
  designed after the public ideas in these MIT projects:
  - [henshmi/Classic-Pool-Game](https://github.com/henshmi/Classic-Pool-Game) (MIT)
  - [XingS117/pro-pool](https://github.com/XingS117/pro-pool) (MIT, single-file 8-ball)
  - [mimonelu/billiards-js](https://mimonelu.github.io/billiards-js/) (MIT, lightweight rendering)
  Writing it rather than embedding a library keeps the zero-dependency promise, fits the existing modal / settlement flow, and keeps the code at a maintainable size.
