import { useState, useCallback, useRef, useEffect, memo } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════════════════════════════
const AUDIO = (() => {
  let ctx = null,
    master = null,
    verb = null;
  let running = false,
    _musicMuted = false,
    _sfxMuted = false,
    _activeOsc = 0,
    _lastSfx = "",
    _lastSfxTime = 0,
    _suspendId = 0;
  let schedTimer = null,
    nextNote = 0,
    beat = 0;
  const BASE_BPM = 118;
  let _bpm = BASE_BPM,
    _s8 = 60 / _bpm / 2;
  const AHEAD = 0.35,
    LOOK = 45;
  const BASS = [
    110, 0, 0, 0, 0, 0, 98, 0, 110, 0, 0, 82, 0, 0, 73, 0, 110, 0, 0, 0, 65, 0, 82, 0, 98, 0, 0, 0,
    82, 0, 73, 82,
  ];
  const MELS = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [220, 0, 262, 0, 330, 0, 392, 0, 440, 0, 392, 0, 330, 0, 262, 0],
    [330, 0, 294, 0, 262, 0, 220, 0, 196, 0, 220, 0, 262, 0, 294, 0],
    [440, 0, 523, 0, 587, 0, 659, 0, 587, 0, 523, 0, 440, 0, 392, 0],
    [330, 0, 0, 0, 440, 0, 0, 0, 392, 0, 330, 0, 0, 0, 262, 0],
    [0, 0, 196, 0, 0, 0, 220, 0, 0, 0, 196, 0, 220, 0, 0, 0],
    [165, 0, 196, 0, 220, 0, 196, 0, 165, 0, 196, 0, 220, 0, 165, 0],
    [440, 0, 523, 0, 659, 0, 784, 0, 659, 0, 523, 0, 440, 0, 523, 0],
  ];
  const PAD_ROOTS = [110, 110, 98, 131, 110, 82, 98, 110];

  const init = () => {
    if (ctx) return;
    _buildCtx();
  };
  function _buildCtx() {
    try {
      if (ctx) {
        try {
          ctx.close();
        } catch {}
      }
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Longer attack/release smooths out the dynamics so pauses and bursts
      // don't produce audible crackle on Android's audio output.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 12;
      comp.attack.value = 0.008;
      comp.release.value = 0.25;
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 2.4);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      verb = ctx.createConvolver();
      verb.buffer = buf;
      const vg = ctx.createGain();
      vg.gain.value = 0.2;
      verb.connect(vg);
      vg.connect(master);
      running = false;
      _activeOsc = 0;
    } catch {}
  }
  const resume = () => ctx?.state === "suspended" && ctx.resume();

  function playNote(freq, t, dur, type, vol, rv = 0) {
    if (!freq || !ctx || _activeOsc > 20) return;
    _activeOsc++;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.onended = () => {
      _activeOsc--;
    };
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(master);
    if (rv && verb) {
      const rg = ctx.createGain();
      rg.gain.value = rv;
      o.connect(rg);
      rg.connect(verb);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function kick(t) {
    if (!ctx || _activeOsc > 20) return;
    _activeOsc++;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.onended = () => {
      _activeOsc--;
    };
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.linearRampToValueAtTime(38, t + 0.26);
    o.connect(g);
    g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.005);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    o.start(t);
    o.stop(t + 0.35);
  }
  function pad(root, t, dur) {
    if (!ctx || !root || _activeOsc > 30) return;
    [
      [root, 0],
      [root * 1.498, -4],
    ].forEach(([f, dt]) => {
      _activeOsc++;
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.onended = () => {
        _activeOsc--;
      };
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = dt;
      o.connect(g);
      g.connect(master);
      if (verb) {
        const rg = ctx.createGain();
        rg.gain.value = 0.2;
        o.connect(rg);
        rg.connect(verb);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.8);
      g.gain.setValueAtTime(0.025, t + dur - 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }
  function schedule() {
    if (!running || !ctx) return;
    const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 5, 4, 6, 7];
    while (nextNote < ctx.currentTime + AHEAD) {
      const t = nextNote,
        s8 = beat % 256,
        phase16 = Math.floor(s8 / 16),
        phase = ORDER[phase16],
        sip = s8 % 16,
        bSec = phase16 >= 8;
      if (s8 % 8 === 0) kick(t);
      if (BASS[s8 % 32]) playNote(BASS[s8 % 32], t, _s8 * 1.65, "sine", bSec ? 0.3 : 0.26);
      const mel = MELS[phase];
      if (mel[sip]) playNote(mel[sip], t, _s8 * 0.88, "triangle", 0.17, 0.38);
      if ((phase === 3 || phase === 7) && mel[sip] && sip % 4 === 2)
        playNote(mel[sip] * 2, t, _s8 * 0.5, "sine", 0.05, 0.6);
      nextNote += _s8;
      beat++;
    }
    schedTimer = setTimeout(schedule, LOOK);
  }
  return {
    init,
    resume,
    suspendAll() {
      running = false;
      clearTimeout(schedTimer);
      try {
        if (ctx && master) {
          const t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          // Longer fade-out avoids a click when the tab goes to background.
          master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        }
      } catch {}
    },
    resumeAll() {
      _suspendId++;
      try {
        if (ctx) {
          if (ctx.state === "suspended") ctx.resume();
          if (master) master.gain.setValueAtTime(0.32, ctx.currentTime);
        }
      } catch {}
    },
    setTempo(bpm) {
      _bpm = bpm;
      _s8 = 60 / _bpm / 2;
    },
    get musicMuted() {
      return _musicMuted;
    },
    get sfxMuted() {
      return _sfxMuted;
    },
    startMusic() {
      if (running || _musicMuted || !ctx) return;
      running = true;
      beat = 0;
      nextNote = ctx.currentTime + 0.06;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(0.0001, t);
      // Longer fade-in eliminates the thump when music starts.
      master.gain.linearRampToValueAtTime(0.32, t + 0.15);
      schedule();
    },
    stopMusic() {
      running = false;
      clearTimeout(schedTimer);
      beat = 0;
      _suspendId++;
      if (ctx) {
        try {
          ctx.close();
        } catch {}
        ctx = null;
        master = null;
        verb = null;
        _activeOsc = 0;
      }
    },
    // Force start — completely rebuilds audio context and starts fresh from beat 0
    forceStart() {
      if (_musicMuted) return;
      _suspendId++;
      running = false;
      clearTimeout(schedTimer);
      _buildCtx();
      if (ctx) {
        running = true;
        beat = 0;
        nextNote = ctx.currentTime + 0.1;
        schedule();
      }
    },
    // Resume from pause — keeps beat position, unmutes and restarts scheduler.
    resumeFromPause() {
      if (!ctx || _musicMuted) return;
      try {
        if (ctx.state === "suspended") ctx.resume();
      } catch {}
      try {
        if (master) {
          const t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(0.0001, t);
          // Longer fade-in is smoother on Android — short ramps crackle.
          master.gain.linearRampToValueAtTime(0.32, t + 0.12);
        }
      } catch {}
      if (!running) {
        running = true;
        nextNote = ctx.currentTime + 0.1;
        schedule();
      }
    },
    setMusicMuted(v) {
      _musicMuted = v;
      if (v) {
        running = false;
        clearTimeout(schedTimer);
      } else if (ctx && !running) {
        running = true;
        beat = 0;
        nextNote = ctx.currentTime + 0.06;
        schedule();
      }
    },
    setSfxMuted(v) {
      _sfxMuted = v;
    },
    sfx(type, ...args) {
      if (_sfxMuted || !ctx) return;
      if (_activeOsc > 20 && type !== "over") return; // limit polyphony to prevent crackling (but always let game-over play)
      // Debounce — skip if same SFX type fired within 60ms
      const now2 = ctx.currentTime;
      if (_lastSfx === type && now2 - _lastSfxTime < 0.06) return;
      _lastSfx = type;
      _lastSfxTime = now2;
      const t = ctx.currentTime;
      function sn(f, dur, vol, wt, t0 = t, fEnd = null) {
        if (_activeOsc > 24 && type !== "over") return;
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = wt;
        o.frequency.value = f;
        if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur * 0.72);
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.009);
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        _activeOsc++;
        o.onended = () => {
          _activeOsc--;
        };
        o.start(t0);
        o.stop(t0 + dur + 0.04);
      }
      if (type === "select") {
        sn(660, 0.06, 0.1, "sine");
        sn(880, 0.06, 0.07, "sine", t + 0.04);
      }
      if (type === "nomatch") {
        sn(220, 0.18, 0.16, "triangle", t, 130);
      }
      if (type === "match") {
        const b = { r: 330, b: 440, g: 294, y: 392, p: 494 }[args[0]] || 330;
        sn(b, 0.18, 0.18, "sine");
        sn(b * 1.25, 0.14, 0.1, "sine", t + 0.06);
        sn(b * 1.5, 0.22, 0.07, "sine", t + 0.12);
      }
      if (type === "zap") {
        sn(1200, 0.14, 0.2, "sawtooth", t, 400);
        sn(800, 0.1, 0.15, "triangle", t + 0.02, 200);
        sn(600, 0.18, 0.18, "sine", t + 0.04, 150);
        sn(1600, 0.06, 0.08, "sawtooth", t + 0.01, 600);
        sn(300, 0.12, 0.1, "triangle", t + 0.06, 100);
      }
      if (type === "bomb") {
        sn(60, 0.7, 0.5, "sine", t, 15);
        sn(120, 0.5, 0.3, "sine", t + 0.02, 30);
        sn(200, 0.3, 0.2, "triangle", t + 0.05, 50);
        sn(40, 0.8, 0.35, "sine", t + 0.08, 10);
        for (let i = 0; i < 5; i++)
          sn(100 + Math.random() * 200, 0.15, 0.08, "sawtooth", t + 0.1 + i * 0.04);
      }
      if (type === "inferno") {
        for (let i = 0; i < 14; i++) {
          const f = 80 + i * 35;
          sn(f, 1.1, 0.2, "sawtooth", t + i * 0.04, f * 2.2);
        }
        [220, 294, 392, 523, 659, 784, 988].forEach((f, i) =>
          sn(f, 0.9, 0.18, "sine", t + 0.15 + i * 0.05, f * 0.4)
        );
        sn(55, 1.3, 0.55, "sine", t, 20);
        sn(110, 1.0, 0.3, "triangle", t + 0.05, 35);
      }
      if (type === "vortex") {
        [110, 147, 196, 262, 330, 440, 523, 659, 784, 1047].forEach((f, i) =>
          sn(f, 0.55, 0.18, "triangle", t + i * 0.06)
        );
        sn(55, 0.9, 0.35, "sine", t, 20);
      }
      if (type === "cascade") {
        const f = 220 + args[0] * 120;
        sn(f, 0.2, 0.14, "triangle", t, f * 2.3);
      }
      if (type === "fever") {
        [523, 659, 784, 1047, 1319].forEach((f, i) => sn(f, 0.4, 0.2, "sine", t + i * 0.05));
        sn(2093, 0.3, 0.1, "sine", t + 0.28);
      }
      if (type === "milestone") {
        [784, 1047, 1319, 1568].forEach((f, i) => sn(f, 0.3, 0.18, "sine", t + i * 0.08));
      }
      if (type === "bonus") {
        sn(523, 0.1, 0.12, "sine");
        sn(784, 0.12, 0.09, "sine", t + 0.08);
      }
      if (type === "shuffle") {
        for (let i = 0; i < 10; i++) {
          sn(1400 - i * 95, 0.05, 0.09, "triangle", t + i * 0.055);
        }
        sn(600, 0.14, 0.07, "sine", t + 0.55);
      }
      if (type === "pause") {
        sn(440, 0.12, 0.14, "triangle");
      }
      if (type === "wildcard") {
        sn(130, 0.5, 0.3, "sine", t, 65);
        sn(523, 0.35, 0.25, "sine", t + 0.03);
        sn(784, 0.3, 0.22, "sine", t + 0.08);
        sn(1047, 0.25, 0.18, "sine", t + 0.13);
        sn(1568, 0.2, 0.15, "sine", t + 0.18);
        sn(2093, 0.15, 0.1, "sine", t + 0.23);
      }
      if (type === "unchain") {
        sn(1200, 0.15, 0.12, "sine");
        sn(800, 0.1, 0.08, "triangle", t + 0.05);
        sn(1600, 0.08, 0.06, "sine", t + 0.1);
      }
      if (type === "prismSpawn") {
        sn(1568, 0.3, 0.12, "sine");
        sn(2093, 0.25, 0.1, "sine", t + 0.08);
        sn(2637, 0.2, 0.08, "sine", t + 0.16);
      }
      if (type === "doublePrism") {
        // Sharp impact burst
        sn(2000, 0.1, 0.3, "sawtooth", t, 100);
        sn(1500, 0.08, 0.2, "square", t + 0.01, 80);
        // Impact thump
        sn(150, 0.5, 0.35, "sine", t + 0.02, 40);
        // Dramatic rising chord — sustained
        sn(523, 0.7, 0.2, "sine", t + 0.1);
        sn(659, 0.65, 0.18, "sine", t + 0.15);
        sn(784, 0.6, 0.16, "sine", t + 0.2);
        sn(1047, 0.55, 0.14, "sine", t + 0.25);
        // Low rumbling tail
        sn(110, 1.0, 0.12, "sine", t + 0.4);
        sn(220, 0.8, 0.08, "triangle", t + 0.5);
      }
      if (type === "mult2") {
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          sn(f, 0.22, 0.14, "sine", t + i * 0.05, f * 1.5)
        );
        sn(262, 0.3, 0.1, "triangle", t);
      }
      if (type === "mult5") {
        [392, 523, 659, 784, 988, 1175, 1568].forEach((f, i) =>
          sn(f, 0.32, 0.18, "sine", t + i * 0.055, f * 1.8)
        );
        [98, 130].forEach((f) => sn(f, 0.5, 0.22, "sine", t, f * 0.5));
        sn(2093, 0.25, 0.12, "triangle", t + 0.35);
      }
      if (type === "mult10") {
        for (let i = 0; i < 12; i++) {
          const f = 100 + i * 160;
          sn(f, 0.08, 0.15, "sine", t + i * 0.022, f * 2);
        }
        [261, 392, 523, 659, 784, 1047].forEach((f, i) =>
          sn(f, 0.9, 0.22, "sine", t + 0.3 + i * 0.015, f * 1.3)
        );
        [2093, 2637, 3136].forEach((f, i) => sn(f, 0.6, 0.14, "triangle", t + 0.6 + i * 0.08));
        sn(55, 1.2, 0.4, "sine", t + 0.25, 30);
      }
      if (type === "multtick") {
        const f = args[0] === 10 ? 2500 : args[0] === 5 ? 1800 : 1400;
        sn(f, 0.05, 0.08, "sine", t, f * 1.4);
      }
      if (type === "over") {
        sn(110, 1.4, 0.32, "sine", t, 55);
        sn(330, 1.1, 0.14, "triangle", t, 90);
        [262, 329, 196].forEach((f, i) => sn(f, 0.9, 0.13, "sine", t + 0.7 + i * 0.09));
      }
    },
  };
})();

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const ROWS = 8,
  COLS = 7,
  PX = 44,
  GAP = 4;
const COLORS = ["r", "b", "g", "y", "p"];
const SHAPE_OF = { r: "marquise", b: "diamond", g: "triangle", y: "star", p: "hex" };

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE & PROGRESSION
// ═══════════════════════════════════════════════════════════════════════════════
const STORAGE = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  },
};
const BEST_KEY = "prism_best";
const STATS_KEY = "prism_stats";
const TUT_KEY = "prism_tut_seen";
function loadBest() {
  return STORAGE.get(BEST_KEY, 0);
}

// Persist a new best score if this run beat the previous one.
// Returns {isNew, prev} so the game-over screen can highlight a new best.
function saveBest(score) {
  const prev = loadBest();
  if (score > prev) {
    STORAGE.set(BEST_KEY, score);
    return { isNew: true, prev };
  }
  return { isNew: false, prev };
}

function loadStats() {
  return STORAGE.get(STATS_KEY, { games: 0, totalScore: 0, bestStreak: 0 });
}
function bumpStats(finalScore, bestStreak) {
  const s = loadStats();
  s.games += 1;
  s.totalScore += finalScore;
  if (bestStreak > s.bestStreak) s.bestStreak = bestStreak;
  STORAGE.set(STATS_KEY, s);
  return s;
}
// Streak tiers: break point → multiplier
const STREAK_TIERS = [
  { at: 0, mult: 1, label: "" },
  { at: 5, mult: 1.5, label: "×1.5" },
  { at: 10, mult: 2, label: "×2" },
  { at: 15, mult: 3, label: "×3" },
  { at: 20, mult: 5, label: "×5" },
  { at: 30, mult: 10, label: "×10 MEGA" },
];
function streakMult(streak) {
  let m = 1;
  for (const t of STREAK_TIERS) if (streak >= t.at) m = t.mult;
  return m;
}
function streakTier(streak) {
  let tier = STREAK_TIERS[0];
  for (const t of STREAK_TIERS) if (streak >= t.at) tier = t;
  return tier;
}
const PAL = {
  r: { fill: "#ff2255", light: "#ff88aa", dark: "#7a0020", glow: "rgba(255,34,85,0.9)" },
  b: { fill: "#2299ff", light: "#88ccff", dark: "#003a88", glow: "rgba(34,153,255,0.9)" },
  g: { fill: "#22ee88", light: "#88ffcc", dark: "#005528", glow: "rgba(34,238,136,0.9)" },
  y: { fill: "#ffcc22", light: "#ffee99", dark: "#775500", glow: "rgba(255,204,34,0.9)" },
  p: { fill: "#cc44ff", light: "#ee99ff", dark: "#550088", glow: "rgba(200,68,255,0.9)" },
  w: { fill: "#ffffff", light: "#ffffff", dark: "#888888", glow: "rgba(255,255,255,0.9)" },
};
const CLIP = {
  circle: null,
  diamond: "polygon(50% 2%,98% 50%,50% 98%,2% 50%)",
  triangle: "polygon(50% 3%,97% 94%,3% 94%)",
  star: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
  hex: "polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)",
};
// Time ceiling decays from 14 s (move 0) toward 1.5 s as the player keeps
// moving. The exponential decay is what makes the game speed up naturally.
function getMaxMs(moves) {
  return Math.round(1500 + 12500 * Math.exp(-moves / 38));
}

// Time bonus per successful swap — also decays with progress so the later
// game feels like a tighter window than the early game.
function getBonusMs(moves) {
  return Math.round(1000 + 5000 * Math.exp(-moves / 40));
}
const MILESTONE = 25000;
const FEVER_DUR = 10000;

// ═══════════════════════════════════════════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════════════════════════════════════════
let _id = 0;

// Build a single gem. Pass `bonus=true` for fresh gems coming down from the
// top of the board — those have a small chance of rolling into a power-up
// type (multiplier / shuffle / wildcard).
const mkGem = (c, bonus = false) => {
  const g = {
    c: c ?? COLORS[(Math.random() * COLORS.length) | 0],
    type: "normal",
    id: ++_id,
  };
  if (bonus) {
    const r = Math.random();
    if (r < 0.002) g.type = "mult10";
    else if (r < 0.012) g.type = "mult5";
    else if (r < 0.052) g.type = "mult2";
    else if (r < 0.062) g.type = "shuffle";
    else if (r < 0.065) g.c = "w"; // wildcard — rare (~0.3%)
  }
  return g;
};

