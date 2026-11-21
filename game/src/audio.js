// audio.js — 一个很小的 Web Audio 层。
// 钢琴用 Salamander Grand Piano 的本地采样（CC-BY 3.0，Alexander Holm），
// 每个八度取 C / D# / F# / A 四个采样，其余音按 playbackRate 变速；
// 采样没加载完时用谐波合成的钢琴音兜底，所以打开就能弹。
// 乒乓 / 台球的音效全部是现场合成，不额外下载资源。

const SAMPLE_ROOT = 'assets/audio/piano/';
const SAMPLE_MIDI = {
  C3: 48, Ds3: 51, Fs3: 54, A3: 57,
  C4: 60, Ds4: 63, Fs4: 66, A4: 69,
  C5: 72, Ds5: 75, Fs5: 78, A5: 81,
  C6: 84,
};

let ctx = null;
let master = null;
let wet = null;
let convolver = null;
const samples = new Map(); // midi → AudioBuffer
let loadPromise = null;
let loadedCount = 0;
let voiceId = 0;
const voices = []; // 正在响的琴音
const sustained = new Set();

function makeContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 22;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  wet = ctx.createGain();
  wet.gain.value = 0.2;
  convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(1.9, 2.8);

  master.connect(comp);
  comp.connect(ctx.destination);
  master.connect(convolver);
  convolver.connect(wet);
  wet.connect(ctx.destination);
  return ctx;
}

// 用噪声 + 指数衰减造一个短混响，够给琴声一点房间感
function makeImpulse(seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function initAudio() {
  const c = makeContext();
  if (!c) return null;
  if (c.state === 'suspended') c.resume();
  return c;
}

export function unlockAudio() {
  const c = initAudio();
  if (!c) return;
  // iOS 需要在用户手势里真正播一个静音节点
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.00001;
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.01);
}

export function pianoLoadProgress() {
  return { loaded: loadedCount, total: Object.keys(SAMPLE_MIDI).length };
}

export function loadPianoSamples() {
  if (loadPromise) return loadPromise;
  const c = initAudio();
  if (!c) return Promise.resolve(false);
  const entries = Object.entries(SAMPLE_MIDI);
  loadPromise = Promise.all(entries.map(async ([name, midi]) => {
    try {
      const res = await fetch(SAMPLE_ROOT + name + '.mp3');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.arrayBuffer();
      const buf = await c.decodeAudioData(raw);
      samples.set(midi, buf);
      loadedCount++;
      return true;
    } catch (err) {
      return false;
    }
  })).then((list) => list.some(Boolean));
  return loadPromise;
}

function nearestSample(midi) {
  let best = null;
  let bestDist = Infinity;
  for (const [m, buf] of samples) {
    const d = Math.abs(m - midi);
    if (d < bestDist) { bestDist = d; best = { midi: m, buf }; }
  }
  return best;
}

// ---------------------------------------------------------------- 钢琴
// midi：48 = C3，60 = C4，72 = C5，84 = C6
export function playPianoNote(midi, velocity = 0.78) {
  const c = initAudio();
  if (!c) return null;
  const t0 = c.currentTime + 0.005;
  const vel = Math.max(0.08, Math.min(1, velocity));
  const out = c.createGain();
  out.gain.value = 0.55 + vel * 0.35;
  out.connect(master);

  const voice = { id: ++voiceId, midi, out, source: null, gain: out, held: true, released: false, synth: null };
  const near = nearestSample(midi);

  if (near) {
    const src = c.createBufferSource();
    src.buffer = near.buf;
    src.playbackRate.value = Math.pow(2, (midi - near.midi) / 12);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(vel, t0 + 0.006);
    env.gain.setTargetAtTime(vel * 0.92, t0 + 0.02, 0.25);
    src.connect(env);
    env.connect(out);
    src.start(t0);
    voice.source = src;
    voice.env = env;
    voice.stopAt = t0 + Math.min(8, near.buf.duration / src.playbackRate.value);
    src.stop(voice.stopAt);
  } else {
    // 采样没到位：加几个谐波的合成音，先能弹
    const base = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vel * 0.5, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    g.connect(out);
    const parts = [[1, 1], [2, 0.34], [3, 0.14], [4, 0.07], [5, 0.035]];
    const oscs = [];
    for (const [mult, amp] of parts) {
      const o = c.createOscillator();
      o.type = mult === 1 ? 'triangle' : 'sine';
      o.frequency.value = base * mult;
      const p = c.createGain();
      p.gain.value = amp;
      o.connect(p);
      p.connect(g);
      o.start(t0);
      o.stop(t0 + 2.3);
      oscs.push(o);
    }
    voice.source = oscs[0];
    voice.synth = oscs;
    voice.env = g;
    voice.stopAt = t0 + 2.3;
  }

  voices.push(voice);
  if (voices.length > 90) {
    const old = voices.shift();
    try { old.source.stop(); } catch (e) { /* 已经停了 */ }
  }
  return voice;
}

