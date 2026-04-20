// ─────────────────────────────────────────────────────────────────────────────
// AUDIO
// Web Audio engine for both the sequencer (BASS + MELS pattern) and SFX.
// Exposed as a single-instance module; nothing React here.
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIO = (() => {
  let ctx = null;
  let master = null;
  let verb = null;

  let running = false;
  let _musicMuted = false;
  let _sfxMuted = false;
  let _activeOsc = 0;
  let _lastSfx = "";
  let _lastSfxTime = 0;
  let _suspendId = 0;

  let schedTimer = null;
  let nextNote = 0;
  let beat = 0;

  const BASE_BPM = 118;
  let _bpm = BASE_BPM;
  let _s8 = 60 / _bpm / 2;

  const AHEAD = 0.35;
  const LOOK = 45;

  // Bass line (32 sixteenth-notes) and 8 looping melodies. `0` means rest.
  const BASS = [
    110, 0, 0, 0, 0, 0, 98, 0, 110, 0, 0, 82, 0, 0, 73, 0, 110, 0, 0, 0, 65, 0, 82, 0, 98, 0, 0, 0, 82, 0, 73, 82,
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

      // 2.4-second noise tail for a cheap convolution reverb.
      const len = Math.floor(ctx.sampleRate * 2.4);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
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

  const init = () => {
    if (ctx) return;
    _buildCtx();
  };

  const resume = () => ctx?.state === "suspended" && ctx.resume();

  function playNote(freq, t, dur, type, vol, rv = 0) {
    if (!freq || !ctx || _activeOsc > 20) return;
    _activeOsc++;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
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
    const o = ctx.createOscillator();
    const g = ctx.createGain();
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

  function schedule() {
    if (!running || !ctx) return;
    // Phrase order across 8 melody blocks (0..7).
    const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 5, 4, 6, 7];
    while (nextNote < ctx.currentTime + AHEAD) {
      const t = nextNote;
      const s8 = beat % 256;
      const phase16 = Math.floor(s8 / 16);
      const phase = ORDER[phase16];
      const sip = s8 % 16;
      const bSec = phase16 >= 8;

      if (s8 % 8 === 0) kick(t);
      if (BASS[s8 % 32]) {
        playNote(BASS[s8 % 32], t, _s8 * 1.65, "sine", bSec ? 0.3 : 0.26);
      }
      const mel = MELS[phase];
      if (mel[sip]) {
        playNote(mel[sip], t, _s8 * 0.88, "triangle", 0.17, 0.38);
      }
      // Octave accents in the last two phrases.
      if ((phase === 3 || phase === 7) && mel[sip] && sip % 4 === 2) {
        playNote(mel[sip] * 2, t, _s8 * 0.5, "sine", 0.05, 0.6);
      }
      nextNote += _s8;
      beat++;
    }
    schedTimer = setTimeout(schedule, LOOK);
  }

  return {
    init,
    resume,

    // In-game pause. Stops the scheduler and fades out, but keeps the
    // AudioContext alive. Cycling the context via ctx.suspend()/resume()
    // causes a click on Android because scheduled-but-not-yet-played
    // oscillators in the lookahead buffer fire all at once on resume.
    pauseMusic() {
      running = false;
      clearTimeout(schedTimer);
      try {
        if (ctx && master) {
          const t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        }
      } catch {}
    },

    // Full suspend — used when the app actually goes to the background
    // (tab hidden / recent-apps button). Fades, then calls ctx.suspend()
    // so Android stops processing audio entirely. Produces a small click
    // on next resume, but that's rare compared to in-game pause cycles.
    suspendAll() {
      running = false;
      clearTimeout(schedTimer);
      try {
        if (ctx && master) {
          const t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        }
        setTimeout(() => {
          try {
            if (ctx && ctx.state === "running") ctx.suspend();
          } catch {}
        }, 120);
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

    // Start fresh from beat 0. Used when the player starts a new run —
    // guarantees a clean slate. Only rebuilds the AudioContext if it's
    // missing or closed; otherwise just reuses the existing one. Avoids
    // ~100ms of unnecessary setup on every new-game button press.
    forceStart() {
      if (_musicMuted) return;
      _suspendId++;
      running = false;
      clearTimeout(schedTimer);
      if (!ctx || ctx.state === "closed") {
        _buildCtx();
      }
      if (ctx) {
        // Resume if suspended so the context is audible.
        try {
          if (ctx.state === "suspended") ctx.resume();
        } catch {}
        // Snap master gain back up (it may have been at 0 from a pause).
        try {
          if (master) {
            const t = ctx.currentTime;
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.linearRampToValueAtTime(0.32, t + 0.15);
          }
        } catch {}
        running = true;
        beat = 0;
        nextNote = ctx.currentTime + 0.1;
        schedule();
      }
    },

    // Resume from pause — keeps beat position, unmutes and restarts the
    // scheduler. We wait for ctx.resume()'s Promise to settle before
    // touching the gain, otherwise Android's AudioContext sometimes
    // produces a loud click from scheduling values against an unstable
    // context. We also ramp UP from whatever gain the fade left us at
    // (rather than snapping to 0.0001 first) to avoid any discontinuity.
    resumeFromPause() {
      if (!ctx || _musicMuted) return;
      const finish = () => {
        try {
          if (master && ctx) {
            const t = ctx.currentTime;
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.linearRampToValueAtTime(0.32, t + 0.2);
          }
        } catch {}
        if (!running && ctx) {
          running = true;
          nextNote = ctx.currentTime + 0.2;
          schedule();
        }
      };
      try {
        if (ctx.state === "suspended") {
          const p = ctx.resume();
          if (p && typeof p.then === "function") p.then(finish, finish);
          else finish();
        } else {
          finish();
        }
      } catch {
        finish();
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

    // One-shot sound effects. Keep polyphony bounded and debounce so rapid
    // repeats of the same SFX (e.g. during cascades) don't crackle.
    sfx(type, ...args) {
      if (_sfxMuted || !ctx) return;
      // Always let game-over through; otherwise drop when we're already loud.
      if (_activeOsc > 20 && type !== "over") return;

      const now2 = ctx.currentTime;
      if (_lastSfx === type && now2 - _lastSfxTime < 0.06) return;
      _lastSfx = type;
      _lastSfxTime = now2;

      const t = ctx.currentTime;

      // Local helper: one envelope-shaped oscillator note.
      function sn(f, dur, vol, wt, t0 = t, fEnd = null) {
        if (_activeOsc > 24 && type !== "over") return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
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
        const base = { r: 330, b: 440, g: 294, y: 392, p: 494 }[args[0]] || 330;
        sn(base, 0.18, 0.18, "sine");
        sn(base * 1.25, 0.14, 0.1, "sine", t + 0.06);
        sn(base * 1.5, 0.22, 0.07, "sine", t + 0.12);
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
        for (let i = 0; i < 5; i++) {
          sn(100 + Math.random() * 200, 0.15, 0.08, "sawtooth", t + 0.1 + i * 0.04);
        }
      }
      if (type === "inferno") {
        for (let i = 0; i < 14; i++) {
          const f = 80 + i * 35;
          sn(f, 1.1, 0.2, "sawtooth", t + i * 0.04, f * 2.2);
        }
        [220, 294, 392, 523, 659, 784, 988].forEach((f, i) => {
          sn(f, 0.9, 0.18, "sine", t + 0.15 + i * 0.05, f * 0.4);
        });
        sn(55, 1.3, 0.55, "sine", t, 20);
        sn(110, 1.0, 0.3, "triangle", t + 0.05, 35);
      }
      if (type === "vortex") {
        [110, 147, 196, 262, 330, 440, 523, 659, 784, 1047].forEach((f, i) => {
          sn(f, 0.55, 0.18, "triangle", t + i * 0.06);
        });
        sn(55, 0.9, 0.35, "sine", t, 20);
      }
      if (type === "cascade") {
        const f = 220 + args[0] * 120;
        sn(f, 0.2, 0.14, "triangle", t, f * 2.3);
      }
      if (type === "fever") {
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          sn(f, 0.4, 0.2, "sine", t + i * 0.05);
        });
        sn(2093, 0.3, 0.1, "sine", t + 0.28);
      }
      if (type === "milestone") {
        [784, 1047, 1319, 1568].forEach((f, i) => {
          sn(f, 0.3, 0.18, "sine", t + i * 0.08);
        });
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
        // Sharp impact burst.
        sn(2000, 0.1, 0.3, "sawtooth", t, 100);
        sn(1500, 0.08, 0.2, "square", t + 0.01, 80);
        // Impact thump.
        sn(150, 0.5, 0.35, "sine", t + 0.02, 40);
        // Dramatic rising chord — sustained.
        sn(523, 0.7, 0.2, "sine", t + 0.1);
        sn(659, 0.65, 0.18, "sine", t + 0.15);
        sn(784, 0.6, 0.16, "sine", t + 0.2);
        sn(1047, 0.55, 0.14, "sine", t + 0.25);
        // Low rumbling tail.
        sn(110, 1.0, 0.12, "sine", t + 0.4);
        sn(220, 0.8, 0.08, "triangle", t + 0.5);
      }
      if (type === "mult2") {
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          sn(f, 0.22, 0.14, "sine", t + i * 0.05, f * 1.5);
        });
        sn(262, 0.3, 0.1, "triangle", t);
      }
      if (type === "mult5") {
        [392, 523, 659, 784, 988, 1175, 1568].forEach((f, i) => {
          sn(f, 0.32, 0.18, "sine", t + i * 0.055, f * 1.8);
        });
        [98, 130].forEach(f => sn(f, 0.5, 0.22, "sine", t, f * 0.5));
        sn(2093, 0.25, 0.12, "triangle", t + 0.35);
      }
      if (type === "mult10") {
        for (let i = 0; i < 12; i++) {
          const f = 100 + i * 160;
          sn(f, 0.08, 0.15, "sine", t + i * 0.022, f * 2);
        }
        [261, 392, 523, 659, 784, 1047].forEach((f, i) => {
          sn(f, 0.9, 0.22, "sine", t + 0.3 + i * 0.015, f * 1.3);
        });
        [2093, 2637, 3136].forEach((f, i) => {
          sn(f, 0.6, 0.14, "triangle", t + 0.6 + i * 0.08);
        });
        sn(55, 1.2, 0.4, "sine", t + 0.25, 30);
      }
      if (type === "multtick") {
        const f = args[0] === 10 ? 2500 : args[0] === 5 ? 1800 : 1400;
        sn(f, 0.05, 0.08, "sine", t, f * 1.4);
      }
      if (type === "over") {
        sn(110, 1.4, 0.32, "sine", t, 55);
        sn(330, 1.1, 0.14, "triangle", t, 90);
        [262, 329, 196].forEach((f, i) => {
          sn(f, 0.9, 0.13, "sine", t + 0.7 + i * 0.09);
        });
      }
    },
  };
})();
