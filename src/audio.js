// ─────────────────────────────────────────────────────────────────────────────
// AUDIO
// Web Audio engine. SFX are synthesized with OscillatorNodes; music is a
// pre-rendered webm file played through an HTMLAudioElement routed into
// the graph via createMediaElementSource so we can still duck/fade it.
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIO = (() => {
  let ctx = null;
  let master = null;
  // Separate buses let us fade music independently of SFX — needed so the
  // game-over sting can ring out while the music ducks beneath it.
  let musicBus = null;
  let sfxBus = null;
  let verb = null;

  // HTMLAudioElement + its MediaElementSource. Looped webm clip.
  let musicEl = null;
  let musicSrcNode = null;

  let _musicMuted = false;
  let _sfxMuted = false;
  let _activeOsc = 0;
  let _lastSfx = "";
  let _lastSfxTime = 0;
  // Timestamp of the last "big" power-up SFX. Used to suppress the light
  // chime SFX (match / cascade / multtick) that would otherwise drown out
  // the tail of a zap/bomb/inferno/vortex.
  let _lastHiTime = 0;
  let _suspendId = 0;

  const BASE_BPM = 118;

  // Global polyphony cap — on Android Chromium the audio renderer chokes
  // above ~14 simultaneous oscillators with gain automation, producing
  // the quiet crackle. Keep well below that ceiling.
  const MAX_POLY = 12;

  // The music <audio> element. NOT routed through the Web Audio graph —
  // plain element playback, no effects, no playback-rate manipulation.
  // Web Audio processing (createMediaElementSource + compressor/filter)
  // was introducing scratch/muffle artifacts, so we keep music simple
  // and apply level changes via element.volume directly.
  const MUSIC_VOL = 0.5;

  function _buildMusic() {
    try {
      musicEl = new Audio("music.wav");
      musicEl.loop = true;
      musicEl.preload = "auto";
      musicEl.volume = MUSIC_VOL;
    } catch {}
  }

  function _buildCtx() {
    try {
      if (ctx) {
        try {
          ctx.close();
        } catch {}
      }
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Reset the timestamp trackers — they're in ctx.currentTime units,
      // and ctx.currentTime resets to 0 on a new context. Without this,
      // `now2 - _lastHiTime` goes negative on the new context (because
      // _lastHiTime holds the OLD ctx's time), which trips the `< 0.55`
      // suppression check and kills every LO-priority SFX (match chime,
      // cascade chirp) for the entire second game session.
      _lastHiTime = 0;
      _lastSfxTime = 0;
      _lastSfx = "";

      // ── Signal chain — SFX only.
      //
      //   sfxBus → lowpass(1.5kHz) → compressor → master → destination
      //
      // Music plays through the <audio> element directly (element.volume),
      // NOT through Web Audio, because routing it through nodes was
      // introducing scratchy / muffled artifacts on Android WebView.

      const sfxComp = ctx.createDynamicsCompressor();
      sfxComp.threshold.value = -18;
      sfxComp.ratio.value = 4;
      sfxComp.attack.value = 0.01;
      sfxComp.release.value = 0.4;

      const sfxTone = ctx.createBiquadFilter();
      sfxTone.type = "lowpass";
      sfxTone.frequency.value = 1500;
      sfxTone.Q.value = 0.9;

      master = ctx.createGain();
      master.gain.value = 1.0;

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.22;
      sfxBus.connect(sfxTone);
      sfxTone.connect(sfxComp);
      sfxComp.connect(master);

      master.connect(ctx.destination);

      _activeOsc = 0;
      verb = null; // no convolver needed now that music is pre-rendered

      // Wire the music <audio> element into the freshly built graph.
      _buildMusic();
    } catch {}
  }

  const init = () => {
    if (ctx) return;
    _buildCtx();
  };

  const resume = () => ctx?.state === "suspended" && ctx.resume();

  // Kick the music element into playback. Wrapped so we can `.catch` the
  // AbortError / NotAllowedError that fires when the user hasn't tapped
  // yet or when play/pause race each other on Android WebView.
  function _playMusic() {
    if (!musicEl || _musicMuted) return;
    try {
      const p = musicEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  return {
    init,
    resume,

    // In-game pause. Pauses the music file and fades master out. The
    // AudioContext stays alive so SFX still work if needed, and so
    // resumeFromPause doesn't have to cycle ctx.suspend()/ctx.resume()
    // (which clicks on Android).
    pauseMusic() {
      try { musicEl?.pause(); } catch {}
      try {
        if (ctx && master) {
          const t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        }
      } catch {}
    },

    // Game-over variant: fade MUSIC out over ~2 seconds while SFX keeps
    // playing, so the "over" sting rings cleanly. Music level is driven
    // via element.volume (not Web Audio) so we manually ramp it here.
    duckForGameOver() {
      if (!musicEl) return;
      const startVol = musicEl.volume;
      const steps = 30;
      const dt = 1800 / steps;
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          try { if (musicEl) musicEl.volume = startVol * (1 - i / steps); } catch {}
        }, i * dt);
      }
      setTimeout(() => { try { musicEl?.pause(); } catch {} }, 2000);
    },

    // Full suspend — used when the app actually goes to the background
    // (tab hidden / recent-apps button). Fades, pauses the music, then
    // suspends the ctx so Android stops processing audio entirely.
    suspendAll() {
      try { musicEl?.pause(); } catch {}
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
          if (master) master.gain.setValueAtTime(1.0, ctx.currentTime);
        }
      } catch {}
    },

    // No-op now — the pre-rendered music plays at its natural speed.
    // Kept so the existing timer-tick caller doesn't break.
    setTempo() {},

    get musicMuted() { return _musicMuted; },
    get sfxMuted()   { return _sfxMuted; },

    startMusic() {
      if (_musicMuted) return;
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(0.0001, t);
        master.gain.linearRampToValueAtTime(1.0, t + 0.15);
      }
      if (!musicEl) _buildMusic();
      if (musicEl) {
        try { musicEl.volume = MUSIC_VOL; } catch {}
      }
      _playMusic();
    },

    stopMusic() {
      _suspendId++;
      try {
        if (musicEl) {
          musicEl.pause();
          musicEl.currentTime = 0;
        }
      } catch {}
      if (ctx) {
        try { ctx.close(); } catch {}
        ctx = null;
        master = null;
        sfxBus = null;
        verb = null;
        _activeOsc = 0;
      }
      musicEl = null;
    },

    // Start fresh — guarantees a clean slate for a new run. Rebuilds the
    // AudioContext (for SFX) and a fresh music element when needed.
    forceStart() {
      _suspendId++;
      if (!ctx || ctx.state === "closed") {
        _buildCtx();
      }
      if (ctx) {
        try { if (ctx.state === "suspended") ctx.resume(); } catch {}
        try {
          if (master) {
            const t = ctx.currentTime;
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.linearRampToValueAtTime(1.0, t + 0.15);
          }
        } catch {}
      }
      // Rebuild the music element if needed, then restart from the top.
      if (!musicEl) _buildMusic();
      if (!_musicMuted && musicEl) {
        try {
          musicEl.currentTime = 0;
          musicEl.volume = MUSIC_VOL;
        } catch {}
        _playMusic();
      }
    },

    // Resume from pause — wait for ctx.resume()'s Promise to settle
    // before ramping the gain, otherwise Android's AudioContext clicks.
    resumeFromPause() {
      if (!ctx || _musicMuted) return;
      const finish = () => {
        try {
          if (master && ctx) {
            const t = ctx.currentTime;
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.linearRampToValueAtTime(1.0, t + 0.2);
          }
        } catch {}
        _playMusic();
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

    // `autoPlay` controls the side effect of un-muting: by default,
    // un-muting starts music playback (used by the pause-menu MUSIC
    // toggle so the player gets sound back immediately). Pass false
    // to apply the saved mute preference WITHOUT starting playback —
    // we want that during initial wiring on the menu screen, otherwise
    // the music would kick in the instant the audio context is built.
    setMusicMuted(v, autoPlay = true) {
      _musicMuted = v;
      try {
        if (v) musicEl?.pause();
        else if (ctx && autoPlay) _playMusic();
      } catch {}
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

      // Priority: while a big power-up SFX is still ringing, suppress the
      // small chimes that would otherwise drown it out. Without this the
      // zap/bomb/etc. cascade SFX stacks with the "match" chime + cascade
      // chirp and the ear latches onto the high-frequency chime instead
      // of the meaty power-up.
      const now2 = ctx.currentTime;
      const HI = ["vortex", "inferno", "bomb", "zap", "doublePrism", "wildcard",
                  "fever", "shuffle", "prismSpawn"];
      const LO = ["match", "cascade", "multtick", "bonus", "select", "unchain",
                  "mult2", "mult5", "mult10"];
      const isHi = HI.includes(type);
      const isLo = LO.includes(type);
      if (isLo && now2 - _lastHiTime < 0.55) return;
      if (isHi) _lastHiTime = now2;

      // Debounce: skip a second fire of the same SFX within 80 ms.
      // Overlapping identical SFX are almost never pleasant and easily
      // push us past the polyphony cap. Clack is exempt — landing
      // bursts intentionally fire many in quick succession.
      if (type !== "clack" && _lastSfx === type && now2 - _lastSfxTime < 0.08) return;
      _lastSfx = type;
      _lastSfxTime = now2;

      // If the audio context isn't running yet (just created or
      // suspended-and-mid-resume after a user gesture), schedule notes
      // ~80 ms in the future so they don't get dropped or compressed
      // when the audio engine catches up. Without this lead-in, a chime
      // like playStart loses its second/third notes — the first plays,
      // the rest land in the past relative to ctx.currentTime by the
      // time the engine starts processing.
      let leadIn = 0;
      try {
        if (ctx.state !== "running") {
          ctx.resume();
          leadIn = 0.08;
        }
      } catch {}
      const t = ctx.currentTime + leadIn;

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
        // Bomb SFX rebuilt for more "kaboom" and less "error beep":
        //   • Sharp downward crack — sawtooth from 900→40 Hz over 80 ms
        //     gives the bomb a clear impact transient at the front.
        //   • Two overlapping bass sweeps form the round thump body.
        //   • A short "debris" burst of low random sawtooths fired
        //     simultaneously (not sequenced) for a crackling tail.
        sn(900, 0.08, 0.42, "sawtooth", t, 40); // crack
        sn(250, 0.35, 0.55, "sine", t, 32); // thump
        sn(140, 0.6, 0.4, "sine", t + 0.02, 28); // body
        sn(60, 0.9, 0.38, "sine", t + 0.04, 22); // low rumble
        // Debris — all starting within 40ms of each other so they blend
        // into a single chaotic burst instead of a sequential sweep.
        for (let i = 0; i < 4; i++) {
          const f = 180 + Math.random() * 280;
          sn(f, 0.22, 0.1, "sawtooth", t + 0.06 + Math.random() * 0.04, f * 0.35);
        }
      }
      if (type === "inferno") {
        // Fiery explosion: bright whoosh down + deep impact + body.
        // Keeps the oscillator count low so the polyphony cap doesn't
        // swallow half the sound during gameplay.
        //
        //   • Bright "whoosh" — sawtooth sweeping from near the master
        //     lowpass ceiling down to low bass.
        //   • Two overlapping low sine impacts.
        //   • A mid triangle "body" for warmth.
        //   • A low rumble tail.
        sn(1400, 0.22, 0.3, "sawtooth", t, 180); // whoosh
        sn(80, 0.5, 0.55, "sine", t, 40); // impact
        sn(50, 0.8, 0.45, "sine", t, 25); // deep sub
        sn(880, 0.45, 0.22, "triangle", t + 0.05, 440); // mid body
        sn(440, 0.7, 0.22, "triangle", t + 0.1, 220); // fire body
        sn(330, 0.6, 0.2, "triangle", t + 0.15, 165); // warmth
        sn(110, 1.0, 0.3, "sine", t + 0.2, 55); // rumble tail
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
      if (type === "specialSpawn") {
        // Rising arpeggio played when a match creates a power-up (zap,
        // bomb, inferno, vortex) — plays ALONGSIDE the match chime, not
        // instead of it. Distinct from the power-up activation SFX so
        // the player doesn't mistake creation for detonation.
        sn(523, 0.18, 0.16, "sine", t); // C
        sn(659, 0.18, 0.14, "sine", t + 0.07); // E
        sn(880, 0.22, 0.12, "sine", t + 0.14); // A
        sn(1175, 0.2, 0.1, "triangle", t + 0.22); // D
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
        // Short, punchy ×10 celebration — was ~1.45 s total, now ~0.95 s.
        for (let i = 0; i < 6; i++) {
          const f = 100 + i * 180;
          sn(f, 0.08, 0.15, "sine", t + i * 0.04, f * 1.8);
        }
        [261, 392, 523, 784, 1047].forEach((f, i) => {
          sn(f, 0.5, 0.2, "sine", t + 0.3 + i * 0.02, f * 1.3);
        });
        sn(55, 0.7, 0.4, "sine", t + 0.25, 30);
      }
      if (type === "multtick") {
        // The mult=10 variant sat at 2500 Hz — dropped to 1400.
        const f = args[0] >= 5 ? 1400 : 1100;
        sn(f, 0.05, 0.08, "sine", t, f * 1.3);
      }
      if (type === "click") {
        // Soft UI tap — short, brightish, but quiet enough to not step on
        // gameplay SFX when the user fiddles with buttons mid-run.
        sn(1800, 0.03, 0.06, "triangle", t, 900);
        sn(2600, 0.02, 0.03, "sine", t, 1400);
      }
      if (type === "playStart") {
        // PLAY chime — quick rising C-major triad (C5 → E5 → G5)
        // landing on the 5th, plus a held G5 root that rings out for
        // the full duration. Pure sine fundamentals with a triangle
        // overlay on the landing note give it a chime/bell character
        // that's musical but not muddy. Total chime ~250 ms; the menu
        // delays the screen transition to give it room to land.
        sn(523.25, 0.10, 0.13, "sine", t + 0.00, 523.25);     // C5 pickup
        sn(659.25, 0.10, 0.13, "sine", t + 0.07, 659.25);     // E5
        sn(783.99, 0.30, 0.15, "triangle", t + 0.14, 783.99); // G5 landing (held)
        sn(1567.98, 0.18, 0.05, "sine", t + 0.16, 1567.98);   // G6 sparkle (octave above landing)
      }
      if (type === "clack") {
        // Mid-range knock. Fast pitch sweep (700→200 Hz in ~50 ms) gives
        // an "impact transient" character instead of a sustained tone,
        // so it doesn't read as squeaky or musical. Second layer adds
        // body without forming a chord with the first.
        // Volumes bumped 25% louder than the previous pass — clacks were
        // getting swallowed during busy cascades.
        const pitch = 0.85 + Math.random() * 0.3;
        sn(700 * pitch, 0.05, 0.1575, "triangle", t, 220 * pitch);
        sn(440 * pitch, 0.06, 0.0875, "triangle", t, 190 * pitch);
      }
      if (type === "over") {
        // Cinematic "game over" sting — shorter, punchier take:
        //   • Opening low thump.
        //   • Descending bass sweep (evokes a failing engine).
        //   • Low D-minor interval (D + F) underneath.
        //   • A short low drone tail.
        sn(80, 0.3, 0.55, "sine", t, 40); // opening thump
        sn(180, 1.1, 0.42, "sine", t, 55); // descending sweep
        sn(90, 1.1, 0.38, "sine", t, 38); // parallel bass sweep
        sn(294, 0.9, 0.22, "sine", t + 0.18); // D
        sn(349, 0.9, 0.2, "sine", t + 0.3); // F
        sn(60, 1.4, 0.28, "sine", t + 0.5, 45); // low drone tail
      }
    },
  };
})();