function fadeVoice(voice, fast) {
  if (!voice || voice.released) return;
  voice.released = true;
  const c = ctx;
  if (!c) return;
  const t = c.currentTime;
  try {
    voice.env.gain.cancelScheduledValues(t);
    voice.env.gain.setValueAtTime(Math.max(0.0001, voice.env.gain.value), t);
    voice.env.gain.exponentialRampToValueAtTime(0.0001, t + (fast ? 0.08 : 0.22));
    voice.source.stop(t + (fast ? 0.12 : 0.3));
  } catch (e) { /* 节点已结束 */ }
}

export function releasePianoNote(midi) {
  for (const v of voices) {
    if (v.midi !== midi || v.released) continue;
    v.held = false;
    if (sustainOn) sustained.add(v);
    else fadeVoice(v, false);
  }
}

let sustainOn = false;
export function setPianoSustain(on) {
  sustainOn = !!on;
  if (!sustainOn) {
    for (const v of sustained) fadeVoice(v, true);
    sustained.clear();
  }
  return sustainOn;
}

export function isPianoSustain() { return sustainOn; }

export function stopAllPiano() {
  sustainOn = false;
  sustained.clear();
  for (const v of voices) fadeVoice(v, true);
  voices.length = 0;
}

export function pianoSamplesReady() {
  return samples.size > 0;
}

// ---------------------------------------------------------------- 音效
function sfxOsc(type, freq, dur, gain, slideTo) {
  const c = initAudio();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master || c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sfx(kind, value) {
  switch (kind) {
    case 'paddle':
      sfxOsc('square', 420 + (value || 0) * 180, 0.07, 0.12, 720);
      break;
    case 'wall':
      sfxOsc('triangle', 240, 0.05, 0.09, 180);
      break;
    case 'score':
      sfxOsc('sawtooth', 280, 0.16, 0.08, 120);
      setTimeout(() => sfxOsc('sine', 420, 0.22, 0.07, 620), 80);
      break;
    case 'cue':
      sfxOsc('triangle', 160, 0.09, 0.14, 90);
      break;
    case 'clack':
      sfxOsc('square', 560 + Math.random() * 90, 0.035, 0.07, 300);
      break;
    case 'cushion':
      sfxOsc('sine', 130, 0.06, 0.08, 90);
      break;
    case 'pot':
      sfxOsc('sine', 520, 0.12, 0.09, 780);
      setTimeout(() => sfxOsc('sine', 780, 0.18, 0.07, 1040), 70);
      break;
    case 'foul':
      sfxOsc('sawtooth', 190, 0.24, 0.09, 110);
      break;
    // 夜战：命中一下，挨打再补一声闷响
    case 'hit':
      sfxOsc('square', 240, 0.11, 0.15, 70);
      sfxOsc('triangle', 120, 0.16, 0.10, 60);
      if (value) sfxOsc('sawtooth', 90, 0.24, 0.13, 40);
      break;
    case 'hurt':
      sfxOsc('sawtooth', 100, 0.3, 0.14, 42);
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => sfxOsc('triangle', f, 0.28, 0.09, f), i * 110));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => setTimeout(() => sfxOsc('triangle', f, 0.3, 0.09, f * 0.92), i * 140));
      break;
    default:
      sfxOsc('sine', 600, 0.05, 0.06);
  }
}