// Create a fresh board, re-rolling any gem that would start the board in a
// match state (three-in-a-row horizontally or vertically).
function initBoard() {
  const b = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => mkGem()));
  let dirty = true;
  while (dirty) {
    dirty = false;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const g = b[r][c];
        const h3 = c >= 2 && b[r][c - 1].c === g.c && b[r][c - 2].c === g.c;
        const v3 = r >= 2 && b[r - 1][c].c === g.c && b[r - 2][c].c === g.c;
        if (h3 || v3) {
          b[r][c] = mkGem();
          dirty = true;
        }
      }
  }
  return b;
}

const parseKey = (k) => {
  const [r, c] = k.split(",").map(Number);
  return { r, c };
};
// Mutator helpers that add cell keys to an existing clear set `s`. Used by
// expandForSpecials to compose the different special-effect shapes.

// Square of radius `rd` centred on (r,c) — used by bombs.
const addRect = (s, r, c, rd) => {
  for (let dr = -rd; dr <= rd; dr++)
    for (let dc = -rd; dc <= rd; dc++) {
      const nr = r + dr,
        nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) s.add(`${nr},${nc}`);
    }
};

// Full row + full column through (r,c) — used by zaps.
const addCross = (s, r, c) => {
  for (let cc = 0; cc < COLS; cc++) s.add(`${r},${cc}`);
  for (let rr = 0; rr < ROWS; rr++) s.add(`${rr},${c}`);
};

// Every gem of a specific colour — used by wildcards / inferno combos.
const addColor = (s, b, col) => {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (b[r][c]?.c === col) s.add(`${r},${c}`);
    }
};

// The entire board — used by vortex / double-inferno.
const addAll = (s) => {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s.add(`${r},${c}`);
};

// Every other cell in a checkerboard pattern — used by inferno.
const addCheckered = (s, phase = 0) => {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2 === phase) s.add(`${r},${c}`);
    }
};

// Scan the board for runs of 3+ matching gems. Returns the set of keys to
// clear, plus any power-ups to spawn (4-in-a-row → zap, 5 → bomb, 6 →
// inferno, 7+ → vortex). Chained and wildcard gems never start a run —
// wildcards take on their neighbor's color at swap time via attemptSwap.
function findMatches(b) {
  const matched = new Set();
  const toCreate = [];

  // Mark a run of `len` cells as matched, and queue a power-up spawn at the
  // centre of runs that are 4+ long.
  function scanRun(keys, len, color) {
    keys.forEach((k) => matched.add(k));
    const pos = parseKey(keys[Math.floor((len - 1) / 2)]);
    if (len >= 7) toCreate.push({ type: "vortex", ...pos, color });
    else if (len >= 6) toCreate.push({ type: "inferno", ...pos, color });
    else if (len >= 5) toCreate.push({ type: "bomb", ...pos, color });
    else if (len >= 4) toCreate.push({ type: "zap", ...pos, color });
  }

  const canMatch = (r, c) => b[r][c] && !b[r][c].chained && b[r][c].c && b[r][c].c !== "w";

  // Horizontal runs: skip the cell if the one to its left is already part of
  // the same run (we'd have covered it already).
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!canMatch(r, c)) continue;
      if (c > 0 && canMatch(r, c - 1) && b[r][c - 1].c === b[r][c].c) continue;
      const col = b[r][c].c;
      let n = 1;
      while (c + n < COLS && canMatch(r, c + n) && b[r][c + n].c === col) n++;
      if (n >= 3)
        scanRun(
          Array.from({ length: n }, (_, k) => `${r},${c + k}`),
          n,
          col
        );
    }

  // Vertical runs: same trick, but skip when the one above is already part
  // of the run.
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++) {
      if (!canMatch(r, c)) continue;
      if (r > 0 && canMatch(r - 1, c) && b[r - 1][c].c === b[r][c].c) continue;
      const col = b[r][c].c;
      let n = 1;
      while (r + n < ROWS && canMatch(r + n, c) && b[r + n][c].c === col) n++;
      if (n >= 3)
        scanRun(
          Array.from({ length: n }, (_, k) => `${r + k},${c}`),
          n,
          col
        );
    }

  return { matched, toCreate };
}

// Expand the matched set to include every cell that should be cleared by
// the specials in the match. Runs iteratively so that if one special's
// explosion catches another special, that one's effect triggers too.
function expandForSpecials(b, matched) {
  const ex = new Set(matched);
  const processed = new Set();

  let changed = true;
  while (changed) {
    changed = false;

    // Collect every unprocessed special that's currently in the clear set.
    const sp = [];
    for (const k of ex) {
      if (processed.has(k)) continue;
      processed.add(k);
      const { r, c } = parseKey(k);
      if (b[r]?.[c]?.type && b[r][c].type !== "normal") {
        sp.push({ r, c, type: b[r][c].type, color: b[r][c].c });
      }
    }
    if (!sp.length) continue;

    const prevSize = ex.size;
    const has = (t) => sp.some((s) => s.type === t);
    const get = (t) => sp.find((s) => s.type === t);
    const cnt = (t) => sp.filter((s) => s.type === t).length;

    // Exotic combos first — these eat the whole board or cross major areas.
    if (has("vortex")) {
      addAll(ex);
      return ex;
    }
    if (cnt("inferno") >= 2) {
      addAll(ex);
    } else if (has("inferno") && has("bomb")) {
      const bm = get("bomb");
      addColor(ex, b, bm.color);
      addRect(ex, bm.r, bm.c, 3);
    } else if (has("inferno") && has("zap")) {
      const z = get("zap");
      addColor(ex, b, z.color);
      addCross(ex, z.r, z.c);
    } else if (has("inferno")) {
      const inf = get("inferno");
      addCheckered(ex, (inf.r + inf.c) % 2);
    }

    // Regular bomb / zap effects layer on top.
    if (has("bomb")) {
      for (const bm of sp.filter((s) => s.type === "bomb")) addRect(ex, bm.r, bm.c, 2);
    }
    if (has("zap")) {
      for (const z of sp.filter((s) => s.type === "zap")) addCross(ex, z.r, z.c);
    }

    if (ex.size > prevSize) changed = true;
  }
  return ex;
}

// Pick the most impressive label to show for a match. Ordered from the most
// spectacular combo down — the first one that matches wins.
function comboLabel(b, matched) {
  const sp = [];
  for (const k of matched) {
    const { r, c } = parseKey(k);
    if (b[r]?.[c]?.type && b[r][c].type !== "normal") sp.push(b[r][c].type);
  }
  if (!sp.length) return null;

  const has = (t) => sp.includes(t);
  const cnt = (t) => sp.filter((s) => s === t).length;

  if (has("vortex")) return { text: "🌀 VORTEX — BOARD DESTROYED!", type: "vortex" };
  if (cnt("inferno") >= 2) return { text: "🔥 DOUBLE INFERNO — BOARD CLEAR!", type: "inferno" };
  if (has("inferno") && has("bomb")) return { text: "🔥💣 INFERNO BOMB!", type: "inferno" };
  if (has("inferno") && has("zap")) return { text: "🔥⚡ INFERNO ZAP!", type: "inferno" };
  if (has("inferno")) return { text: "🔥 INFERNO!", type: "inferno" };
  if (cnt("bomb") >= 2) return { text: "💣 DOUBLE BOMB!", type: "bomb" };
  if (has("bomb") && has("zap")) return { text: "⚡💣 ZAP BOMB!", type: "bomb" };
  if (cnt("zap") >= 2) return { text: "⚡ DOUBLE ZAP!", type: "zap" };
  if (has("bomb")) return { text: "💣 BOMB!", type: "bomb" };
  if (has("zap")) return { text: "⚡ ZAP!", type: "zap" };
  return null;
}

// How many chained gems are currently on the board?
function countChained(b) {
  let n = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (b[r][c]?.chained) n++;
    }
  return n;
}

// Apply gravity and top-fill. Returns the new board plus metadata the render
// loop needs: `fresh` (cells that were just spawned, so they get the drop-in
// animation) and `drops` (how many rows each surviving gem fell, so existing
// gems slide smoothly into their new homes).
function dropAndFill(b, currentScore = 0) {
  const next = b.map((r) => [...r]);
  const fresh = new Set();
  const drops = {}; // "r,c" → rows dropped
  const chainedCount = countChained(next);

  for (let c = 0; c < COLS; c++) {
    // Compact existing gems downward, recording the drop distance.
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!next[r][c]) continue;
      if (w !== r) drops[`${w},${c}`] = w - r;
      next[w][c] = next[r][c];
      if (w !== r) next[r][c] = null;
      w--;
    }

    // Fill the empty top rows with fresh (possibly bonus) gems.
    for (let r = w; r >= 0; r--) {
      const g = mkGem(null, true);

      // Chained gems start appearing once the player has some score under
      // their belt. Chance, max-on-board, and duration all scale with score.
      // We never chain the top row so there's always somewhere to move into.
      if (currentScore >= 50000 && r > 0 && g.c !== "w") {
        const chainChance = Math.min(0.15, 0.04 + currentScore / 2000000);
        const maxChains = Math.min(10, 6 + Math.floor(currentScore / 200000));
        const chainDur = Math.max(12000, 30000 - (currentScore / 100) * 8);
        if (chainedCount + countChained(next) < maxChains && Math.random() < chainChance) {
          g.chained = chainDur;
        }
      }

      next[r][c] = g;
      fresh.add(`${r},${c}`);
      if (g.c === "w") fresh._hasPrism = true;
    }
  }
  return { board: next, fresh, drops };
}

// Return true if ANY legal swap would create a match. Used to decide "no
// moves left" game-overs. We try every right- and down-swap and run the same
// matcher the real game does. Wildcards are temporarily given a concrete
// colour so the matcher can see the match they'd create.
function hasValidMove(b) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (b[r][c]?.chained) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const nr = r + dr,
          nc = c + dc;
        if (nr >= ROWS || nc >= COLS) continue;
        if (b[nr][nc]?.chained) continue;

        const s = b.map((row) => [...row]);
        [s[r][c], s[nr][nc]] = [s[nr][nc], s[r][c]];

        // Wildcard involved? Adopt the neighbour's colour just for this test.
        const origA = s[r][c],
          origB = s[nr][nc];
        if (s[r][c]?.c === "w" && s[nr][nc]?.c && s[nr][nc].c !== "w") {
          s[r][c] = { ...s[r][c], c: s[nr][nc].c };
        }
        if (s[nr][nc]?.c === "w" && s[r][c]?.c && s[r][c].c !== "w") {
          s[nr][nc] = { ...s[nr][nc], c: s[r][c].c };
        }

        const hasMatch = findMatches(s).matched.size > 0;
        s[r][c] = origA;
        s[nr][nc] = origB;
        if (hasMatch) return true;
      }
    }
  return false;
}

// Score formula for a single cascade pass. Inferno doubles the per-gem
// value on top of its flat bonus. Stacking different specials adds an
// 80% bonus, deeper cascades add +30% per level, and fever mode triples.
function calcScore(cleared, specTypes, level, fever) {
  const infernoCount = specTypes.filter((s) => s === "inferno").length;
  const perGem = infernoCount > 0 ? 30 : 15;

  let pts = cleared * perGem;
  pts += specTypes.filter((s) => s === "zap").length * 200;
  pts += specTypes.filter((s) => s === "bomb").length * 350;
  pts += infernoCount * 1200;
  pts += specTypes.filter((s) => s === "vortex").length * 1500;

  if (specTypes.length >= 2) pts = Math.floor(pts * 1.8);
  if (level > 1) pts += Math.floor(pts * 0.3 * (level - 1));
  if (fever) pts = Math.floor(pts * 3);
  return pts;
}

