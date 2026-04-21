// ─────────────────────────────────────────────────────────────────────────────
// AUDIO
// Web Audio engine for both the sequencer (BASS + MELS pattern) and SFX.
// Exposed as a single-instance module; nothing React here.
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIO = (() => {
  let ctx = null;
  let master = null;
  // Separate buses let us fade music independently of SFX — needed so the
  // game-over sting can ring out while the music ducks beneath it.
  let musicBus = null;
  let sfxBus = null;
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

  // Lookahead window for the scheduler + how often we wake up. Tuned wider
  // (500 ms / 30 ms) than typical so occasional main-thread stalls during
  // React cascades don't cause audio underruns.
  const AHEAD = 0.5;
  const LOOK = 30;

  // Global polyphony cap — on Android Chromium the audio renderer chokes
  // above ~14 simultaneous oscillators with gain automation, producing
  // the quiet crackle. Keep well below that ceiling.
  const MAX_POLY = 12;

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

      // ── Signal chain: sources → master → compressor → lowpass → destination
      //
      //   master      gain trim — what suspendAll fades
      //   compressor  tames peaks from overlapping SFX (8 ms attack,
      //               350 ms release — slower release than before to
      //               stop it from pumping during cascades)
      //   lowpass     gentle roll-off above ~3.2 kHz to tame the harsh
      //               phone-speaker sizzle that made some SFX painful

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.ratio.value = 8;
      comp.attack.value = 0.008;
      comp.release.value = 0.35;

      // Aggressive master lowpass — anything above ~1.5 kHz is aggressively
      // rolled off. Phone speakers exaggerate the 2-5 kHz band, and every
      // "painful high-pitched" SFX complaint traces back to content up
      // there. With this filter the harshest SFX can't get harsh.
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 1500;
      tone.Q.value = 0.9;

      // Master is the global mute point (suspend/pause fade it). Music and
      // SFX have their own pre-master buses so we can duck one without
      // the other.
      master = ctx.createGain();
      master.gain.value = 1.0;

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.15;
      sfxBus.connect(master);

      master.connect(comp);
      comp.connect(tone);
      tone.connect(ctx.destination);

      // Tiny reverb — 0.6 s instead of 2.4 s. The convolver was running
      // continuously during music playback and was the biggest baseline
      // CPU cost on the audio thread (4× smaller buffer = ~4× cheaper
      // per audio block). Shorter tail also means less ringing on phones.
      const len = Math.floor(ctx.sampleRate * 0.6);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
        }
      }
      verb = ctx.createConvolver();
      verb.buffer = buf;

      const vg = ctx.createGain();
      vg.gain.value = 0.15;
      verb.connect(vg);
      vg.connect(musicBus);

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
    if (!freq || !ctx || _activeOsc > MAX_POLY) return;
    _activeOsc++;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.onended = () => {
      _activeOsc--;
    };
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(musicBus);
    if (rv && verb) {
      const rg = ctx.createGain();
      rg.gain.value = rv;
      o.connect(rg);
      rg.connect(verb);
    }
    // 15 ms attack / 20 ms release — longer than the old 8 ms cuts down
    // on zipper noise when many notes overlap.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol, t + Math.max(0.015, dur * 0.6));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function kick(t) {
    if (!ctx || _activeOsc > MAX_POLY) return;
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
    g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.01);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    o.start(t);
    o.stop(t + 0.35);
  }

  function schedule() {
    if (!running || !ctx) return;
    // Phrase order across 8 melody blocks (0..7).
    const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 5, 4, 6, 7];

    // If the main thread stalled long enough that we'd be firing notes
    // meaningfully in the past, skip ahead rather than burst-fire a
    // catchup pile. Piled-up notes are the biggest single source of the
    // "crackle during cascades" symptom — many oscillators starting in
    // the same audio block overflow the audio thread's capacity.
    const now = ctx.currentTime;
    if (nextNote < now - _s8) {
      const behind = now - nextNote;
      const skip = Math.ceil(behind / _s8);
      nextNote += skip * _s8;
      beat += skip;
    }

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

    // Game-over variant: stop the music scheduler and fade MUSIC out
    // over ~2 seconds. SFX stays audible (it's on its own bus) so the
    // "over" sting can ring out cleanly without being buried by the mix.
    duckForGameOver() {
      running = false;
      clearTimeout(schedTimer);
      try {
        if (ctx && musicBus) {
          const t = ctx.currentTime;
          musicBus.gain.cancelScheduledValues(t);
          musicBus.gain.setValueAtTime(musicBus.gain.value, t);
          musicBus.gain.linearRampToValueAtTime(0.0001, t + 1.8);
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
        musicBus = null;
        sfxBus = null;
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
      if (_activeOsc > MAX_POLY && type !== "over") return;

      // Debounce: skip a second fire of the same SFX within 80 ms.
      // Overlapping identical SFX are almost never pleasant and easily
      // push us past the polyphony cap.
      const now2 = ctx.currentTime;
      if (_lastSfx === type && now2 - _lastSfxTime < 0.08) return;
      _lastSfx = type;
      _lastSfxTime = now2;

      const t = ctx.currentTime;

      // Local helper: one envelope-shaped oscillator note. Routed through
      // `master` (and thus the compressor) rather than directly to
      // destination — that's what smooths out the small clicks you'd
      // otherwise hear when many SFX overlap early in a run. Attack/release
      // ramps are also a touch longer (18ms/20ms) — too-short envelopes
      // sound like clicks on mobile audio drivers even at low volume.
      function sn(f, dur, vol, wt, t0 = t, fEnd = null) {
        if (_activeOsc > MAX_POLY + 2 && type !== "over") return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = wt;
        o.frequency.value = f;
        if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur * 0.72);
        o.connect(g);
        // SFX route through the dedicated SFX bus (which is attenuated
        // 45% relative to master) so they sit below the music.
        g.connect(sfxBus || master || ctx.destination);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.018);
        g.gain.setValueAtTime(vol, t0 + Math.max(0.018, dur - 0.02));
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
        // Bright electric zap. Swapped the 1600 Hz sawtooth (the painful
        // sizzle) for a softer triangle at 1200, and kept everything
        // below 1200 Hz for the rest.
        sn(1000, 0.14, 0.18, "triangle", t, 400);
        sn(800, 0.1, 0.13, "triangle", t + 0.02, 200);
        sn(600, 0.18, 0.16, "sine", t + 0.04, 150);
        sn(1200, 0.06, 0.08, "triangle", t + 0.01, 500);
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
        // Was 14 sawtooth + 7 sine + 2 bass = 23 oscillators. Cut to
        // 6 + 4 + 2 = 12 and swapped the sawtooths for triangles so the
        // Android audio thread doesn't have to render that many harsh
        // waveforms simultaneously.
        for (let i = 0; i < 6; i++) {
          const f = 100 + i * 80;
          sn(f, 1.1, 0.22, "triangle", t + i * 0.07, f * 1.8);
        }
        [220, 330, 440, 587].forEach((f, i) => {
          sn(f, 0.9, 0.18, "sine", t + 0.2 + i * 0.08, f * 0.5);
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
        // Dropped the 2093 Hz cap tone (way too shrill on phones).
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          sn(f, 0.4, 0.18, "sine", t + i * 0.05);
        });
      }
      if (type === "milestone") {
        // Was up to 1568. Trimmed so nothing pokes over ~1300.
        [659, 880, 1047, 1319].forEach((f, i) => {
          sn(f, 0.3, 0.16, "sine", t + i * 0.08);
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
        // Rising shimmer — trimmed to stay under ~1300 Hz.
        sn(130, 0.5, 0.3, "sine", t, 65);
        sn(440, 0.35, 0.22, "sine", t + 0.03);
        sn(659, 0.3, 0.2, "sine", t + 0.08);
        sn(880, 0.25, 0.16, "sine", t + 0.13);
        sn(1175, 0.2, 0.12, "sine", t + 0.18);
      }
      if (type === "unchain") {
        // Dropped the 1600 Hz chirp (too thin on phone speakers).
        sn(880, 0.15, 0.12, "sine");
        sn(660, 0.1, 0.08, "triangle", t + 0.05);
      }
      if (type === "prismSpawn") {
        // Was a 1568 / 2093 / 2637 ladder — nearly the entire thing was
        // in the painful 2-3 kHz band. Moved down an octave.
        sn(784, 0.3, 0.14, "sine", t);
        sn(1047, 0.25, 0.12, "sine", t + 0.08);
        sn(1319, 0.2, 0.1, "sine", t + 0.16);
      }
      if (type === "doublePrism") {
        // Softer impact — triangles instead of sawtooth/square, and
        // ceiling lowered from 2000 to 1200.
        sn(1200, 0.1, 0.24, "triangle", t, 150);
        sn(900, 0.08, 0.18, "triangle", t + 0.01, 100);
        // Impact thump.
        sn(150, 0.5, 0.35, "sine", t + 0.02, 40);
        // Rising chord — sustained.
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
        // Dropped the 1568/2093 pair (too shrill) and reduced the ladder
        // length so we're not firing 9 overlapping oscillators.
        [392, 523, 659, 784, 988].forEach((f, i) => {
          sn(f, 0.32, 0.18, "sine", t + i * 0.055, f * 1.6);
        });
        sn(98, 0.5, 0.22, "sine", t, 49);
        sn(130, 0.5, 0.22, "sine", t, 65);
      }
      if (type === "mult10") {
        // Was ~22 oscillators and went up to 3136 Hz — by far the worst
        // SFX for both crackling and high-pitch pain. Rebuilt with ~11
        // oscillators max and a 1300 Hz ceiling.
        for (let i = 0; i < 6; i++) {
          const f = 100 + i * 180;
          sn(f, 0.08, 0.15, "sine", t + i * 0.04, f * 1.8);
        }
        [261, 392, 523, 784, 1047].forEach((f, i) => {
          sn(f, 0.9, 0.2, "sine", t + 0.3 + i * 0.02, f * 1.3);
        });
        sn(55, 1.2, 0.4, "sine", t + 0.25, 30);
      }
      if (type === "multtick") {
        // The mult=10 variant sat at 2500 Hz — dropped to 1400.
        const f = args[0] >= 5 ? 1400 : 1100;
        sn(f, 0.05, 0.08, "sine", t, f * 1.3);
      }
      if (type === "over") {
        // Cinematic "game over" sting — all tones below ~350 Hz:
        //   • A low thump on the downbeat for weight.
        //   • A long descending bass sweep (evokes a failing engine).
        //   • Low D-minor interval (D + F) rising underneath.
        //   • A final low drone that outlives everything else.
        sn(80, 0.35, 0.55, "sine", t, 40); // opening thump
        sn(180, 2.2, 0.42, "sine", t, 55); // long descending sweep
        sn(90, 2.2, 0.38, "sine", t, 38); // parallel bass sweep
        sn(294, 1.8, 0.22, "sine", t + 0.2); // D
        sn(349, 1.8, 0.2, "sine", t + 0.35); // F
        sn(60, 3.0, 0.28, "sine", t + 0.6, 45); // low drone tail
      }
    },
  };
})();