// Pixel-space centroid of a set of matched keys — used to spawn floaters
// at the visual centre of a match.
function matchCentroid(matched) {
  let sr = 0,
    sc = 0,
    n = 0;
  for (const k of matched) {
    const { r, c } = parseKey(k);
    sr += r;
    sc += c;
    n++;
  }
  const ar = sr / n,
    ac = sc / n;
  return {
    px: 7 + ac * (PX + GAP) + PX / 2,
    py: 7 + ar * (PX + GAP) + PX / 2,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

.pa{min-height:100vh;background:radial-gradient(ellipse 100% 55% at 50% -5%,#200840 0%,#07050e 65%),radial-gradient(ellipse 60% 40% at 20% 40%,rgba(200,68,255,.12),transparent 70%),radial-gradient(ellipse 50% 40% at 80% 60%,rgba(34,153,255,.08),transparent 70%);display:flex;flex-direction:column;align-items:center;padding:14px 10px 28px;gap:8px;font-family:'Inter',sans-serif;color:#b09acc;user-select:none;-webkit-user-select:none;overflow-x:hidden;position:relative;}

/* FEVER vignette */
.pa.fever::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(255,80,0,.3) 100%);pointer-events:none;z-index:500;animation:fvign .5s ease-in-out infinite alternate;}
@keyframes fvign{from{opacity:.6;}to{opacity:1;}}

.pt{font-family:'Orbitron',sans-serif;font-weight:900;font-size:clamp(2rem,8vw,2.8rem);letter-spacing:.4em;padding-left:.4em;background:linear-gradient(120deg,#ff66cc 0%,#aa44ff 35%,#5577ff 65%,#33eebb 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 18px rgba(160,80,255,.75));line-height:1;}
.ps{font-size:.57rem;letter-spacing:.18em;padding-left:.18em;color:#3a2850;text-align:center;margin-top:4px;}

.sb{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.03);border:1px solid rgba(160,80,255,.14);padding:8px 14px;width:100%;max-width:336px;}
.sb-left{display:flex;flex-direction:column;}
.sl{font-size:.54rem;letter-spacing:.14em;color:#442266;}
.sv{font-family:'Orbitron',sans-serif;font-size:1.45rem;font-weight:700;color:#cc88ff;text-shadow:0 0 14px rgba(200,100,255,.6);}
.co{font-family:'Orbitron',sans-serif;font-size:.7rem;font-weight:700;color:#ffcc22;animation:cpulse .35s ease;letter-spacing:.06em;padding-left:.06em;}
@keyframes cpulse{from{transform:scale(1.5);}to{transform:scale(1);}}
.sb-btns{display:flex;gap:5px;}
.icon-btn{background:transparent;border:1px solid rgba(160,80,255,.28);color:#664488;font-size:.85rem;cursor:pointer;padding:5px 9px;border-radius:3px;transition:all .2s;line-height:1;font-family:'Orbitron',sans-serif;}
.icon-btn:hover{border-color:rgba(160,80,255,.65);color:#aa66cc;background:rgba(160,80,255,.09);}

/* FEVER badge */
.fever-badge{font-family:'Orbitron',sans-serif;font-size:.62rem;font-weight:900;letter-spacing:.12em;padding:3px 10px;background:rgba(255,80,0,.2);border:1px solid rgba(255,120,0,.6);color:#ff8844;animation:fbadge .4s ease-in-out infinite alternate;}
@keyframes fbadge{from{box-shadow:0 0 6px rgba(255,80,0,.4);}to{box-shadow:0 0 16px rgba(255,80,0,.9),0 0 30px rgba(255,120,0,.4);}}

/* Timer */
.tw{width:100%;max-width:336px;display:flex;flex-direction:column;gap:3px;}
.trow{display:flex;align-items:center;justify-content:space-between;font-size:.52rem;letter-spacing:.08em;color:#554477;}
.tsec{font-family:'Orbitron',sans-serif;font-size:.6rem;font-weight:700;}
.tsec.ok{color:#8866cc;}.tsec.warn{color:#ffcc22;}.tsec.danger{color:#ff4466;}
.ttrack{width:100%;height:6px;background:rgba(255,255,255,.05);border:1px solid rgba(160,80,255,.12);border-radius:4px;overflow:hidden;}
.tbar{height:100%;border-radius:4px;transform-origin:left;will-change:transform;transition:transform .35s ease-out;}
.tbar.ok   {background:linear-gradient(90deg,#4422aa,#9966ff);}
.tbar.warn {background:linear-gradient(90deg,#aa6600,#ffcc22);}
.tbar.danger{background:linear-gradient(90deg,#aa0022,#ff4466);animation:tpulse .32s ease-in-out infinite;}
.tbar.fever{background:linear-gradient(90deg,#ff4400,#ffcc00,#ff8800,#ff4400);background-size:200% 100%;animation:feverBar .45s linear infinite;}
@keyframes tpulse{0%,100%{opacity:1;}50%{opacity:.42;}}
@keyframes feverBar{from{background-position:100% 0;}to{background-position:-100% 0;}}

/* Toast — single fixed position, never moves layout */
.bn-slot{width:100%;max-width:336px;height:28px;display:flex;align-items:center;justify-content:center;position:relative;}
.bn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;font-family:'Orbitron',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.08em;padding:5px 18px;background:rgba(200,100,255,.16);border:1px solid rgba(200,100,255,.38);color:#cc88ff;animation:bnIn .18s ease;backdrop-filter:blur(8px);}
.bn.zap    {background:rgba(34,153,255,.16);border-color:rgba(34,153,255,.45);color:#66bbff;}
.bn.bomb   {background:rgba(255,136,51,.16);border-color:rgba(255,136,51,.45);color:#ffaa66;}
.bn.inferno{background:rgba(255,60,0,.18);border-color:rgba(255,100,0,.55);color:#ff8844;}
.bn.vortex {background:rgba(180,0,255,.14);border-color:rgba(220,50,255,.5);color:#ee88ff;}
.bn.fever  {background:rgba(255,80,0,.2);border-color:rgba(255,140,0,.7);color:#ffaa44;font-size:.85rem;}
.bn.milestone{background:rgba(255,220,0,.14);border-color:rgba(255,220,0,.55);color:#ffee44;}
.bn.bad    {background:rgba(255,60,60,.12);border-color:rgba(255,60,60,.3);color:#ff9999;}
@keyframes bnIn{from{opacity:0;transform:translate(-50%,-65%);}to{opacity:1;transform:translate(-50%,-50%);}}

/* Board */
.board-wrap{position:relative;}
.aura{position:absolute;border-radius:50%;pointer-events:none;z-index:0;filter:blur(55px);animation:auraDrift ease-in-out infinite;}
.aura-p{width:300px;height:220px;top:10%;left:-35%;background:rgba(200,68,255,.28);animation-duration:10s;}
.aura-b{width:220px;height:310px;top:-22%;left:28%;background:rgba(34,153,255,.22);animation-duration:14s;animation-delay:-5s;}
.aura-g{width:240px;height:170px;top:65%;left:40%;background:rgba(34,238,136,.16);animation-duration:8.5s;animation-delay:-2s;}
.aura-r{width:180px;height:180px;top:38%;left:60%;background:rgba(255,34,85,.14);animation-duration:12s;animation-delay:-7s;}
@keyframes auraDrift{0%,100%{transform:translate(0,0) scale(1);opacity:.8;}35%{transform:translate(8%,7%) scale(1.14);opacity:1;}70%{transform:translate(-6%,-9%) scale(.88);opacity:.75;}}

.pg{
  background:rgba(0,0,0,.52);border:1px solid rgba(160,80,255,.22);
  border-radius:6px;position:relative;z-index:1;touch-action:none;
  box-shadow:0 0 0 1px rgba(80,0,180,.22),0 0 70px rgba(80,0,180,.42),inset 0 0 55px rgba(0,0,0,.88);
  transition:border-color .3s;overflow:hidden;
}
.pg.fever-board{border-color:rgba(255,100,0,.55);box-shadow:0 0 0 1px rgba(255,80,0,.3),0 0 50px rgba(255,80,0,.35),inset 0 0 55px rgba(0,0,0,.88);}
.pg.shake{animation:boardShake .38s ease;}
@keyframes boardShake{0%,100%{transform:translate(0,0);}14%{transform:translate(-5px,3px);}28%{transform:translate(5px,-3px);}42%{transform:translate(-4px,4px);}57%{transform:translate(4px,-2px);}71%{transform:translate(-2px,2px);}85%{transform:translate(2px,-1px);}}

/* Floating score popups */
.floater{
  position:absolute;font-family:'Orbitron',sans-serif;font-weight:700;font-size:.75rem;
  pointer-events:none;z-index:200;white-space:nowrap;
  animation:floatUp 1.1s ease forwards;
  text-shadow:0 0 8px currentColor;
}
.floater.fever{font-size:.95rem;color:#ffaa44;}
.floater.vortex{font-size:1rem;color:#ee88ff;}
.floater.inferno{color:#ff8844;}
.floater.bomb{color:#ffaa66;}
.floater.zap{color:#66bbff;}
.floater.normal{color:#cc88ff;}
@keyframes floatUp{0%{transform:translateY(0) scale(1);opacity:1;}40%{opacity:1;}100%{transform:translateY(-70px) scale(.75);opacity:0;}}

/* Overlays */
/* Pause / game-over overlay. Keep the backdrop blur STATIC and the fade
   short (150 ms) — animating backdrop-filter is a GPU trap on Android and
   is the main cause of pause-open jank. */
.overlay{position:absolute;inset:0;border-radius:6px;background:rgba(4,2,10,.94);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:50;animation:goIn .15s ease-out;will-change:opacity;}
@keyframes goIn{from{opacity:0;}to{opacity:1;}}
.ov-stagger>*{opacity:0;animation:staggerIn .5s ease forwards;}
.ov-stagger>*:nth-child(1){animation-delay:.3s;}
.ov-stagger>*:nth-child(2){animation-delay:.5s;}
.ov-stagger>*:nth-child(3){animation-delay:.7s;}
.ov-stagger>*:nth-child(4){animation-delay:.85s;}
.ov-stagger>*:nth-child(5){animation-delay:1s;}
.ov-stagger>*:nth-child(6){animation-delay:1.15s;}
@keyframes staggerIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
.ov-title{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:900;letter-spacing:.15em;padding-left:.15em;text-shadow:0 0 22px currentColor;}
.ov-title.timeout{color:#ff4466;}.ov-title.nomoves{color:#ffaa22;}.ov-title.pause{color:#9966ff;}
.ov-sub{font-size:.62rem;letter-spacing:.1em;color:#443355;margin-top:-4px;}
.ov-score{font-family:'Orbitron',sans-serif;font-size:.95rem;color:#cc88ff;letter-spacing:.1em;padding-left:.1em;margin-top:4px;}
.menu{position:fixed;inset:0;background:radial-gradient(ellipse 100% 60% at 50% 40%,#2a0a4a 0%,#07050e 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;z-index:700;padding:20px;}
.menu .pt{font-size:clamp(3rem,14vw,4.8rem);}
.menu .ps{font-size:.7rem;margin-top:8px;}
.menu-best{font-family:'Orbitron',sans-serif;font-size:.72rem;letter-spacing:.14em;color:#8866cc;margin-top:22px;text-align:center;}
.menu-best b{color:#ffcc44;text-shadow:0 0 12px rgba(255,200,68,.6);font-size:1rem;display:block;margin-top:6px;}
.menu-btn{font-family:'Orbitron',sans-serif;font-size:.9rem;font-weight:900;letter-spacing:.2em;padding:16px 48px;padding-left:calc(.2em + 48px);background:transparent;border:2px solid rgba(200,120,255,.6);color:#ddaaff;cursor:pointer;animation:menuPulse 1.6s ease-in-out infinite;}
@keyframes menuPulse{0%,100%{box-shadow:0 0 20px rgba(200,120,255,.35);}50%{box-shadow:0 0 35px rgba(200,120,255,.75);}}
.menu-link{background:none;border:none;color:#6a4a8c;font-size:.65rem;letter-spacing:.14em;cursor:pointer;text-transform:uppercase;padding:6px;font-family:'Inter',sans-serif;}
.menu-link:hover{color:#aa88cc;}
.tut{position:fixed;inset:0;background:rgba(4,2,10,.92);backdrop-filter:blur(10px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:800;padding:30px;}
.tut-card{max-width:340px;text-align:center;}
.tut-num{font-family:'Orbitron',sans-serif;font-size:.65rem;color:#664488;letter-spacing:.2em;margin-bottom:8px;}
.tut-title{font-family:'Orbitron',sans-serif;font-size:1.2rem;font-weight:900;color:#cc88ff;letter-spacing:.1em;margin-bottom:12px;text-shadow:0 0 18px rgba(200,100,255,.6);}
.tut-body{font-size:.82rem;line-height:1.5;color:#aa99cc;margin-top:10px;}
.ts-row{display:flex;align-items:center;justify-content:center;gap:4px;margin:6px 0;}
.ts-arrow{font-family:'Orbitron',sans-serif;color:#cc88ff;font-size:1.1rem;margin:0 6px;text-shadow:0 0 8px rgba(200,100,255,.8);}
.ts-swap{color:#ffcc44;font-size:1.3rem;margin:0 2px;text-shadow:0 0 10px rgba(255,204,68,.9);animation:swapBob .9s ease-in-out infinite;}
@keyframes swapBob{0%,100%{transform:translateY(0);}50%{transform:translateY(-2px);}}
.ts-label{font-family:'Orbitron',sans-serif;font-size:.55rem;letter-spacing:.1em;color:#8866bb;margin-top:3px;text-transform:uppercase;}
.ts-result{font-family:'Orbitron',sans-serif;font-size:.72rem;font-weight:900;color:#44ddaa;letter-spacing:.1em;text-shadow:0 0 10px rgba(68,221,170,.7);}
.ts-icon{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:18px;background:rgba(200,100,255,.15);border:1px solid rgba(200,100,255,.4);}
.ts-icon.zap{background:rgba(68,200,255,.2);border-color:rgba(68,200,255,.5);}
.ts-icon.bomb{background:rgba(255,120,60,.2);border-color:rgba(255,120,60,.5);}
.ts-icon.inferno{background:rgba(255,60,40,.2);border-color:rgba(255,60,40,.5);}
.ts-icon.vortex{background:rgba(180,80,255,.25);border-color:rgba(180,80,255,.6);}
.ts-highlight{outline:2px solid #ffcc44;outline-offset:2px;border-radius:6px;animation:tsGlow 1.2s ease-in-out infinite;}
@keyframes tsGlow{0%,100%{outline-color:#ffcc44;box-shadow:0 0 0 rgba(255,204,68,0);}50%{outline-color:#ffee88;box-shadow:0 0 12px rgba(255,204,68,.7);}}
.ts-lock{position:relative;width:36px;height:36px;}
.ts-lock-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#222;border:1.5px solid #ffcc44;color:#ffcc44;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;}
.nb{color:#ffcc44;font-weight:700;text-shadow:0 0 10px currentColor;}
.ov-btn{font-family:'Orbitron',sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.18em;padding:10px 28px;padding-left:calc(.18em + 28px);background:transparent;border:1px solid rgba(160,80,255,.45);color:#aa88ff;cursor:pointer;transition:all .2s;margin-top:4px;}
.ov-btn:hover{background:rgba(160,80,255,.12);box-shadow:0 0 18px rgba(160,80,255,.35);}
.ov-btn.danger{border-color:rgba(255,68,102,.5);color:#ff6688;}
.ov-btn.danger:hover{background:rgba(255,68,102,.12);}

/* Board background bloom — subtle pulsing gradient behind the canvas. */
.board-bloom{position:absolute;inset:-40px;border-radius:32px;pointer-events:none;z-index:-1;background:radial-gradient(ellipse at 30% 30%,rgba(170,90,255,.22),transparent 55%),radial-gradient(ellipse at 70% 70%,rgba(60,170,255,.18),transparent 60%);filter:blur(28px);animation:bloomDrift 14s ease-in-out infinite;}
@keyframes bloomDrift{0%,100%{transform:scale(1) translate(0,0);opacity:.85;}50%{transform:scale(1.08) translate(2%,-2%);opacity:1;}}

/* Tutorial gem overlays — used by <TutGem> to preview powerups. */
.sp-z{position:absolute;inset:0;pointer-events:none;z-index:3;}
.sp-mult{position:absolute;top:4%;right:4%;width:42%;height:42%;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-weight:900;font-size:13px;color:#fff;background:linear-gradient(135deg,#ffd700,#ff8800);border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 10px 2px rgba(255,215,0,.9),inset 0 0 4px rgba(255,255,255,.5);text-shadow:0 1px 2px rgba(0,0,0,.7);animation:multPulse 1.1s ease-in-out infinite;pointer-events:none;z-index:3;}
.sp-mult5{background:linear-gradient(135deg,#66ddff,#2266ff);box-shadow:0 0 14px 3px rgba(80,180,255,.95),inset 0 0 5px rgba(255,255,255,.6);font-size:12px;}
.sp-mult10{background:linear-gradient(135deg,#ff66dd,#aa00aa);box-shadow:0 0 18px 4px rgba(255,100,220,.95),0 0 32px 6px rgba(170,0,170,.55);font-size:11px;}
@keyframes mult10Spin{to{transform:rotate(360deg);}}
.mw-badge{font-family:'Orbitron',sans-serif;font-size:.64rem;font-weight:900;letter-spacing:.08em;padding:4px 10px;border:1px solid currentColor;color:#ffcc44;animation:mwPulse .5s ease-in-out infinite alternate;}
.mw-badge.m5{color:#66ccff;}
.mw-badge.m10{color:#ee88ff;animation-duration:.25s;}
@keyframes mwPulse{from{box-shadow:0 0 6px currentColor;}to{box-shadow:0 0 18px currentColor,0 0 30px currentColor;}}
.pg.flash-mult2 {box-shadow:0 0 0 2px #ffcc44,0 0 50px rgba(255,204,68,.7),inset 0 0 55px rgba(0,0,0,.88);}
.pg.flash-mult5 {box-shadow:0 0 0 2px #66ccff,0 0 70px rgba(102,204,255,.85),inset 0 0 55px rgba(0,0,0,.88);}
.pg.flash-mult10{box-shadow:0 0 0 3px #fff,0 0 90px rgba(255,255,255,.9),0 0 140px rgba(200,100,255,.7),inset 0 0 55px rgba(0,0,0,.88);}
.sp-shuffle{position:absolute;top:4%;right:4%;width:46%;height:46%;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-weight:900;font-size:18px;color:#fff;background:conic-gradient(from 0deg,#00d4ff,#9d00ff,#ff00aa,#00d4ff);border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 12px 3px rgba(157,0,255,.85),inset 0 0 5px rgba(255,255,255,.5);text-shadow:0 1px 3px rgba(0,0,0,.7);animation:shufSpin 1.6s linear infinite;pointer-events:none;z-index:3;}
@keyframes shufSpin{to{transform:rotate(360deg);}}
@keyframes multPulse{0%,100%{transform:scale(1);filter:brightness(1);}50%{transform:scale(1.08);filter:brightness(1.25);}}
.sp-bb{position:absolute;border-radius:2px;}
.sp-bb.h{top:50%;left:10%;right:10%;height:3px;transform:translateY(-50%);background:linear-gradient(90deg,rgba(0,220,255,.6) 0%,#fff 18%,#fff 82%,rgba(0,220,255,.6) 100%);box-shadow:0 0 5px 1px rgba(0,220,255,.85),0 0 10px rgba(0,180,255,.4);animation:zapPulse 0.7s ease-in-out infinite;}
.sp-bb.v{left:50%;top:10%;bottom:10%;width:3px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(0,220,255,.6) 0%,#fff 18%,#fff 82%,rgba(0,220,255,.6) 100%);box-shadow:0 0 5px 1px rgba(0,220,255,.85),0 0 10px rgba(0,180,255,.4);animation:zapPulse 0.9s ease-in-out infinite;animation-delay:-0.22s;}
.sp-z::before,.sp-z::after{content:"";position:absolute;width:5px;height:5px;border-radius:50%;top:calc(50% - 2.5px);background:radial-gradient(circle,#fff 0%,rgba(0,220,255,.8) 50%,transparent 80%);box-shadow:0 0 6px 1px rgba(0,220,255,.75);animation:zapSpark 1s ease-in-out infinite;}
.sp-z::before{left:5%;}
.sp-z::after{right:5%;animation-delay:-0.5s;}
@keyframes zapPulse{0%,100%{filter:brightness(1);opacity:.88;}50%{filter:brightness(1.2);opacity:1;}}
@keyframes zapSpark{0%,100%{transform:scale(1);opacity:.8;}50%{transform:scale(1.2);opacity:1;}}
.sp-bm{position:absolute;top:16%;left:16%;right:16%;bottom:16%;border:2.5px solid rgba(255,255,255,.95);border-radius:50%;box-shadow:0 0 10px 3px rgba(255,255,255,.65),inset 0 0 8px rgba(255,255,255,.22);animation:bmRing 1.3s ease-in-out infinite;pointer-events:none;z-index:3;}
@keyframes bmRing{0%,100%{transform:scale(1);opacity:.8;}50%{transform:scale(1.1);opacity:1;}}
/* Inferno: fast orange/red spinning ring */
.sp-inf{position:absolute;top:8%;left:8%;right:8%;bottom:8%;border-radius:50%;background:conic-gradient(#ff2200,#ff8800,#ffcc00,#ff5500,#ff2200);animation:infSpin .7s linear infinite;opacity:.92;pointer-events:none;z-index:3;mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#fff calc(100% - 4px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#fff calc(100% - 4px));filter:brightness(1.3);}
@keyframes infSpin{to{transform:rotate(360deg);}}
/* Vortex: full rainbow double ring, fastest */
.sp-vortex-outer{position:absolute;top:5%;left:5%;right:5%;bottom:5%;border-radius:50%;background:conic-gradient(#ff2255,#ff8800,#ffcc22,#22ee88,#2299ff,#cc44ff,#ff2255);animation:vortexSpin .45s linear infinite;opacity:.95;pointer-events:none;z-index:3;mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#fff calc(100% - 5px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#fff calc(100% - 5px));filter:brightness(1.5);}
.sp-vortex-inner{position:absolute;top:22%;left:22%;right:22%;bottom:22%;border-radius:50%;background:conic-gradient(#ffcc22,#2299ff,#cc44ff,#22ee88,#ff2255,#ffcc22);animation:vortexSpin .45s linear infinite reverse;opacity:.8;pointer-events:none;z-index:3;mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#fff calc(100% - 3px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#fff calc(100% - 3px));}
@keyframes vortexSpin{to{transform:rotate(360deg);}}

.lg{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:14px;}
.li{display:flex;align-items:center;gap:4px;font-size:.54rem;letter-spacing:.04em;color:#3a2850;}
.ng{font-family:'Orbitron',sans-serif;font-size:.65rem;font-weight:700;letter-spacing:.18em;padding:9px 28px;padding-left:calc(.18em + 28px);background:transparent;border:1px solid rgba(160,80,255,.4);color:#9966cc;cursor:pointer;transition:all .2s;}
.ng:hover{background:rgba(160,80,255,.1);color:#cc88ff;border-color:rgba(160,80,255,.7);}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// GEM
// ═══════════════════════════════════════════════════════════════════════════════
// Faceted SVG geometry — each shape is split into triangular facets, each with its own
// shade based on which way the face "tilts" relative to a light source at upper-left.
// The shade index 0=brightest, 1=light, 2=fill, 3=dark, 4=darkest.
const FACETS = {
  circle: null, // circle uses the radial gradient path
  marquise: [
    // Elongated vertical gem, pointed top/bottom, widest in middle
    // 6 facets meeting at center (50,50) for a marquise-cut look
    { pts: "50,3 36,25 50,50", s: 0 }, // upper-left upper
    { pts: "50,3 64,25 50,50", s: 1 }, // upper-right upper
    { pts: "36,25 16,50 50,50", s: 1 }, // upper-left lower
    { pts: "64,25 84,50 50,50", s: 2 }, // upper-right lower
    { pts: "16,50 36,75 50,50", s: 3 }, // lower-left upper
    { pts: "84,50 64,75 50,50", s: 4 }, // lower-right upper
    { pts: "36,75 50,97 50,50", s: 4 }, // lower-left lower
    { pts: "64,75 50,97 50,50", s: 4 }, // lower-right lower
  ],
  diamond: [
    { pts: "50,4 50,50 8,50", s: 0 }, // top-left face (lit)
    { pts: "50,4 92,50 50,50", s: 1 }, // top-right
    { pts: "8,50 50,50 50,96", s: 3 }, // bottom-left
    { pts: "50,50 92,50 50,96", s: 4 }, // bottom-right (darkest)
  ],
  triangle: [
    { pts: "50,6 50,82 6,90", s: 1 }, // left face
    { pts: "50,6 94,90 50,82", s: 3 }, // right face
    { pts: "6,90 50,82 94,90", s: 4 }, // bottom rim
  ],
  hex: [
    { pts: "25,2 50,50 0,50", s: 0 },
    { pts: "25,2 75,2 50,50", s: 1 },
    { pts: "75,2 100,50 50,50", s: 2 },
    { pts: "0,50 50,50 25,98", s: 3 },
    { pts: "50,50 75,98 25,98", s: 4 },
    { pts: "50,50 100,50 75,98", s: 4 },
  ],
  star: [
    { pts: "50,2 61,35 50,50", s: 0 },
    { pts: "61,35 98,35 50,50", s: 1 },
    { pts: "98,35 68,57 50,50", s: 2 },
    { pts: "68,57 79,91 50,50", s: 3 },
    { pts: "79,91 50,70 50,50", s: 4 },
    { pts: "50,70 21,91 50,50", s: 4 },
    { pts: "21,91 32,57 50,50", s: 3 },
    { pts: "32,57 2,35 50,50", s: 2 },
    { pts: "2,35 39,35 50,50", s: 1 },
    { pts: "39,35 50,2 50,50", s: 0 },
  ],
};
function lerpHex(a, b, t) {
  const pa = a.replace("#", ""),
    pb = b.replace("#", "");
  const ar = parseInt(pa.slice(0, 2), 16),
    ag = parseInt(pa.slice(2, 4), 16),
    ab = parseInt(pa.slice(4, 6), 16);
  const br = parseInt(pb.slice(0, 2), 16),
    bg = parseInt(pb.slice(2, 4), 16),
    bb = parseInt(pb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t),
    g = Math.round(ag + (bg - ag) * t),
    bl = Math.round(ab + (bb - ab) * t);
  return "#" + [r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function shadeColor(pal, s) {
  const stops = ["#ffffff", pal.light, pal.fill, pal.dark, pal.dark];
  const lo = Math.floor(s),
    hi = Math.min(4, lo + 1),
    t = s - lo;
  return lerpHex(stops[lo], stops[hi], t);
}
// ── Pre-render gem textures to canvas (one per color, reused for all gems) ──
const GEM_TEXTURES = {};
function buildGemTextures() {
  const SZ = 128; // render at 2x then display at PX
  for (const colorKey of COLORS) {
    const pal = PAL[colorKey];
    const shape = SHAPE_OF[colorKey];
    const canvas = document.createElement("canvas");
    canvas.width = SZ;
    canvas.height = SZ;
    const ctx = canvas.getContext("2d");
    const sc = SZ / 100;
    const facets = FACETS[shape];
    if (!facets) {
      // Circle
      const grad = ctx.createRadialGradient(SZ * 0.38, SZ * 0.3, 0, SZ * 0.5, SZ * 0.5, SZ * 0.44);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.18, pal.light);
      grad.addColorStop(0.55, pal.fill);
      grad.addColorStop(0.95, pal.dark);
      ctx.beginPath();
      ctx.arc(SZ / 2, SZ / 2, SZ * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 0.5 * sc;
      ctx.stroke();
    } else {
      for (const f of facets) {
        const c1 = shadeColor(pal, Math.max(0, f.s - 0.5));
        const c2 = shadeColor(pal, Math.min(4, f.s + 0.5));
        const grad = ctx.createLinearGradient(SZ * 0.2, SZ * 0.15, SZ * 0.8, SZ * 0.85);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        const pts = f.pts
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        ctx.beginPath();
        ctx.moveTo(pts[0] * sc, pts[1] * sc);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * sc, pts[i + 1] * sc);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 0.25 * sc;
        ctx.stroke();
      }
    }
    // (specular highlights removed)
    // Diagonal gradient overlay
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(SZ * 0.55, 0);
    ctx.lineTo(0, SZ * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.moveTo(SZ, SZ);
    ctx.lineTo(SZ * 0.45, SZ);
    ctx.lineTo(SZ, SZ * 0.45);
    ctx.closePath();
    ctx.fill();
    // Bottom rim
    const rimGrad = ctx.createLinearGradient(0, SZ * 0.72, 0, SZ);
    rimGrad.addColorStop(0, "rgba(0,0,0,0)");
    rimGrad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, SZ * 0.72, SZ, SZ * 0.28);

    GEM_TEXTURES[colorKey] = canvas;
  }
  // Wildcard gem — faceted crystal matching the app icon
  const wc = document.createElement("canvas");
  wc.width = SZ;
  wc.height = SZ;
  const wctx = wc.getContext("2d");
  const wcx = SZ / 2,
    wcy = SZ / 2;
  const ws = SZ / 100;
  // Crystal facets matching the icon shape (diamond with angled facets)
  // Top cap (white/pink)
  wctx.fillStyle = "#eeccdd";
  wctx.beginPath();
  wctx.moveTo(50 * ws, 8 * ws);
  wctx.lineTo(30 * ws, 35 * ws);
  wctx.lineTo(70 * ws, 35 * ws);
  wctx.closePath();
  wctx.fill();
  // Top-left (pink/magenta)
  wctx.fillStyle = "#dd3388";
  wctx.beginPath();
  wctx.moveTo(50 * ws, 8 * ws);
  wctx.lineTo(30 * ws, 35 * ws);
  wctx.lineTo(10 * ws, 50 * ws);
  wctx.closePath();
  wctx.fill();
  // Top-right (cyan/blue)
  wctx.fillStyle = "#55aadd";
  wctx.beginPath();
  wctx.moveTo(50 * ws, 8 * ws);
  wctx.lineTo(70 * ws, 35 * ws);
  wctx.lineTo(90 * ws, 50 * ws);
  wctx.closePath();
  wctx.fill();
  // Mid band (pink)
  wctx.fillStyle = "#dd88bb";
  wctx.beginPath();
  wctx.moveTo(30 * ws, 35 * ws);
  wctx.lineTo(70 * ws, 35 * ws);
  wctx.lineTo(50 * ws, 50 * ws);
  wctx.closePath();
  wctx.fill();
  // Left (deep purple)
  wctx.fillStyle = "#442266";
  wctx.beginPath();
  wctx.moveTo(10 * ws, 50 * ws);
  wctx.lineTo(30 * ws, 35 * ws);
  wctx.lineTo(50 * ws, 50 * ws);
  wctx.lineTo(35 * ws, 75 * ws);
  wctx.closePath();
  wctx.fill();
  // Right (purple)
  wctx.fillStyle = "#6644aa";
  wctx.beginPath();
  wctx.moveTo(90 * ws, 50 * ws);
  wctx.lineTo(70 * ws, 35 * ws);
  wctx.lineTo(50 * ws, 50 * ws);
  wctx.lineTo(65 * ws, 75 * ws);
  wctx.closePath();
  wctx.fill();
  // Bottom-left (dark blue)
  wctx.fillStyle = "#1a2244";
  wctx.beginPath();
  wctx.moveTo(35 * ws, 75 * ws);
  wctx.lineTo(50 * ws, 50 * ws);
  wctx.lineTo(50 * ws, 92 * ws);
  wctx.closePath();
  wctx.fill();
  // Bottom-right (medium blue)
  wctx.fillStyle = "#224477";
  wctx.beginPath();
  wctx.moveTo(65 * ws, 75 * ws);
  wctx.lineTo(50 * ws, 50 * ws);
  wctx.lineTo(50 * ws, 92 * ws);
  wctx.closePath();
  wctx.fill();
  // Edge lines
  wctx.strokeStyle = "rgba(255,255,255,0.15)";
  wctx.lineWidth = 0.5 * ws;
  for (const pts of [
    [50, 8, 30, 35],
    [50, 8, 70, 35],
    [50, 8, 10, 50],
    [50, 8, 90, 50],
    [30, 35, 70, 35],
    [30, 35, 50, 50],
    [70, 35, 50, 50],
    [10, 50, 35, 75],
    [90, 50, 65, 75],
    [35, 75, 50, 92],
    [65, 75, 50, 92],
    [50, 50, 35, 75],
    [50, 50, 65, 75],
  ]) {
    wctx.beginPath();
    wctx.moveTo(pts[0] * ws, pts[1] * ws);
    wctx.lineTo(pts[2] * ws, pts[3] * ws);
    wctx.stroke();
  }
  GEM_TEXTURES["w"] = wc;

  // Pre-render glow textures per color (avoids createRadialGradient per frame)
  const GSZ = Math.ceil(PX * 1.6);
  for (const ck of [...COLORS, "w"]) {
    const gc = document.createElement("canvas");
    gc.width = GSZ;
    gc.height = GSZ;
    const gx = gc.getContext("2d");
    const gr = gx.createRadialGradient(GSZ / 2, GSZ / 2, PX * 0.06, GSZ / 2, GSZ / 2, GSZ / 2);
    if (ck === "w") {
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(0.3, "#cc88ff");
      gr.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      const p = PAL[ck];
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(0.3, p.fill);
      gr.addColorStop(1, "rgba(0,0,0,0)");
    }
    gx.fillStyle = gr;
    gx.fillRect(0, 0, GSZ, GSZ);
    GEM_TEXTURES["glow_" + ck] = gc;
  }
  // Pre-render badge textures at 3x for crisp display on high-DPI
  const br = Math.ceil(PX * 0.22);
  const BADGE_SCALE = 3;
  const bsz = (br * 2 + 4) * BADGE_SCALE;
  const brS = br * BADGE_SCALE;
  const BADGES = [
    {
      key: "badge_mult2",
      style: "linear",
      colors: ["#ffd700", "#ff8800"],
      label: "×2",
      fontSize: 8 * BADGE_SCALE,
    },
    {
      key: "badge_mult5",
      style: "linear",
      colors: ["#66ddff", "#2266ff"],
      label: "×5",
      fontSize: 8 * BADGE_SCALE,
    },
    {
      key: "badge_mult10",
      style: "linear",
      colors: ["#ff66dd", "#aa00aa"],
      label: "×10",
      fontSize: 7 * BADGE_SCALE,
    },
    {
      key: "badge_shuffle",
      style: "conic",
      colors: ["#00d4ff", "#9d00ff", "#ff00aa"],
      label: "↻",
      fontSize: 10 * BADGE_SCALE,
    },
  ];
  for (const { key, style, colors, label, fontSize } of BADGES) {
    const bc = document.createElement("canvas");
    bc.width = bsz;
    bc.height = bsz;
    const bx2 = bc.getContext("2d");
    const cx = bsz / 2,
      cy = bsz / 2;
    // Main fill
    if (style === "linear") {
      // Diagonal gradient (135deg) from top-left to bottom-right
      const lg = bx2.createLinearGradient(
        cx - brS * 0.7,
        cy - brS * 0.7,
        cx + brS * 0.7,
        cy + brS * 0.7
      );
      lg.addColorStop(0, colors[0]);
      lg.addColorStop(1, colors[1]);
      bx2.fillStyle = lg;
      bx2.beginPath();
      bx2.arc(cx, cy, brS, 0, Math.PI * 2);
      bx2.fill();
    } else {
      // Conic gradient approximated via pie slices
      const n = colors.length,
        slices = 48;
      for (let i = 0; i < slices; i++) {
        const t = i / slices,
          a0 = t * Math.PI * 2 - Math.PI / 2,
          a1 = ((i + 1) / slices) * Math.PI * 2 - Math.PI / 2;
        const idx = t * n,
          i0 = Math.floor(idx) % n,
          i1 = (i0 + 1) % n,
          ft = idx - Math.floor(idx);
        const col = lerpColor(colors[i0], colors[i1], ft);
        bx2.fillStyle = col;
        bx2.beginPath();
        bx2.moveTo(cx, cy);
        bx2.arc(cx, cy, brS, a0, a1);
        bx2.closePath();
        bx2.fill();
      }
    }
    // Inset highlight (upper-left shine spot)
    const hg = bx2.createRadialGradient(
      cx - brS * 0.35,
      cy - brS * 0.35,
      0,
      cx - brS * 0.35,
      cy - brS * 0.35,
      brS * 0.7
    );
    hg.addColorStop(0, "rgba(255,255,255,0.55)");
    hg.addColorStop(0.6, "rgba(255,255,255,0.1)");
    hg.addColorStop(1, "rgba(255,255,255,0)");
    bx2.fillStyle = hg;
    bx2.beginPath();
    bx2.arc(cx, cy, brS, 0, Math.PI * 2);
    bx2.fill();
    // White border ring
    bx2.strokeStyle = "#ffffff";
    bx2.lineWidth = 1.5 * BADGE_SCALE;
    bx2.beginPath();
    bx2.arc(cx, cy, brS - BADGE_SCALE * 0.6, 0, Math.PI * 2);
    bx2.stroke();
    // Label with subtle shadow for readability
    bx2.shadowColor = "rgba(0,0,0,0.7)";
    bx2.shadowBlur = 2 * BADGE_SCALE;
    bx2.shadowOffsetY = BADGE_SCALE * 0.5;
    bx2.fillStyle = "#fff";
    bx2.font = `bold ${fontSize}px system-ui`;
    bx2.textAlign = "center";
    bx2.textBaseline = "middle";
    bx2.fillText(label, cx, cy);
    GEM_TEXTURES[key] = bc;
  }
}

// Linear-interpolate two hex colors
function lerpColor(a, b, t) {
  const pa = a.replace("#", ""),
    pb = b.replace("#", "");
  const ar = parseInt(pa.slice(0, 2), 16),
    ag = parseInt(pa.slice(2, 4), 16),
    ab = parseInt(pa.slice(4, 6), 16);
  const br = parseInt(pb.slice(0, 2), 16),
    bg = parseInt(pb.slice(2, 4), 16),
    bb = parseInt(pb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t),
    g = Math.round(ag + (bg - ag) * t),
    bl = Math.round(ab + (bb - ab) * t);
  return "#" + [r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Draw an annulus (ring) with a conic gradient, rotated by `rot` radians
function drawConicRing(ctx, cx, cy, rInner, rOuter, colors, slices, rot) {
  const n = colors.length;
  ctx.save();
  for (let i = 0; i < slices; i++) {
    const t = i / slices;
    const a0 = t * Math.PI * 2 + rot,
      a1 = ((i + 1) / slices) * Math.PI * 2 + rot;
    const idx = t * n,
      i0 = Math.floor(idx) % n,
      i1 = (i0 + 1) % n,
      ft = idx - Math.floor(idx);
    ctx.fillStyle = lerpColor(colors[i0], colors[i1], ft);
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, a0, a1, false);
    ctx.arc(cx, cy, rInner, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
buildGemTextures();

// ═══════════════════════════════════════════════════════════════════════════════
// PAUSE OVERLAY
// ═══════════════════════════════════════════════════════════════════════════════
// Pulled out and memoized so toggling `paused` doesn't force the huge main
// component to rebuild the overlay's JSX tree. Parents pass stable callback
// references (pauseConfirmRef below) so `memo` can bail on re-renders.
const PauseOverlay = memo(function PauseOverlay({
  confirmAction,
  onConfirm,
  onCancel,
  onResume,
  onReset,
  onMenu,
  onToggleMusic,
  onToggleSfx,
  musicMuted,
  sfxMuted,
}) {
  if (confirmAction) {
    return (
      <div className="overlay">
        <div className="ov-title pause" style={{ fontSize: "1rem" }}>
          {confirmAction === "reset" ? "NEW GAME?" : "QUIT TO MENU?"}
        </div>
        <div className="ov-sub">your current progress will be lost</div>
        <button className="ov-btn danger" onClick={onConfirm}>
          YES
        </button>
        <button className="ov-btn" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    );
  }
  return (
    <div className="overlay">
      <div className="ov-title pause">PAUSED</div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          className="icon-btn"
          onClick={onToggleMusic}
          style={{
            opacity: musicMuted ? 0.45 : 1,
            padding: "8px 10px",
            fontSize: ".6rem",
            width: 88,
            textAlign: "center",
          }}
        >
          MUSIC {musicMuted ? "OFF" : "ON"}
        </button>
        <button
          className="icon-btn"
          onClick={onToggleSfx}
          style={{
            opacity: sfxMuted ? 0.45 : 1,
            padding: "8px 10px",
            fontSize: ".6rem",
            width: 76,
            textAlign: "center",
          }}
        >
          SFX {sfxMuted ? "OFF" : "ON"}
        </button>
      </div>
      <button className="ov-btn" onClick={onResume}>
        ▶ RESUME
      </button>
      <button
        className="ov-btn danger"
        onClick={onReset}
        style={{ fontSize: ".6rem", padding: "7px 20px" }}
      >
        ↺ NEW GAME
      </button>
      <button className="menu-link" onClick={onMenu}>
        ← MENU
      </button>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export default function PrismGame() {
  const [board, setBoard] = useState(initBoard);
  const [sel, setSel] = useState(null);
  const [clr, setClr] = useState(new Set());
  const [freshGems, setFreshGems] = useState(new Set());
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [streak, setStreak] = useState(0);
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const scoreRefForSave = useRef(0);
  const [boardFlash, setBoardFlash] = useState(null);
  const [banner, setBanner] = useState(null);
  const [fever, setFever] = useState(false);
  const [floaters, setFloaters] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [screen, setScreen] = useState("menu");
  const [showTut, setShowTut] = useState(false);
  const [tutStep, setTutStep] = useState(0);
  const [best, setBest] = useState(loadBest());
  const [bestInfo, setBestInfo] = useState({ isNew: false, prev: 0 });
  const [goReason, setGoReason] = useState("timeout");
  const [paused, setPaused] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [musicMuted, setMusicMuted] = useState(() => STORAGE.get("prism_music_muted", false));
  const [sfxMuted, setSfxMuted] = useState(() => STORAGE.get("prism_sfx_muted", false));

  const timerRaf = useRef(null);
  const remainingRef = useRef(0); // ms remaining on game timer — counts down by delta time
  const lastTickRef = useRef(null);
  const movesRef = useRef(0);
  const busyRef = useRef(false);
  const gameOvRef = useRef(false);
  const pausedRef = useRef(false);
  const feverRef = useRef(false);
  const feverTimer = useRef(null);
  const nextMilestone = useRef(MILESTONE);
  const musicReady = useRef(false);
  const bannerTimer = useRef(null);
  const touchRef = useRef(null);
  const barRef = useRef(null);
  const secRef = useRef(null);
  const limitRef = useRef(null);
  const pgRef = useRef(null);
  const canvasRef = useRef(null);
  const drawRaf = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Game generation — incremented on every reset/new game. Any in-flight
  // callback that was queued for an older generation is silently dropped,
  // which is how we cancel pending cascades after the player quits a run.
  const gameGenRef = useRef(0);

  // setTimeout that respects pause and the current game generation.
  // Polls every 50 ms while paused and fires immediately once unpaused.
  const pauseAwareTimeout = (fn, delay) => {
    const gen = gameGenRef.current;
    const check = () => {
      if (gen !== gameGenRef.current) return; // game was reset, discard
      if (pausedRef.current) {
        setTimeout(check, 50);
        return;
      }
      fn();
    };
    setTimeout(check, delay);
  };

  // ── Timer (delta-time based — no wall-clock drift) ─────────────────────
  const stopTimer = useCallback(() => {
    if (timerRaf.current) {
      cancelAnimationFrame(timerRaf.current);
      timerRaf.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    lastTickRef.current = performance.now();
    // Pick a bar/text tier with a little hysteresis so the tier doesn't
    // flicker when the timer hovers right on a boundary.
    const pickTier = (frac, prev) => {
      if (frac > 0.52 || (prev === "ok" && frac > 0.48)) return "ok";
      if (frac > 0.27 || (prev === "warn" && frac > 0.23)) return "warn";
      return "danger";
    };

    const tick = (now) => {
      if (gameOvRef.current) return;
      const el = now - lastTickRef.current;
      lastTickRef.current = now;

      // Only drain the timer while the player can actually act.
      const frozen = pausedRef.current || busyRef.current || !startedRef.current;
      if (!frozen) remainingRef.current = Math.max(0, remainingRef.current - el);

      // Tempo scales with the current time ceiling: 118 BPM at 14s → 155 BPM at 1.5s.
      const maxMs = getMaxMs(movesRef.current);
      const tempoFrac = Math.max(0, Math.min(1, (maxMs - 1500) / (14000 - 1500)));
      AUDIO.setTempo(Math.round(118 + 37 * (1 - tempoFrac)));

      const remain = remainingRef.current;
      const frac = Math.max(0, Math.min(1, remain / maxMs));
      const isFever = feverRef.current;

      // Update the timer bar (direct DOM write — we'd rather skip a React
      // render for something that changes every frame).
      if (barRef.current && !frozen) {
        const tier = isFever ? "fever" : pickTier(frac, barRef.current.dataset.tier);
        barRef.current.style.transform = `scaleX(${frac})`;
        if (barRef.current.dataset.tier !== tier) {
          barRef.current.className = `tbar ${tier}`;
          barRef.current.dataset.tier = tier;
        }
      }

      // Update the numeric seconds readout.
      if (secRef.current && !frozen) {
        const label = isFever ? "🔥" : "";
        const newText = `${label}${(Math.max(0, remain) / 1000).toFixed(1)}s`;
        if (secRef.current.textContent !== newText) secRef.current.textContent = newText;
        const stier = pickTier(frac, secRef.current.dataset.tier);
        if (secRef.current.dataset.tier !== stier) {
          secRef.current.className = `tsec ${stier}`;
          secRef.current.dataset.tier = stier;
        }
      }

      // Timer ran out — but wait for any in-progress cascade to finish first.
      if (remain <= 0 && !busyRef.current && !pausedRef.current) {
        triggerGameOverRef.current?.("timeout");
        return;
      }
      timerRaf.current = requestAnimationFrame(tick);
    };
    timerRaf.current = requestAnimationFrame(tick);
  }, [stopTimer]);

  // Ref wrapper so timer and cascade closures can call triggerGameOver even
  // though it's defined further down. Assigned each render below.
  const triggerGameOverRef = useRef(null);

  // Decrement chain timers every 250 ms. When a chain finishes, spawn a
  // VFX blast and — if the newly freed gem now matches its neighbours —
  // kick off a cascade automatically.
  const lastChainTick = useRef(performance.now());
  useEffect(() => {
    if (screen !== "play") return;
    const iv = setInterval(() => {
      if (pausedRef.current || gameOvRef.current) return;

      const now2 = performance.now();
      const dt = now2 - lastChainTick.current;
      lastChainTick.current = now2;

      const unchained = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const g = board[r]?.[c];
          if (g?.chained && typeof g.chained === "number") {
            g.chained -= dt;
            if (g.chained <= 0) {
              unchained.push({ r, c });
              g.chained = null;
            }
          }
        }
      if (!unchained.length) return;

      AUDIO.sfx("unchain");
      for (const { r: r2, c: c2 } of unchained) {
        const px = PAD + c2 * CELL + PX / 2,
          py = PAD + r2 * CELL + PX / 2;
        vfxRef.current.push({
          type: "unchainBlast",
          x: px,
          y: py,
          start: performance.now(),
          dur: 400,
        });
      }

      const newBoard = board.map((row) => [...row]);
      setBoard(newBoard);
      if (!busyRef.current && findMatches(newBoard).matched.size > 0) {
        setBusy(true);
        busyRef.current = true;
        pauseAwareTimeout(() => cascade(newBoard, 1), 200);
      }
    }, 250);
    return () => clearInterval(iv);
  }, [screen, board]);

  useEffect(() => {
    if (screen !== "play") return;
    remainingRef.current = getMaxMs(0);
    AUDIO.setTempo(118);
    startTimer();
    return () => {
      stopTimer();
    }; // don't stop music here — only on explicit menu/game over
  }, [screen]); // eslint-disable-line

  // Flag every cell as "fresh" so the draw loop runs the drop-in animation.
  const triggerBoardDrop = () => {
    const allFresh = new Set();
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) allFresh.add(`${rr},${cc}`);
    setFreshGems(allFresh);
    freshStart.current = 0; // assigned on first draw frame for perfect sync
    setTimeout(() => setFreshGems(new Set()), 800);
  };

  // Wipe all per-run state back to defaults. Used by startGame/backToMenu/reset
  // so every entry point starts from a clean slate.
  const wipeRunState = () => {
    gameGenRef.current++; // invalidates any timeouts still in flight
    movesRef.current = 0;
    gameOvRef.current = false;
    busyRef.current = false;
    pausedRef.current = false;
    startedRef.current = false;
    feverRef.current = false;
    nextMilestone.current = MILESTONE;
    streakRef.current = 0;
    bestStreakRef.current = 0;
    scoreRefForSave.current = 0;
    prismSlideRef.current = null;
    swapAnimRef.current = null;
    hiddenCellsRef.current = null;
    vfxRef.current = [];
    vfxSpawned.current.clear();
    dropsRef.current = {};
    clearTimeout(feverTimer.current);

    setScore(0);
    setCombo(0);
    setStreak(0);
    setBanner(null);
    setBusy(false);
    setShake(null);
    setFever(false);
    setFloaters([]);
    setGameOver(false);
    setPaused(false);
    setConfirmAction(null);
    setSel(null);
    setClr(new Set());
    setFreshGems(new Set());
  };

  const startGame = useCallback(() => {
    ensureAudio();
    // First-time players go through the tutorial before the board loads.
    if (!STORAGE.get(TUT_KEY, false)) {
      setShowTut(true);
      setTutStep(0);
      return;
    }
    wipeRunState();
    setBoard(initBoard());
    triggerBoardDrop();
    setScreen("play");
    AUDIO.forceStart();
    musicReady.current = true;
  }, []);

  const finishTutorial = useCallback(() => {
    STORAGE.set(TUT_KEY, true);
    setShowTut(false);
    setBoard(initBoard());
    triggerBoardDrop();
    setScreen("play");
    AUDIO.forceStart();
    musicReady.current = true;
  }, []);

  const backToMenu = useCallback(() => {
    stopTimer();
    AUDIO.stopMusic();
    AUDIO.setTempo(118);
    wipeRunState();
    musicReady.current = false;
    setBest(loadBest());
    setScreen("menu");
  }, []);

  const addBonus = useCallback(() => {
    const maxMs = getMaxMs(movesRef.current);
    remainingRef.current = Math.min(remainingRef.current + getBonusMs(movesRef.current), maxMs);
    AUDIO.sfx("bonus");
  }, []);

  // ── FEVER ──────────────────────────────────────────────────────────────
  const triggerFever = useCallback(() => {
    if (feverRef.current) return;
    feverRef.current = true;
    setFever(true);
    AUDIO.sfx("fever");
    showBanner("🔥 FEVER MODE — 3× SCORE!", "fever", 2000, 3);
    // Fever time reward, clamped to current ceiling
    const fmax = getMaxMs(movesRef.current);
    remainingRef.current = Math.min(remainingRef.current + 8000, fmax);
    if (feverTimer.current) clearTimeout(feverTimer.current);
    feverTimer.current = setTimeout(() => {
      feverRef.current = false;
      setFever(false);
    }, FEVER_DUR);
  }, []);

  // Fever triggers when a cascade reaches 4+ levels deep
  const checkFever = useCallback(
    (cascadeLevel) => {
      if (cascadeLevel >= 4 && !feverRef.current) triggerFever();
    },
    [triggerFever]
  );

  // ── Floaters ────────────────────────────────────────────────────────────
  // Each match pushes a "+N" floater that lives 1.2s. Cap the array at
  // FLOATER_CAP so long cascades don't balloon the DOM; when full we drop
  // the oldest entry.
  const FLOATER_CAP = 20;
  const addFloater = useCallback((text, px, py, type) => {
    const id = Date.now() + Math.random();
    setFloaters((f) => {
      const entry = { id, text, px, py, type };
      return f.length >= FLOATER_CAP ? [...f.slice(1), entry] : [...f, entry];
    });
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1200);
  }, []);

  // ── Board shake ─────────────────────────────────────────────────────────
  const shakeBoard = useCallback(() => {
    if (!pgRef.current) return;
    pgRef.current.classList.remove("shake");
    void pgRef.current.offsetWidth; // reflow
    pgRef.current.classList.add("shake");
    setTimeout(() => pgRef.current?.classList.remove("shake"), 420);
  }, []);

  // ── Game over ───────────────────────────────────────────────────────────
  // Single entry point for ending the run — called from both timeout and
  // no-valid-moves paths. Stops audio, persists the score, and fades to the
  // game over screen after a short shake.
  const triggerGameOver = useCallback(
    (reason) => {
      gameOvRef.current = true;
      AUDIO.suspendAll();
      AUDIO.sfx("over");
      setTimeout(() => AUDIO.stopMusic(), 2200);
      setBestInfo(saveBest(scoreRefForSave.current));
      bumpStats(scoreRefForSave.current, bestStreakRef.current);
      setGoReason(reason);
      shakeBoard();
      setTimeout(() => setGameOver(true), 700);
    },
    [shakeBoard]
  );
  triggerGameOverRef.current = triggerGameOver;

  // ── Banner ──────────────────────────────────────────────────────────────
  // Show a brief text banner over the board. If another banner is already
  // on screen, it's replaced only when the incoming `priority` is high
  // enough — low-priority banners (like "no match") never interrupt a
  // bigger one (like "DOUBLE PRISM!").
  function showBanner(text, type = "", dur = 1400, priority = 1) {
    if (bannerTimer.current) {
      if (priority <= 0) return;
      clearTimeout(bannerTimer.current);
    }
    setBanner({ text, type });
    bannerTimer.current = setTimeout(() => setBanner(null), dur);
  }

  // ── Milestone check ─────────────────────────────────────────────────────
  const checkMilestone = useCallback((newScore) => {
    if (newScore >= nextMilestone.current) {
      const mmax = getMaxMs(movesRef.current);
      remainingRef.current = Math.min(remainingRef.current + 5000, mmax);
      AUDIO.sfx("milestone");
      showBanner(
        `🏆 ${(nextMilestone.current / 1000).toFixed(0)}K MILESTONE! +5s`,
        "milestone",
        1400,
        0
      );
      nextMilestone.current += MILESTONE;
    }
  }, []);

  // ── Cascade ─────────────────────────────────────────────────────────────
  // Resolve a single cascade pass: find matches, expand by specials, apply
  // score + effects, then schedule the next pass after the clear animation.
  // `level` is the cascade depth (1 = initial match, 2+ = chain reactions).
  const cascade = useCallback(
    (b, level) => {
      // Handle any prism that was activated this move. `wasWild` gems clear
      // every gem of their adopted colour (even chained ones). If the prism
      // absorbed a power-up during the swap, that effect fires too.
      let wildcardUsed = false;
      const wildcardClears = new Set();
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if (!b[r][c]?.wasWild) continue;
          wildcardUsed = true;
          const col = b[r][c].c;
          for (let rr = 0; rr < ROWS; rr++)
            for (let cc = 0; cc < COLS; cc++) {
              if (b[rr][cc]?.c === col) {
                if (b[rr][cc].chained) b[rr][cc].chained = null; // break any chains first
                wildcardClears.add(`${rr},${cc}`);
              }
            }
          wildcardClears.add(`${r},${c}`);

          const pType = b[r][c].type;
          if (pType === "zap") {
            addCross(wildcardClears, r, c);
            AUDIO.sfx("zap");
          }
          if (pType === "bomb") {
            addRect(wildcardClears, r, c, 2);
            AUDIO.sfx("bomb");
          }
          if (pType === "inferno") {
            addCheckered(wildcardClears, (r + c) % 2);
            AUDIO.sfx("inferno");
          }
          if (pType === "vortex") {
            addAll(wildcardClears);
            AUDIO.sfx("vortex");
          }
          b[r][c].wasWild = false;
        }
      if (wildcardUsed) {
        AUDIO.sfx("wildcard");
        showBanner("\u2726 PRISM!", "vortex", 1800, 8);
        shakeBoard();
      }

      // Regular match scan + any prism-driven clears rolled in.
      const { matched, toCreate } = findMatches(b);
      for (const k of wildcardClears) matched.add(k);

      // No matches — the cascade chain is done.
      if (matched.size === 0) {
        setTimeout(() => {
          if (!hasValidMove(b)) triggerGameOver("nomoves");
          busyRef.current = false;
          setBusy(false);
          setCombo(0);
        }, 0);
        return;
      }

      const toClear = expandForSpecials(b, matched);
      const label = comboLabel(b, matched);

      // Collect every special involved so we can score/combo based on them.
      const specTypes = [];
      for (const k of matched) {
        const { r, c } = parseKey(k);
        if (b[r]?.[c]?.type && b[r][c].type !== "normal") specTypes.push(b[r][c].type);
      }

      // 3+ combat specials in a single match upgrade the spawn to a vortex.
      const combatSpecs = specTypes.filter((s) => s === "zap" || s === "bomb" || s === "inferno");
      if (combatSpecs.length >= 3 && !specTypes.includes("vortex")) {
        let sr = 0,
          sc = 0,
          n = 0;
        for (const k of matched) {
          const { r, c } = parseKey(k);
          sr += r;
          sc += c;
          n++;
        }
        const vr = Math.round(sr / n),
          vc = Math.round(sc / n);
        const vcolor = b[vr]?.[vc]?.c || COLORS[0];
        toCreate.length = 0;
        toCreate.push({ type: "vortex", r: vr, c: vc, color: vcolor });
      }

      const pts = calcScore(toClear.size, specTypes, level, feverRef.current);

      // Score floater at the centre of the match.
      const { px, py } = matchCentroid(matched);
      const floatType = specTypes.includes("vortex")
        ? "vortex"
        : specTypes.includes("inferno")
          ? "inferno"
          : specTypes.includes("bomb")
            ? "bomb"
            : specTypes.includes("zap")
              ? "zap"
              : feverRef.current
                ? "fever"
                : "normal";
      const floatText =
        feverRef.current && !specTypes.length
          ? `🔥+${pts.toLocaleString()}`
          : `+${pts.toLocaleString()}`;
      addFloater(floatText, px, py, floatType);

      // Apply points (streak multiplier + wildcard bonus baked in).
      const wildcardBonus = wildcardUsed ? 10000 : 0;
      setScore((s) => {
        const smult = streakMult(streakRef.current);
        const ns = s + Math.round(pts * smult) + wildcardBonus;
        scoreRefForSave.current = ns;
        checkMilestone(ns);
        return ns;
      });

      // One-shot multiplier tiles — consumed whenever they're cleared, no
      // matter the cause. Each multiplier stacks.
      let cascadeMult = 1;
      for (const k of toClear) {
        const { r, c } = parseKey(k);
        const t = b[r]?.[c]?.type;
        if (t === "mult2" || t === "mult5" || t === "mult10") {
          cascadeMult *= t === "mult10" ? 10 : t === "mult5" ? 5 : 2;
          AUDIO.sfx(t);
          setBoardFlash(t);
          setTimeout(() => setBoardFlash(null), 600);
        }
      }
      // Apply one-shot mult to the score we already added
      if (cascadeMult > 1) {
        setScore((s) => {
          const bonus = Math.round(pts * streakMult(streakRef.current) * (cascadeMult - 1));
          const ns = s + bonus;
          scoreRefForSave.current = ns;
          return ns;
        });
      }
      // If a shuffle power-up was triggered, mark it so finalize can reshuffle
      // the board after the match animation. We demote the gem back to normal
      // so it doesn't retrigger on the next cascade pass.
      let doShuffle = false;
      for (const k of matched) {
        const { r, c } = parseKey(k);
        if (b[r]?.[c]?.type === "shuffle") {
          AUDIO.sfx("shuffle");
          shuffleEffectRef.current = performance.now();
          b[r][c].type = "normal";
          doShuffle = true;
          break;
        }
      }

      // Streak bookkeeping and cascade depth counter.
      streakRef.current += 1;
      if (streakRef.current > bestStreakRef.current) bestStreakRef.current = streakRef.current;
      setStreak(streakRef.current);
      setCombo(level);
      setFreshGems(new Set());
      checkFever(level);

      // Pick the loudest SFX for whatever combination of specials triggered.
      const isInferno = specTypes.includes("inferno") && !specTypes.includes("vortex");
      if (specTypes.includes("vortex")) {
        AUDIO.sfx("vortex");
        shakeBoard();
      } else if (isInferno) {
        AUDIO.sfx("inferno");
        shakeBoard();
        setTimeout(shakeBoard, 250);
        setTimeout(shakeBoard, 500);
      } else if (specTypes.includes("bomb")) {
        AUDIO.sfx("bomb");
        if (specTypes.length >= 2) shakeBoard();
      } else if (specTypes.includes("zap")) {
        AUDIO.sfx("zap");
      } else {
        const { r, c } = parseKey([...matched][0]);
        AUDIO.sfx("match", b[r]?.[c]?.c || "r");
      }
      if (level > 2) AUDIO.sfx("cascade", level);

      // Banner text — prioritized from most impressive (chain vortex) down.
      if (combatSpecs.length >= 3 && !specTypes.includes("vortex")) {
        showBanner(`🌀 CHAIN VORTEX SPAWNED!  +${pts.toLocaleString()}`, "vortex", 2200, 7);
      } else if (label) {
        const lp =
          label.type === "vortex"
            ? 7
            : label.type === "inferno" || label.type === "bomb"
              ? 6
              : label.type === "zap"
                ? 5
                : 4;
        showBanner(`${label.text}  +${pts.toLocaleString()}`, label.type, 1800, lp);
      } else if (level >= 3) {
        showBanner(`×${level} CASCADE!`, "", 1000, 2);
      }

      // Apply the match: clear the cells, spawn the new power-ups, shuffle
      // (if requested), then let gravity refill and schedule the next cascade
      // pass in case the drop created new matches.
      const finalize = () => {
        setClr(new Set());
        vfxSpawned.current.clear();

        const next = b.map((r) => [...r]);
        for (const k of toClear) {
          const { r, c } = parseKey(k);
          next[r][c] = null;
        }
        for (const sp of toCreate) {
          if (next[sp.r][sp.c] === null) {
            next[sp.r][sp.c] = { c: sp.color, type: sp.type, id: ++_id };
          }
        }

        if (doShuffle) {
          // Collect every remaining gem and scramble their positions
          // in-place with a Fisher–Yates shuffle.
          const cells = [];
          for (let rr = 0; rr < ROWS; rr++)
            for (let cc = 0; cc < COLS; cc++) {
              if (next[rr][cc]) cells.push({ r: rr, c: cc });
            }
          const sg = cells.map((p) => next[p.r][p.c]);
          for (let i = sg.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sg[i], sg[j]] = [sg[j], sg[i]];
          }
          cells.forEach((p, i) => {
            next[p.r][p.c] = sg[i];
          });
        }

        const { board: filled, fresh, drops } = dropAndFill(next, scoreRefForSave.current);
        dropsRef.current = drops;
        dropStart.current = performance.now();
        setBoard(filled);
        setFreshGems(fresh);
        if (fresh._hasPrism) AUDIO.sfx("prismSpawn");

        // Try another cascade pass after the drop-in finishes animating.
        pauseAwareTimeout(() => {
          setFreshGems(new Set());
          cascade(filled, level + 1);
        }, 380);
      };

      if (isInferno) {
        // Inferno: sweep outward from the inferno gem so cells clear in a
        // visible expanding ring over 700 ms, then finalize.
        let ep = { r: ROWS / 2, c: COLS / 2 };
        for (const k of matched) {
          const { r, c } = parseKey(k);
          if (b[r]?.[c]?.type === "inferno") {
            ep = { r, c };
            break;
          }
        }
        const keys = [...toClear].sort((a, b) => {
          const pa = parseKey(a),
            pb = parseKey(b);
          return Math.hypot(pa.r - ep.r, pa.c - ep.c) - Math.hypot(pb.r - ep.r, pb.c - ep.c);
        });
        const SWEEP = 700;
        const step = SWEEP / Math.max(1, keys.length);
        const growing = new Set();
        keys.forEach((k, i) =>
          pauseAwareTimeout(() => {
            growing.add(k);
            setClr(new Set(growing));
          }, i * step)
        );
        pauseAwareTimeout(finalize, SWEEP + 180);
      } else {
        // Normal match — show the clear animation then finalize.
        setClr(toClear);
        pauseAwareTimeout(finalize, 520);
      }
    },
    [addFloater, shakeBoard, checkMilestone, checkFever, triggerGameOver]
  );

  // ── Swap ────────────────────────────────────────────────────────────────
  const attemptSwap = useCallback(
    (r1, c1, r2, c2, dir) => {
      if (busyRef.current || gameOvRef.current || pausedRef.current) return;
      if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return;

      // Chained gems can't be swapped — unless you're using a prism, which
      // can break the chain by wildcarding into it.
      const hasPrism = board[r1][c1]?.c === "w" || board[r2]?.[c2]?.c === "w";
      if (!hasPrism && (board[r1][c1]?.chained || board[r2]?.[c2]?.chained)) {
        AUDIO.sfx("nomatch");
        setShake({ key: `${r1},${c1}`, dir });
        setTimeout(() => setShake(null), 430);
        showBanner("chained!", "bad", 700, 0);
        setSel(null);
        return;
      }

      const sw = board.map((r) => [...r]);
      const gem1 = sw[r1][c1],
        gem2 = sw[r2][c2];
      // Double prism merge — clear entire board + massive bonus
      if (gem1?.c === "w" && gem2?.c === "w") {
        movesRef.current += 1;
        startedRef.current = true;
        addBonus();
        if (limitRef.current)
          limitRef.current.textContent = `LIMIT: ${(getMaxMs(movesRef.current) / 1000).toFixed(1)}s`;
        setSel(null);
        setBusy(true);
        busyRef.current = true;
        // Slide the swiped prism toward the other prism first. hiddenCellsRef
        // is a Set keyed by "r,c" so the draw loop can do O(1) lookups.
        hiddenCellsRef.current = new Set([`${r1},${c1}`, `${r2},${c2}`]);
        prismSlideRef.current = {
          fromR: r1,
          fromC: c1,
          toR: r2,
          toC: c2,
          start: performance.now(),
          dur: 200,
          gemColor: "w",
        };
        pauseAwareTimeout(() => {
          prismSlideRef.current = null;
          hiddenCellsRef.current = null;
          AUDIO.sfx("doublePrism");
          showBanner("\u2726\u2726 DOUBLE PRISM!! \u2726\u2726", "vortex", 3000, 99);
          const boardCx = PAD + (COLS * CELL) / 2,
            boardCy = PAD + (ROWS * CELL) / 2;
          vfxRef.current.push({
            type: "wildcardBlast",
            x: boardCx,
            y: boardCy,
            start: performance.now(),
            dur: 800,
          });
          const bonus = 100000;
          setScore((s) => {
            const ns = s + bonus;
            scoreRefForSave.current = ns;
            checkMilestone(ns);
            return ns;
          });
          addFloater(`+${bonus.toLocaleString()}`, boardCx, boardCy, "vortex");
          shakeBoard();
          setTimeout(shakeBoard, 300);
          setTimeout(shakeBoard, 600);
          // Restore full board then mark all as clearing
          setBoard(board.map((row) => [...row]));
          const allKeys = new Set();
          for (let rr = 0; rr < ROWS; rr++)
            for (let cc = 0; cc < COLS; cc++) allKeys.add(`${rr},${cc}`);
          setClr(allKeys);
          // After clear animation, drop in a fresh clean board
          pauseAwareTimeout(() => {
            setClr(new Set());
            vfxSpawned.current.clear();
            const nb = initBoard();
            const fresh = new Set();
            for (let rr = 0; rr < ROWS; rr++)
              for (let cc = 0; cc < COLS; cc++) fresh.add(`${rr},${cc}`);
            setBoard(nb);
            setFreshGems(fresh);
            pauseAwareTimeout(() => {
              setFreshGems(new Set());
              busyRef.current = false;
              setBusy(false);
              setCombo(0);
            }, 500);
          }, 600);
        }, 220); // end of slide timeout
        return;
      }
      // Wildcard: the swiped gem (r1,c1) slides toward the target (r2,c2)
      let wildcardActivated = false;
      let prismPos = null,
        gemPos = null,
        gemColor = null;
      if (gem1?.c === "w" && gem2?.c && gem2.c !== "w") {
        prismPos = { r: r1, c: c1 };
        gemPos = { r: r2, c: c2 };
        gemColor = gem2.c;
        wildcardActivated = true;
      } else if (gem2?.c === "w" && gem1?.c && gem1.c !== "w") {
        prismPos = { r: r2, c: c2 };
        gemPos = { r: r1, c: c1 };
        gemColor = gem1.c;
        wildcardActivated = true;
      }
      if (wildcardActivated) {
        movesRef.current += 1;
        startedRef.current = true;
        addBonus();
        if (limitRef.current)
          limitRef.current.textContent = `LIMIT: ${(getMaxMs(movesRef.current) / 1000).toFixed(1)}s`;
        setSel(null);
        setBusy(true);
        busyRef.current = true;
        // Capture powerup type from whichever gem had one
        const nonPrismGem = gem1?.c === "w" ? gem2 : gem1;
        const prismGem = gem1?.c === "w" ? gem1 : gem2;
        const targetPowerup =
          nonPrismGem?.type && nonPrismGem.type !== "normal"
            ? nonPrismGem.type
            : prismGem?.type && prismGem.type !== "normal"
              ? prismGem.type
              : "normal";
        // Build board with both cells nulled (invisible) but wasWild marker for cascade
        const finalBoard = board.map((row) => [...row]);
        finalBoard[r1][c1] = null;
        finalBoard[r2][c2] = null;
        // Store wasWild info in a hidden cell that cascade will find
        // Place it at prismPos temporarily — it'll be consumed by cascade immediately
        const cascadeBoard = board.map((row) => [...row]);
        cascadeBoard[gemPos.r][gemPos.c] = null;
        cascadeBoard[prismPos.r][prismPos.c] = {
          c: gemColor,
          wasWild: true,
          type: targetPowerup,
          id: ++_id,
        };
        // Hide both cells via a "r,c" Set so the draw loop can O(1) skip them.
        hiddenCellsRef.current = new Set([`${r1},${c1}`, `${r2},${c2}`]);
        // Animate swiped gem sliding toward target
        const slideTexColor = gem1?.c === "w" ? "w" : gem1.c;
        prismSlideRef.current = {
          fromR: r1,
          fromC: c1,
          toR: r2,
          toC: c2,
          start: performance.now(),
          dur: 200,
          gemColor: slideTexColor,
        };
        // After slide, both disappear — set nulled board then cascade with wasWild board
        pauseAwareTimeout(() => {
          prismSlideRef.current = null;
          hiddenCellsRef.current = null;
          setBoard(finalBoard); // both cells null — nothing visible
          // Cascade uses the board with wasWild marker so it triggers the color clear
          pauseAwareTimeout(() => cascade(cascadeBoard, 1), 40);
        }, 220);
        return;
      }
      // Normal swap — speculatively swap and check if it produces a match.
      // If not, shake and revert; if so, animate the swap then run cascade.
      [sw[r1][c1], sw[r2][c2]] = [sw[r2][c2], sw[r1][c1]];
      if (findMatches(sw).matched.size === 0) {
        AUDIO.sfx("nomatch");
        streakRef.current = 0;
        setStreak(0);
        setShake({ key: `${r1},${c1}`, dir });
        setTimeout(() => setShake(null), 430);
        showBanner("no match", "bad", 700, 0);
        setSel(null);
        return;
      }

      movesRef.current += 1;
      startedRef.current = true;
      addBonus();
      if (limitRef.current) {
        limitRef.current.textContent = `LIMIT: ${(getMaxMs(movesRef.current) / 1000).toFixed(1)}s`;
      }
      setSel(null);
      setBusy(true);
      busyRef.current = true;

      // Slide the two gems past each other, then commit the swap and cascade.
      swapAnimRef.current = { r1, c1, r2, c2, start: performance.now(), dur: 150 };
      pauseAwareTimeout(() => {
        swapAnimRef.current = null;
        setBoard(sw);
        pauseAwareTimeout(() => cascade(sw, 1), 40);
      }, 160);
    },
    [board, cascade, addBonus]
  );

  const audioInited = useRef(false);
  const ensureAudio = () => {
    AUDIO.init();
    if (!audioInited.current) {
      AUDIO.setMusicMuted(musicMuted);
      AUDIO.setSfxMuted(sfxMuted);
      audioInited.current = true;
    }
    AUDIO.resume();
    AUDIO.resumeAll();
    // Only start music during gameplay — keep the menu screen silent.
    if (screen === "play" && !AUDIO.musicMuted) {
      AUDIO.startMusic();
      musicReady.current = true;
    }
  };

  const pauseGame = useCallback(() => {
    if (gameOvRef.current || pausedRef.current) return;
    AUDIO.sfx("pause");
    pausedRef.current = true;
    setPaused(true);
    // Defer audio suspend one frame so the pause SFX gets a chance to play.
    requestAnimationFrame(() => AUDIO.suspendAll());
  }, []);

  const resumeGame = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    AUDIO.resumeFromPause();
    musicReady.current = true;
    setTimeout(() => AUDIO.sfx("pause"), 150);
  }, []);

  // Pause-menu callbacks. PauseOverlay is memoized, so we need stable
  // function references — we route through a ref that always reads the
  // latest values, which means the callbacks themselves never change.
  const pauseMenuRef = useRef({ confirmAction: null, reset: null, backToMenu: null });
  useEffect(() => {
    pauseMenuRef.current = { confirmAction, reset, backToMenu };
  });
  const onPauseConfirm = useCallback(() => {
    const m = pauseMenuRef.current;
    setConfirmAction(null);
    if (m.confirmAction === "reset") m.reset?.();
    else m.backToMenu?.();
  }, []);
  const onPauseCancel = useCallback(() => setConfirmAction(null), []);
  const onPauseReset = useCallback(() => setConfirmAction("reset"), []);
  const onPauseMenu = useCallback(() => setConfirmAction("menu"), []);

  // Auto-pause when the tab or app goes to the background.
  // Resume is always user-driven (they tap the Resume button), so we only
  // handle the hide side here.
  useEffect(() => {
    const onHide = () => {
      if (screen === "play" && !gameOvRef.current && !pausedRef.current) {
        pauseGame();
      } else {
        AUDIO.suspendAll();
      }
    };
    const onVis = () => {
      if (document.hidden) onHide();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
    };
  }, [screen, pauseGame]);

  // Android hardware back button — navigate in-game instead of closing
  useEffect(() => {
    // Push a dummy history state so back button triggers popstate instead of closing
    window.history.pushState({ prism: true }, "", " ");
    const onBack = (e) => {
      e.preventDefault();
      // Re-push state so back button keeps working
      window.history.pushState({ prism: true }, "", " ");
      if (screen === "play" && !gameOvRef.current && !pausedRef.current) {
        pauseGame();
      }
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [screen, pauseGame]);

  const toggleMusic = useCallback(() => {
    AUDIO.init();
    AUDIO.resumeAll();
    const n = !musicMuted;
    setMusicMuted(n);
    AUDIO.setMusicMuted(n);
    STORAGE.set("prism_music_muted", n);
    if (!n) {
      musicReady.current = false;
      AUDIO.startMusic();
      musicReady.current = true;
    }
  }, [musicMuted]);

  const toggleSfx = useCallback(() => {
    AUDIO.init();
    AUDIO.resumeAll();
    const n = !sfxMuted;
    setSfxMuted(n);
    AUDIO.setSfxMuted(n);
    STORAGE.set("prism_sfx_muted", n);
  }, [sfxMuted]);

  // ── Canvas board draw loop ──────────────────────────────────────────────
  const CELL = PX + GAP;
  // Pre-computed key grid to avoid string concatenation per frame
  const KEYS = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_2, c) => `${r},${c}`)
  );
  const PAD = 7;
  const CW = COLS * CELL - GAP + PAD * 2;
  const CH = ROWS * CELL - GAP + PAD * 2;
  const DPR = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  useEffect(() => {
    if (screen !== "play") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let running = true;
    let pausedAt = 0;
    let pauseOffset = 0;

    // Pre-compute outline positions per colour. The old code scanned the
    // full 8×8 board twice per colour every frame (~640 lookups at 60 FPS);
    // we now pay that cost once per board change instead.
    const outlinesByColor = {};
    for (const ck of COLORS) outlinesByColor[ck] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const gc = board[r]?.[c]?.c;
        if (outlinesByColor[gc]) outlinesByColor[gc].push([PAD + c * CELL, PAD + r * CELL]);
      }

    const draw = (now) => {
      if (!running) return;
      // Freeze animation time while paused
      if (pausedRef.current) {
        if (!pausedAt) pausedAt = now;
        drawRaf.current = requestAnimationFrame(draw);
        return;
      }
      if (pausedAt) {
        pauseOffset += now - pausedAt;
        pausedAt = 0;
      }
      now -= pauseOffset;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save();
      ctx.scale(DPR, DPR);
      const t = now / 1000;

      // Colored cell outlines — batched by color, drawn from the cache.
      for (const ck of COLORS) {
        const pal = PAL[ck];
        const rects = outlinesByColor[ck];
        if (!pal || !rects.length) continue;

        // Outer glow pass
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = pal.fill;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < rects.length; i++) {
          const [gx, gy] = rects[i];
          ctx.rect(gx, gy, PX, PX);
        }
        ctx.stroke();

        // Inner edge pass
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < rects.length; i++) {
          const [gx, gy] = rects[i];
          ctx.rect(gx + 1, gy + 1, PX - 2, PX - 2);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const hcs = hiddenCellsRef.current;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const g = board[r]?.[c];
          if (!g) continue;
          const key = KEYS[r][c];
          if (hcs && hcs.has(key)) continue; // hidden during prism slide

          const isClr = clr.has(key);
          const isFresh = freshGems.has(key);
          const isSel = sel?.r === r && sel?.c === c;
          const isShake = shake?.key === key;
          let x = PAD + c * CELL,
            y = PAD + r * CELL;
          let scale = 1,
            alpha = 1,
            rot = 0;
          // Swap animation — slide gems toward each other's positions
          const sa = swapAnimRef.current;
          if (sa) {
            const sp = Math.min(1, (performance.now() - sa.start) / sa.dur);
            const ease = sp * (2 - sp); // ease-out
            if (r === sa.r1 && c === sa.c1) {
              x += (sa.c2 - sa.c1) * CELL * ease;
              y += (sa.r2 - sa.r1) * CELL * ease;
            }
            if (r === sa.r2 && c === sa.c2) {
              x += (sa.c1 - sa.c2) * CELL * ease;
              y += (sa.r1 - sa.r2) * CELL * ease;
            }
          }
          // Shuffle trippy effect — wobble, spin, color shift
          const shuffleElapsed = (now - shuffleEffectRef.current) / 1000;
          if (shuffleEffectRef.current && shuffleElapsed < 0.8) {
            const sp = shuffleElapsed / 0.8;
            const intensity = sp < 0.4 ? sp / 0.4 : 1 - (sp - 0.4) / 0.6; // ramp up then down
            x += Math.sin(now / 40 + r * 3 + c * 7) * 6 * intensity;
            y += Math.cos(now / 35 + c * 5 + r * 4) * 6 * intensity;
            rot = Math.sin(now / 50 + r * 2 + c * 3) * 0.3 * intensity;
            scale = 1 + Math.sin(now / 30 + r + c) * 0.12 * intensity;
          }
          // Drop animation — smooth bounce landing (new gems)
          if (isFresh) {
            if (!freshStart.current) freshStart.current = now; // sync to first actual draw frame
            const delay = r * 0.045;
            const elapsed = Math.max(0, (now - freshStart.current) / 1000 - delay);
            const dur = 0.55;
            if (elapsed < dur) {
              const p = Math.min(1, elapsed / dur);
              let ease;
              if (p < 0.6) {
                ease = p / 0.6;
                ease = ease * ease * (3 - 2 * ease);
              } else if (p < 0.8) {
                const b2 = (p - 0.6) / 0.2;
                ease = 1 + 0.08 * Math.sin(b2 * Math.PI);
              } else {
                const b2 = (p - 0.8) / 0.2;
                ease = 1 + 0.08 * (1 - b2) * Math.sin(Math.PI);
              }
              const fromY = y - 72;
              y = fromY + (y - fromY) * ease;
              scale = 0.7 + (1 - 0.7) * Math.min(1, ease);
              if (p > 0.55 && p < 0.75) {
                const sq = (p - 0.55) / 0.2;
                scale = 1 + 0.06 * Math.sin(sq * Math.PI);
              }
              alpha = Math.min(1, p * 2.5);
            }
          }
          // Existing gems that dropped — smooth fall
          const dropDist = dropsRef.current[key];
          if (!isFresh && dropDist && dropDist > 0) {
            const elapsed = (now - dropStart.current) / 1000;
            const dur = 0.3 + dropDist * 0.04; // slightly longer for bigger drops
            if (elapsed < dur) {
              const p = Math.min(1, elapsed / dur);
              // Smooth ease-out with slight bounce
              let ease;
              if (p < 0.75) {
                ease = p / 0.75;
                ease = ease * (2 - ease);
              } // ease-out
              else {
                const b2 = (p - 0.75) / 0.25;
                ease = 1 + 0.04 * Math.sin(b2 * Math.PI);
              } // tiny bounce
              const fromY = y - dropDist * CELL;
              y = fromY + (y - fromY) * ease;
            } else {
              delete dropsRef.current[key];
            }
          }
          // Clear animation — with white cell flash
          if (isClr) {
            const elapsed = (now - clearStart.current) / 1000;
            const dur = 0.5;
            const p = Math.min(1, elapsed / dur);
            if (p < 0.16) {
              scale = 1 + 0.32 * (p / 0.16);
            } else {
              const q = (p - 0.16) / 0.84;
              scale = Math.max(0, 1.32 - 1.32 * q);
              rot = 0.96 * q * Math.PI;
              alpha = Math.max(0, 1 - q * 1.5);
            }
            // White cell glow flash — brightest at start, fades
            const flashAlpha = p < 0.2 ? (p / 0.2) * 0.7 : Math.max(0, 0.7 * (1 - (p - 0.2) / 0.3));
            if (flashAlpha > 0) {
              ctx.save();
              ctx.globalAlpha = flashAlpha;
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x, y, PX, PX);
              ctx.restore();
            }
          }
          // Shake
          if (isShake) {
            const elapsed = (now - shakeStart.current) / 1000;
            const dur = 0.38;
            if (elapsed < dur) {
              const p = elapsed / dur;
              const off = Math.sin(p * Math.PI * 5) * 7 * (1 - p);
              if (shake.dir === "h") x += off;
              else y += off;
            }
          }
          // Selection pulse
          if (isSel) {
            scale = 1.13 + 0.03 * Math.sin(t * 7);
          }
          // Glow halo
          const pal = PAL[g.c];
          const phase = ((g.id * 137) % 280) * 0.01;
          const speed = 2.4 + (g.id % 5) * 0.28;
          const gp = Math.sin(((t + phase) * Math.PI * 2) / speed);
          const glowAlpha = 0.15 + 0.2 * (gp * 0.5 + 0.5);
          const glowScale = 0.92 + 0.14 * (gp * 0.5 + 0.5);
          const cx = x + PX / 2,
            cy = y + PX / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
          ctx.globalAlpha = alpha;
          // Glow halo — pre-rendered texture (no createRadialGradient per frame)
          ctx.globalAlpha = alpha * (0.3 + 0.35 * (gp * 0.5 + 0.5));
          const glowTex = GEM_TEXTURES["glow_" + g.c];
          if (glowTex) {
            const gs2 = glowTex.width * glowScale;
            ctx.drawImage(glowTex, -gs2 / 2, -gs2 / 2, gs2, gs2);
          }
          // Prism extra sparkle (lightweight — just 4 dots, no gradients)
          if (g.c === "w") {
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = "#ffffff";
            for (let sp = 0; sp < 4; sp++) {
              const spA = (sp * Math.PI) / 2 + t * 4;
              const spR = PX * 0.5;
              ctx.beginPath();
              ctx.arc(Math.cos(spA) * spR, Math.sin(spA) * spR, 1.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          // Gem texture
          ctx.globalAlpha = alpha * (0.92 + 0.08 * (gp * 0.5 + 0.5));
          const gs = PX * 0.82;
          if (GEM_TEXTURES[g.c]) ctx.drawImage(GEM_TEXTURES[g.c], -gs / 2, -gs / 2, gs, gs);
          // Selection glow ring
          if (isSel) {
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = pal.fill;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, PX * 0.54, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, PX * 0.52, 0, Math.PI * 2);
            ctx.stroke();
          }
          // (glow handled by halo above — no per-gem ring)
          // Special overlays
          ctx.globalAlpha = alpha;
          if (g.type === "zap") {
            // Horizontal + vertical bars: cyan gradient with white center + cyan glow
            ctx.save();
            ctx.shadowColor = "rgba(0,220,255,0.9)";
            ctx.shadowBlur = 8;
            for (const vertical of [false, true]) {
              const g1 = vertical
                ? ctx.createLinearGradient(0, -PX * 0.4, 0, PX * 0.4)
                : ctx.createLinearGradient(-PX * 0.4, 0, PX * 0.4, 0);
              g1.addColorStop(0, "rgba(0,220,255,0.6)");
              g1.addColorStop(0.18, "#fff");
              g1.addColorStop(0.82, "#fff");
              g1.addColorStop(1, "rgba(0,220,255,0.6)");
              ctx.fillStyle = g1;
              if (vertical) ctx.fillRect(-1.5, -PX * 0.4, 3, PX * 0.8);
              else ctx.fillRect(-PX * 0.4, -1.5, PX * 0.8, 3);
            }
            ctx.restore();
            // Sparks at the outer ends of horizontal bar
            const sparkA = 0.75 + 0.25 * Math.sin(t * 6);
            for (const x of [-PX * 0.42, PX * 0.42]) {
              ctx.save();
              ctx.globalAlpha = sparkA;
              const sg = ctx.createRadialGradient(x, 0, 0, x, 0, 3.5);
              sg.addColorStop(0, "#fff");
              sg.addColorStop(0.5, "rgba(0,220,255,0.8)");
              sg.addColorStop(1, "rgba(0,220,255,0)");
              ctx.fillStyle = sg;
              ctx.beginPath();
              ctx.arc(x, 0, 3.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          if (g.type === "bomb") {
            const bp = 1 + 0.08 * Math.sin(t * 4.8);
            const ba = 0.82 + 0.15 * Math.sin(t * 4.8);
            ctx.save();
            ctx.globalAlpha = ba;
            ctx.shadowColor = "rgba(255,255,255,0.75)";
            ctx.shadowBlur = 10;
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, PX * 0.34 * bp, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          if (g.type === "inferno") {
            drawConicRing(
              ctx,
              0,
              0,
              PX * 0.34,
              PX * 0.42,
              ["#ff2200", "#ff8800", "#ffcc00", "#ff5500", "#ff2200"],
              32,
              t * 9
            );
          }
          if (g.type === "vortex") {
            drawConicRing(
              ctx,
              0,
              0,
              PX * 0.36,
              PX * 0.45,
              ["#ff2255", "#ff8800", "#ffcc22", "#22ee88", "#2299ff", "#cc44ff"],
              48,
              t * 14
            );
            drawConicRing(
              ctx,
              0,
              0,
              PX * 0.22,
              PX * 0.28,
              ["#ffcc22", "#2299ff", "#cc44ff", "#22ee88", "#ff2255"],
              40,
              -t * 14
            );
          }
          if (g.type === "mult2" || g.type === "mult5" || g.type === "mult10") {
            const mv = g.type === "mult10" ? 10 : g.type === "mult5" ? 5 : 2;
            const bk = `badge_${g.type}`;
            const br = PX * 0.22;
            const bx = PX * 0.3,
              by = -PX * 0.28;
            // Use pre-rendered badge texture
            if (GEM_TEXTURES[bk]) {
              ctx.save();
              ctx.translate(bx, by);
              ctx.globalAlpha = 0.4;
              const gc = mv === 10 ? "#ee88ff" : mv === 5 ? "#66ddff" : "#ffd700";
              ctx.fillStyle = gc;
              ctx.beginPath();
              ctx.arc(0, 0, br + 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
              const bTexSz = GEM_TEXTURES[bk].width;
              const bDrawSz = bTexSz / 3; // texture is 3x, draw at 1x
              ctx.drawImage(GEM_TEXTURES[bk], -bDrawSz / 2, -bDrawSz / 2, bDrawSz, bDrawSz);
              ctx.rotate(t * 3.9);
              ctx.strokeStyle = "rgba(255,255,255,0.6)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(0, 0, br - 1, 0, Math.PI * 0.7);
              ctx.stroke();
              ctx.restore();
            }
          }
          if (g.type === "shuffle") {
            const br = PX * 0.22;
            const bx = PX * 0.3,
              by = -PX * 0.28;
            if (GEM_TEXTURES["badge_shuffle"]) {
              ctx.save();
              ctx.translate(bx, by);
              ctx.globalAlpha = 0.4;
              ctx.fillStyle = "#bb44ff";
              ctx.beginPath();
              ctx.arc(0, 0, br + 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
              const bTexSz2 = GEM_TEXTURES["badge_shuffle"].width;
              const bDrawSz2 = bTexSz2 / 3;
              ctx.drawImage(
                GEM_TEXTURES["badge_shuffle"],
                -bDrawSz2 / 2,
                -bDrawSz2 / 2,
                bDrawSz2,
                bDrawSz2
              );
              ctx.rotate(t * 3.9);
              ctx.strokeStyle = "rgba(255,255,255,0.6)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(0, 0, br - 1, 0, Math.PI * 0.7);
              ctx.stroke();
              ctx.restore();
            }
          }
          // Chained overlay — lock + timer (skip if being cleared)
          if (g.chained && !isClr) {
            const remain = Math.max(0, g.chained / 1000);
            const h = PX * 0.35;
            const ly = -h * 0.15; // shift everything up to center
            // Dim overlay
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.arc(0, 0, PX * 0.42, 0, Math.PI * 2);
            ctx.fill();
            // Lock shackle — closed (arc + vertical legs into body)
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = "#778899";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-h * 0.22, ly);
            ctx.lineTo(-h * 0.22, ly - h * 0.2);
            ctx.arc(0, ly - h * 0.2, h * 0.22, Math.PI, 0);
            ctx.lineTo(h * 0.22, ly);
            ctx.stroke();
            // Lock body
            ctx.fillStyle = "#556677";
            ctx.fillRect(-h * 0.38, ly, h * 0.76, h * 0.6);
            // Lock body highlight
            ctx.fillStyle = "#667788";
            ctx.fillRect(-h * 0.38, ly, h * 0.76, h * 0.15);
            // Keyhole
            ctx.fillStyle = "#222833";
            ctx.beginPath();
            ctx.arc(0, ly + h * 0.3, h * 0.07, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-h * 0.025, ly + h * 0.3, h * 0.05, h * 0.18);
            // Timer centered below lock
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 9px system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(Math.ceil(remain).toString(), 0, ly + h * 0.85);
          }
          ctx.restore();
        }
      // Draw prism slide animation
      const ps = prismSlideRef.current;
      if (ps) {
        const pElapsed = (performance.now() - ps.start) / 1000;
        const pP = Math.min(1, pElapsed / (ps.dur / 1000));
        const ease = pP * (2 - pP); // ease-out
        const fx = PAD + ps.fromC * CELL + PX / 2 + (ps.toC - ps.fromC) * CELL * ease;
        const fy = PAD + ps.fromR * CELL + PX / 2 + (ps.toR - ps.fromR) * CELL * ease;
        ctx.save();
        ctx.translate(fx, fy);
        // Draw the gem texture sliding toward the prism
        const pgs = PX * 0.82;
        const slideColor = ps.gemColor || "w";
        ctx.globalAlpha = 1 - pP * 0.3;
        if (GEM_TEXTURES[slideColor])
          ctx.drawImage(GEM_TEXTURES[slideColor], -pgs / 2, -pgs / 2, pgs, pgs);
        // Trail glow
        ctx.globalAlpha = 0.3 * (1 - pP);
        const glowTex = GEM_TEXTURES["glow_" + slideColor] || GEM_TEXTURES["glow_w"];
        if (glowTex)
          ctx.drawImage(
            glowTex,
            -glowTex.width / 2,
            -glowTex.width / 2,
            glowTex.width,
            glowTex.width
          );
        ctx.restore();
      }
      // Draw VFX explosions
      for (let i = vfxRef.current.length - 1; i >= 0; i--) {
        const vfx = vfxRef.current[i];
        const elapsed = (performance.now() - vfx.start) / 1000;
        const p = Math.min(1, elapsed / (vfx.dur / 1000));
        if (p >= 1) {
          vfxRef.current.splice(i, 1);
          continue;
        }
        ctx.save();
        if (vfx.type === "zapBlast") {
          // Full-width lightning bolts — absolute coords, no translate
          const fade = 1 - p;
          function drawPts(pts, width) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let j2 = 1; j2 < pts.length; j2++) ctx.lineTo(pts[j2].x, pts[j2].y);
            ctx.lineWidth = width;
            ctx.stroke();
          }
          ctx.globalAlpha = fade * 0.7;
          ctx.strokeStyle = "#00ccff";
          drawPts(vfx.hBolt, 6 * (1 - p * 0.5) + 2);
          drawPts(vfx.vBolt, 6 * (1 - p * 0.5) + 2);
          ctx.globalAlpha = fade * 0.9;
          ctx.strokeStyle = "#ffffff";
          drawPts(vfx.hCore, 2 * (1 - p) + 1);
          drawPts(vfx.vCore, 2 * (1 - p) + 1);
          // Flash at zap center
          if (p < 0.2) {
            ctx.globalAlpha = ((0.2 - p) / 0.2) * 0.8;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(vfx.x, vfx.y, PX * (1 - p / 0.2) * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (vfx.type === "bombBlast" || vfx.type === "infernoBlast" || vfx.type === "vortexBlast") {
          ctx.translate(vfx.x, vfx.y);
          // Massive fire explosion — shockwave + flames + debris
          const radius = PX * 2.5 * p;
          const fade = 1 - p;
          // Bright white/yellow core flash
          if (p < 0.25) {
            const fp = (0.25 - p) / 0.25;
            ctx.globalAlpha = fp * 0.9;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, 0, PX * 1.2 * fp, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = fp * 0.7;
            ctx.fillStyle = "#ffdd00";
            ctx.beginPath();
            ctx.arc(0, 0, PX * 1.8 * fp, 0, Math.PI * 2);
            ctx.fill();
          }
          // Shockwave ring
          ctx.globalAlpha = fade * 0.7;
          ctx.strokeStyle = "#ff8800";
          ctx.lineWidth = 8 * (1 - p) + 2;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.stroke();
          // Inner fire ring
          ctx.globalAlpha = fade * 0.5;
          ctx.strokeStyle = "#ff4400";
          ctx.lineWidth = 4 * (1 - p) + 1;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
          ctx.stroke();
          // Fire/smoke particles flying outward
          for (let j = 0; j < 16; j++) {
            const a = (j * Math.PI) / 8 + j * 0.5;
            const speed = 0.4 + Math.sin(j * 3.7) * 0.3;
            const d = radius * speed;
            const size = (4 - 3 * p) * (1 + Math.sin(j * 1.3) * 0.3);
            // Orange/red particles
            ctx.globalAlpha = fade * (0.4 + Math.sin(j * 2.1) * 0.2);
            ctx.fillStyle = j % 3 === 0 ? "#ffaa00" : j % 3 === 1 ? "#ff4400" : "#ff6600";
            ctx.beginPath();
            ctx.arc(Math.cos(a) * d, Math.sin(a) * d, size, 0, Math.PI * 2);
            ctx.fill();
          }
          // Dark smoke trail
          if (p > 0.3) {
            const sp = (p - 0.3) / 0.7;
            ctx.globalAlpha = (1 - sp) * 0.2;
            ctx.fillStyle = "#222222";
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (vfx.type === "shuffleBlast") {
          // Swirling shuffle effect — spinning particles around center
          ctx.translate(vfx.x, vfx.y);
          const fade = 1 - p;
          const radius = PX * 1.2;
          for (let j = 0; j < 10; j++) {
            const a = (j * Math.PI) / 5 + p * 12;
            const d = radius * p * (0.5 + Math.sin(j * 1.7) * 0.3);
            const size = 3 * (1 - p) + 1;
            ctx.globalAlpha = fade * 0.7;
            ctx.fillStyle = ["#00d4ff", "#9d00ff", "#ff00aa", "#00ffaa", "#ffaa00"][j % 5];
            ctx.beginPath();
            ctx.arc(Math.cos(a) * d, Math.sin(a) * d, size, 0, Math.PI * 2);
            ctx.fill();
          }
          // Central swirl
          ctx.globalAlpha = fade * 0.4;
          ctx.strokeStyle = "#9d00ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, radius * p * 0.5, 0, Math.PI * 1.5);
          ctx.stroke();
        }
        if (vfx.type === "unchainBlast") {
          // Chain links breaking apart
          ctx.translate(vfx.x, vfx.y);
          const fade = 1 - p;
          ctx.strokeStyle = "#aaaacc";
          ctx.lineWidth = 1.5;
          for (let j = 0; j < 6; j++) {
            const a = (j * Math.PI) / 3 + p * 2;
            const d = PX * 0.8 * p;
            ctx.globalAlpha = fade * 0.7;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.5 * (1 - p) + 0.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          // White flash
          if (p < 0.15) {
            ctx.globalAlpha = ((0.15 - p) / 0.15) * 0.5;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, 0, PX * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (vfx.type === "wildcardBlast") {
          // Brilliant white/purple star burst
          ctx.translate(vfx.x, vfx.y);
          const fade = 1 - p;
          // White flash
          if (p < 0.3) {
            ctx.globalAlpha = ((0.3 - p) / 0.3) * 0.7;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, 0, PX * 2 * (1 - p / 0.3), 0, Math.PI * 2);
            ctx.fill();
          }
          // Light rays shooting outward
          ctx.globalAlpha = fade * 0.8;
          for (let j = 0; j < 8; j++) {
            const a = (j * Math.PI) / 4 + p * 3;
            const len = PX * 3 * p;
            ctx.strokeStyle = j % 2 === 0 ? "#ffffff" : "#cc88ff";
            ctx.lineWidth = 3 * (1 - p) + 1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            ctx.stroke();
          }
          // Sparkle particles
          for (let j = 0; j < 12; j++) {
            const a = (j * Math.PI) / 6 + j * 0.8;
            const d = PX * 2.5 * p * (0.3 + Math.sin(j * 2.3) * 0.3);
            ctx.globalAlpha = fade * 0.6;
            ctx.fillStyle = j % 3 === 0 ? "#ffffff" : j % 3 === 1 ? "#cc88ff" : "#8844cc";
            ctx.beginPath();
            ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2 * (1 - p) + 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      ctx.restore();
      drawRaf.current = requestAnimationFrame(draw);
    };
    drawRaf.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(drawRaf.current);
    };
  }, [screen, board, sel, clr, freshGems, shake]);

  // Track animation start times via refs
  const clearStart = useRef(0);
  const freshStart = useRef(0);
  const dropsRef = useRef({});
  const dropStart = useRef(0);
  const shuffleEffectRef = useRef(0);
  const prismSlideRef = useRef(null); // {fromR,fromC,toR,toC,start,dur}
  const hiddenCellsRef = useRef(null); // [{r,c},...] — cells to skip drawing during slide
  const swapAnimRef = useRef(null); // {r1,c1,r2,c2,start,dur}
  const shakeStart = useRef(0);
  const vfxRef = useRef([]); // visual effects: {type, x, y, start, dur}
  const vfxSpawned = useRef(new Set()); // track which gem keys already got VFX
  useEffect(() => {
    if (clr.size > 0) {
      clearStart.current = performance.now();
      // Skip VFX spawning for full-board clears (double prism handles its own VFX)
      if (clr.size >= ROWS * COLS) {
        return;
      }
      // Spawn explosion VFX for special gems being cleared (only once per gem)
      for (const k of clr) {
        if (vfxSpawned.current.has(k)) continue;
        const { r, c } = parseKey(k);
        const g = board[r]?.[c];
        if (!g) continue;
        if (g.type === "normal" && g.c !== "w") continue; // skip normal gems
        vfxSpawned.current.add(k);
        const px = PAD + c * CELL + PX / 2,
          py = PAD + r * CELL + PX / 2;
        if (g.type === "zap") {
          // Pre-compute jagged bolt points so they don't flicker each frame
          const makeBoltPts = (x1, y1, x2, y2, jag) => {
            const pts = [{ x: x1, y: y1 }];
            const dx = x2 - x1,
              dy = y2 - y1;
            const steps = Math.floor(Math.sqrt(dx * dx + dy * dy) / 8);
            for (let s = 1; s < steps; s++) {
              const t2 = s / steps;
              pts.push({
                x: x1 + dx * t2 + (Math.random() - 0.5) * jag,
                y: y1 + dy * t2 + (Math.random() - 0.5) * jag,
              });
            }
            pts.push({ x: x2, y: y2 });
            return pts;
          };
          const bL = PAD,
            bR = PAD + COLS * CELL - GAP,
            bT = PAD,
            bB = PAD + ROWS * CELL - GAP;
          const ry = PAD + r * CELL + PX / 2,
            cx2 = PAD + c * CELL + PX / 2;
          vfxRef.current.push({
            type: "zapBlast",
            x: px,
            y: py,
            start: performance.now(),
            dur: 600,
            hBolt: makeBoltPts(bL - 10, ry, bR + 10, ry, 12),
            vBolt: makeBoltPts(cx2, bT - 10, cx2, bB + 10, 12),
            hCore: makeBoltPts(bL - 5, ry, bR + 5, ry, 6),
            vCore: makeBoltPts(cx2, bT - 5, cx2, bB + 5, 6),
          });
        }
        if (g.type === "bomb")
          vfxRef.current.push({
            type: "bombBlast",
            x: px,
            y: py,
            start: performance.now(),
            dur: 700,
          });
        if (g.type === "inferno")
          vfxRef.current.push({
            type: "infernoBlast",
            x: px,
            y: py,
            start: performance.now(),
            dur: 900,
          });
        if (g.type === "vortex")
          vfxRef.current.push({
            type: "vortexBlast",
            x: px,
            y: py,
            start: performance.now(),
            dur: 1000,
          });
        if (g.type === "shuffle")
          vfxRef.current.push({
            type: "shuffleBlast",
            x: px,
            y: py,
            start: performance.now(),
            dur: 600,
          });
        if (g.c === "w")
          vfxRef.current.push({
            type: "wildcardBlast",
            x: px,
            y: py,
            start: performance.now(),
            dur: 800,
          });
      }
    }
  }, [clr]);
  useEffect(() => {
    if (freshGems.size > 0) freshStart.current = performance.now();
  }, [freshGems]);
  useEffect(() => {
    if (shake) shakeStart.current = performance.now();
  }, [shake]);

  // Convert a page coordinate to a grid row/col, or null if outside the board.
  const canvasToRC = useCallback((clientX, clientY) => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const x = (clientX - rect.left) * (cv.width / DPR / rect.width) - PAD;
    const y = (clientY - rect.top) * (cv.height / DPR / rect.height) - PAD;
    const c = Math.floor(x / CELL),
      r = Math.floor(y / CELL);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? { r, c } : null;
  }, []);

  // Click/tap: same select-then-swap logic as the DOM handler above.
  const handleCanvasClick = useCallback(
    (e) => {
      const pos = canvasToRC(e.clientX, e.clientY);
      if (!pos) return;
      ensureAudio();
      if (busyRef.current || gameOvRef.current || pausedRef.current) return;

      if (!sel) {
        AUDIO.sfx("select");
        setSel(pos);
        return;
      }
      if (sel.r === pos.r && sel.c === pos.c) {
        setSel(null);
        return;
      }
      const dr = Math.abs(sel.r - pos.r),
        dc = Math.abs(sel.c - pos.c);
      if (dr + dc !== 1) {
        AUDIO.sfx("select");
        setSel(pos);
        return;
      }
      attemptSwap(sel.r, sel.c, pos.r, pos.c, dr === 0 ? "h" : "v");
    },
    [sel, attemptSwap, canvasToRC]
  );

  const handleCanvasTouchStart = useCallback(
    (e) => {
      const pos = canvasToRC(e.touches[0].clientX, e.touches[0].clientY);
      if (!pos) return;
      ensureAudio();
      touchRef.current = { ...pos, x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    [canvasToRC]
  );

  const handleCanvasTouchEnd = useCallback(
    (e) => {
      const t = touchRef.current;
      if (!t) return;
      touchRef.current = null;

      const dx = e.changedTouches[0].clientX - t.x;
      const dy = e.changedTouches[0].clientY - t.y;
      if (Math.sqrt(dx * dx + dy * dy) < 18) return; // ignore taps
      e.preventDefault();

      let tr = t.r,
        tc = t.c,
        dir;
      if (Math.abs(dx) >= Math.abs(dy)) {
        tc += dx > 0 ? 1 : -1;
        dir = "h";
      } else {
        tr += dy > 0 ? 1 : -1;
        dir = "v";
      }
      setSel(null);
      attemptSwap(t.r, t.c, tr, tc, dir);
    },
    [attemptSwap]
  );

  const handleCanvasMouseDown = useCallback(
    (e) => {
      const pos = canvasToRC(e.clientX, e.clientY);
      if (!pos) return;
      ensureAudio();
      if (e.button !== 0) return;

      const startX = e.clientX,
        startY = e.clientY;
      const onUp = (ue) => {
        document.removeEventListener("mouseup", onUp);
        const dx = ue.clientX - startX,
          dy = ue.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) < 12) return;
        let tr = pos.r,
          tc = pos.c,
          dir;
        if (Math.abs(dx) >= Math.abs(dy)) {
          tc += dx > 0 ? 1 : -1;
          dir = "h";
        } else {
          tr += dy > 0 ? 1 : -1;
          dir = "v";
        }
        setSel(null);
        attemptSwap(pos.r, pos.c, tr, tc, dir);
      };
      document.addEventListener("mouseup", onUp);
    },
    [attemptSwap, canvasToRC]
  );

  // "New game" from inside the play screen — unlike backToMenu, we stay on
  // the play screen and re-arm the timer so the next run starts immediately.
  const reset = () => {
    stopTimer();
    AUDIO.stopMusic();
    wipeRunState();

    // Snap the timer bar back to full so there's no awkward decay flicker.
    if (barRef.current) {
      barRef.current.style.transform = "scaleX(1)";
      barRef.current.className = "tbar ok";
      barRef.current.dataset.tier = "ok";
      barRef.current.style.transition = "";
    }
    if (secRef.current) {
      secRef.current.textContent = `${(getMaxMs(0) / 1000).toFixed(1)}s`;
      secRef.current.className = "tsec ok";
      secRef.current.dataset.tier = "ok";
    }
    if (limitRef.current) {
      limitRef.current.textContent = `LIMIT: ${(getMaxMs(0) / 1000).toFixed(1)}s`;
    }

    // Rebuild the board and flag every cell as fresh for the drop-in animation.
    const allFresh = new Set();
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) allFresh.add(`${rr},${cc}`);
    setBoard(initBoard());
    setFreshGems(allFresh);
    freshStart.current = performance.now();
    setTimeout(() => setFreshGems(new Set()), 600);

    remainingRef.current = getMaxMs(0);
    AUDIO.setTempo(118);
    startTimer();
    AUDIO.forceStart();
    musicReady.current = true;
  };

  // Gem preview helper for tutorial — renders pre-rendered textures as data URLs for <img>
  const gemDataUrls = useRef({});
  if (!gemDataUrls.current._built) {
    for (const k of [...COLORS, "w"])
      if (GEM_TEXTURES[k]) gemDataUrls.current[k] = GEM_TEXTURES[k].toDataURL();
    gemDataUrls.current._built = true;
  }
  const GemPreview = ({ keys, size = 36 }) => (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "12px 0" }}>
      {keys.map((k, i) => (
        <img
          key={i}
          src={gemDataUrls.current[k]}
          alt=""
          style={{ width: size, height: size }}
          draggable="false"
        />
      ))}
    </div>
  );

  const G = ({ k, size = 28, hl = false }) => (
    <img
      src={gemDataUrls.current[k]}
      alt=""
      className={hl ? "ts-highlight" : ""}
      style={{ width: size, height: size, display: "block" }}
      draggable="false"
    />
  );

  // Renders a gem at a given size with the exact in-game CSS overlay for powerups/specials
  const TutGem = ({ c = "r", type = "normal", locked = null, size = 36 }) => (
    <div style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <img
        src={gemDataUrls.current[c]}
        alt=""
        style={{
          width: size,
          height: size,
          display: "block",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.4))",
        }}
        draggable="false"
      />
      {type === "zap" && (
        <div className="sp-z">
          <div className="sp-bb h" />
          <div className="sp-bb v" />
        </div>
      )}
      {type === "bomb" && <div className="sp-bm" />}
      {type === "inferno" && <div className="sp-inf" />}
      {type === "vortex" && (
        <>
          <div className="sp-vortex-outer" />
          <div className="sp-vortex-inner" />
        </>
      )}
      {type === "mult2" && <div className="sp-mult">×2</div>}
      {type === "mult5" && <div className="sp-mult sp-mult5">×5</div>}
      {type === "mult10" && <div className="sp-mult sp-mult10">×10</div>}
      {type === "shuffle" && <div className="sp-shuffle">↻</div>}
      {locked != null && (
        <svg
          viewBox="0 0 100 100"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <circle cx="50" cy="50" r="42" fill="rgba(0,0,0,.35)" />
          <path
            d="M 39 44 L 39 36 A 11 11 0 0 1 61 36 L 61 44"
            fill="none"
            stroke="#778899"
            strokeWidth="4.5"
          />
          <rect x="31" y="44" width="38" height="30" fill="#556677" />
          <rect x="31" y="44" width="38" height="7" fill="#667788" />
          <circle cx="50" cy="59" r="3.5" fill="#222833" />
          <rect x="48.75" y="59" width="2.5" height="9" fill="#222833" />
          <text
            x="50"
            y="92"
            textAnchor="middle"
            fontSize="14"
            fontWeight="900"
            fill="#fff"
            fontFamily="Orbitron,sans-serif"
          >
            {locked}
          </text>
        </svg>
      )}
    </div>
  );

  const TutScene = ({ type }) => {
    if (type === "SWAP")
      return (
        <>
          <div className="ts-row">
            <G k="g" hl />
            <span className="ts-swap">⇄</span>
            <G k="r" hl />
            <G k="r" />
          </div>
          <div className="ts-label">tap two adjacent gems to swap</div>
          <div className="ts-row" style={{ marginTop: 10 }}>
            <G k="r" />
            <G k="r" />
            <G k="r" />
            <span className="ts-arrow">→</span>
            <span className="ts-result">✨ MATCH!</span>
          </div>
        </>
      );
    if (type === "POWERUPS")
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="ts-row">
            <G k="r" size={22} />
            <G k="r" size={22} />
            <G k="r" size={22} />
            <G k="r" size={22} />
            <span className="ts-arrow">→</span>
            <TutGem c="r" type="zap" size={32} />
          </div>
          <div className="ts-label" style={{ marginTop: -2 }}>
            match 4 · row+column clear
          </div>
          <div className="ts-row">
            <G k="b" size={22} />
            <G k="b" size={22} />
            <G k="b" size={22} />
            <G k="b" size={22} />
            <G k="b" size={22} />
            <span className="ts-arrow">→</span>
            <TutGem c="b" type="bomb" size={32} />
          </div>
          <div className="ts-label" style={{ marginTop: -2 }}>
            match 5 · area blast
          </div>
          <div className="ts-row">
            <G k="g" size={20} />
            <G k="g" size={20} />
            <G k="g" size={20} />
            <G k="g" size={20} />
            <G k="g" size={20} />
            <G k="g" size={20} />
            <span className="ts-arrow">→</span>
            <TutGem c="g" type="inferno" size={32} />
          </div>
          <div className="ts-label" style={{ marginTop: -2 }}>
            match 6 · burns the board
          </div>
          <div className="ts-row">
            <TutGem c="r" type="zap" size={28} />
            <TutGem c="b" type="bomb" size={28} />
            <TutGem c="g" type="inferno" size={28} />
            <span className="ts-arrow">→</span>
            <TutGem c="p" type="vortex" size={32} />
          </div>
          <div className="ts-label" style={{ marginTop: -2 }}>
            chain 3 powerups · creates 🌀 (board clear when matched)
          </div>
        </div>
      );
    if (type === "SPECIALS")
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="ts-row" style={{ gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <TutGem c="y" type="mult2" size={32} />
              <div className="ts-label">score ×2</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <TutGem c="b" type="mult5" size={32} />
              <div className="ts-label">score ×5</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <TutGem c="p" type="mult10" size={32} />
              <div className="ts-label">score ×10</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <TutGem c="r" type="shuffle" size={32} />
              <div className="ts-label">shuffle</div>
            </div>
          </div>
          <div className="ts-row" style={{ marginTop: 6 }}>
            <G k="w" size={36} hl />
            <span className="ts-arrow">+</span>
            <G k="b" size={28} />
            <span className="ts-arrow">→</span>
            <span className="ts-result">clears all blue!</span>
          </div>
          <div className="ts-label">prism + any color = full color wipe</div>
        </div>
      );
    if (type === "HAZARDS")
      return (
        <>
          <div className="ts-row" style={{ gap: 8 }}>
            <TutGem c="p" locked={3} size={38} />
            <span className="ts-arrow">⋯</span>
            <TutGem c="p" locked={1} size={38} />
            <span className="ts-arrow">→</span>
            <G k="p" size={38} />
          </div>
          <div className="ts-label">timer ticks down each move · then unlocks</div>
          <div className="ts-row" style={{ marginTop: 10, gap: 4 }}>
            <TutGem c="r" type="zap" size={26} />
            <TutGem c="b" type="bomb" size={26} />
            <TutGem c="g" type="inferno" size={26} />
            <G k="w" size={26} />
            <span className="ts-arrow">→</span>
            <span className="ts-result">BREAK LOCKS!</span>
          </div>
        </>
      );
    if (type === "SURVIVE")
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div
            style={{
              width: 220,
              height: 10,
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(160,80,255,.3)",
              borderRadius: 4,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "65%",
                height: "100%",
                background: "linear-gradient(90deg,#4422aa,#9966ff)",
              }}
            />
          </div>
          <div className="ts-label" style={{ marginTop: -4 }}>
            every match refills the timer
          </div>
          <div className="ts-row" style={{ gap: 6, marginTop: 4 }}>
            <div
              style={{
                fontFamily: "Orbitron",
                fontSize: ".6rem",
                fontWeight: 900,
                letterSpacing: ".08em",
                padding: "3px 9px",
                background: "rgba(255,80,0,.2)",
                border: "1px solid rgba(255,120,0,.6)",
                color: "#ff8844",
              }}
            >
              🔥 FEVER ×3
            </div>
          </div>
          <div className="ts-label">4 cascades fast = fever mode · triple score · bonus time</div>
        </div>
      );
    return null;
  };

  const TUT_STEPS = [
    { t: "SWAP" },
    { t: "POWERUPS" },
    { t: "SPECIALS" },
    { t: "HAZARDS" },
    {
      t: "SURVIVE",
      b: <>The timer shrinks over time. Score as much as you can before it runs out!</>,
    },
  ];
  if (screen === "menu" && !showTut) {
    return (
      <div className="menu">
        <style>{CSS}</style>
        <div style={{ textAlign: "center" }}>
          <div className="pt">PRISM</div>
        </div>
        <button className="menu-btn" onClick={startGame}>
          ▶ PLAY
        </button>
        {best > 0 && (
          <div className="menu-best">
            BEST SCORE
            <br />
            <b>{best.toLocaleString()}</b>
          </div>
        )}
        <button
          className="menu-link"
          onClick={() => {
            setShowTut(true);
            setTutStep(0);
          }}
        >
          How to Play
        </button>
        <button className="menu-link" onClick={() => setShowAbout(true)}>
          About
        </button>
        {showAbout && (
          <div className="tut" onClick={() => setShowAbout(false)}>
            <div className="tut-card">
              <div className="tut-title">ABOUT</div>
              <div className="tut-body">PRISM was developed by James Macre.</div>
            </div>
            <button className="menu-link" onClick={() => setShowAbout(false)}>
              Close
            </button>
          </div>
        )}
      </div>
    );
  }
  if (showTut) {
    const s = TUT_STEPS[tutStep];
    return (
      <div className="tut">
        <style>{CSS}</style>
        <div className="tut-card">
          <div className="tut-num">
            STEP {tutStep + 1} OF {TUT_STEPS.length}
          </div>
          <div className="tut-title">{s.t}</div>
          <TutScene type={s.t} />
          {s.b && <div className="tut-body">{s.b}</div>}
        </div>
        <button
          className="menu-btn"
          onClick={() => {
            if (tutStep < TUT_STEPS.length - 1) setTutStep(tutStep + 1);
            else finishTutorial();
          }}
        >
          {tutStep < TUT_STEPS.length - 1 ? "NEXT" : "START"}
        </button>
        <button
          className="menu-link"
          onClick={() => {
            if (tutStep > 0) setTutStep(tutStep - 1);
            else {
              setShowTut(false);
              setScreen("menu");
            }
          }}
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className={`pa${fever ? " fever" : ""}`}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div className="pt">PRISM</div>
      </div>

      <div className="sb">
        <div className="sb-left">
          <div className="sl">SCORE</div>
          <div className="sv">{score.toLocaleString()}</div>
        </div>
        {fever ? (
          <div className="fever-badge">🔥 FEVER ×3</div>
        ) : combo > 1 ? (
          <div className="co">×{combo} CASCADE</div>
        ) : null}
        <div className="sb-btns">
          <button
            className="icon-btn"
            onClick={pauseGame}
            style={{ visibility: paused ? "hidden" : "visible" }}
          >
            ❚❚
          </button>
        </div>
      </div>

      <div className="tw">
        <div className="trow">
          <span ref={limitRef}>LIMIT: {(getMaxMs(0) / 1000).toFixed(1)}s</span>
          <span ref={secRef} className="tsec ok" data-tier="ok">
            {(getMaxMs(0) / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="ttrack">
          <div ref={barRef} className="tbar ok" data-tier="ok" style={{ transform: "scaleX(1)" }} />
        </div>
      </div>

      <div className="bn-slot">
        {banner && <div className={`bn ${banner.type}`}>{banner.text}</div>}
      </div>

      <div className="board-wrap">
        <div className="aura aura-p" />
        <div className="aura aura-b" />
        <div className="aura aura-g" />
        <div className="aura aura-r" />
        <div
          ref={pgRef}
          className={`pg${fever ? " fever-board" : ""}${boardFlash ? " flash-" + boardFlash : ""}`}
          style={{ width: CW, height: CH, padding: 0, display: "block" }}
        >
          <div className="board-bloom" aria-hidden="true" />
          <canvas
            ref={canvasRef}
            width={CW * DPR}
            height={CH * DPR}
            style={{
              width: "100%",
              height: "100%",
              touchAction: "none",
              position: "relative",
              zIndex: 1,
            }}
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onTouchStart={handleCanvasTouchStart}
            onTouchEnd={handleCanvasTouchEnd}
          />

          {/* Floating score popups — kept as DOM (few, short-lived) */}
          {floaters.map((f) => (
            <div
              key={f.id}
              className={`floater ${f.type}`}
              style={{ left: f.px + PAD, top: f.py + PAD, transform: "translateX(-50%)" }}
            >
              {f.text}
            </div>
          ))}

          {gameOver && (
            <div className="overlay ov-stagger">
              <div className={`ov-title ${goReason}`}>
                {goReason === "timeout" ? "TIME'S UP" : "NO MOVES"}
              </div>
              <div className="ov-sub">
                {goReason === "timeout" ? "you ran out of time" : "no valid swaps remain"}
              </div>
              {bestInfo.isNew && (
                <div
                  className="nb"
                  style={{
                    fontFamily: "Orbitron",
                    fontSize: ".9rem",
                    letterSpacing: ".15em",
                    marginTop: 6,
                  }}
                >
                  ★ NEW BEST ★
                </div>
              )}
              <div className="ov-score">FINAL SCORE: {score.toLocaleString()}</div>
              <div
                style={{
                  fontSize: ".6rem",
                  letterSpacing: ".12em",
                  color: "#554477",
                  marginTop: -2,
                }}
              >
                BEST: {Math.max(best, score).toLocaleString()}
              </div>
              <button
                className="ov-btn danger"
                onClick={() => {
                  setBest(loadBest());
                  reset();
                }}
              >
                ↺ PLAY AGAIN
              </button>
              <button className="menu-link" onClick={backToMenu}>
                ← MENU
              </button>
            </div>
          )}
          {paused && !gameOver && (
            <PauseOverlay
              confirmAction={confirmAction}
              onConfirm={onPauseConfirm}
              onCancel={onPauseCancel}
              onResume={resumeGame}
              onReset={onPauseReset}
              onMenu={onPauseMenu}
              onToggleMusic={toggleMusic}
              onToggleSfx={toggleSfx}
              musicMuted={musicMuted}
              sfxMuted={sfxMuted}
            />
          )}
        </div>
      </div>
    </div>
  );
}
