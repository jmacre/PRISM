import { useState, useCallback, useRef, useEffect } from "react";

import { AUDIO } from "./audio.js";
import { HAPTICS } from "./haptics.js";
import { ROWS, COLS, PX, GAP, COLORS, PAL, CLIP, MILESTONE, FEVER_DUR } from "./constants.js";
import {
  STORAGE,
  TUT_KEY,
  loadBest,
  saveBest,
  bumpStats,
  streakMult,
  streakTier,
  STREAK_TIERS,
  getMaxMs,
  getBonusMs,
} from "./persistence.js";
import {
  mkGem,
  initBoard,
  parseKey,
  addRect,
  addCross,
  addColor,
  addAll,
  addCheckered,
  findMatches,
  expandForSpecials,
  comboLabel,
  dropAndFill,
  hasValidMove,
  calcScore,
  matchCentroid,
  nextId,
} from "./gameLogic.js";
import { CSS } from "./css.js";
import { GEM_TEXTURES, drawConicRing } from "./gemTextures.js";
import { PauseOverlay } from "./PauseOverlay.jsx";
import { MainMenu } from "./MainMenu.jsx";
import { Tutorial, TUT_STEPS } from "./Tutorial.jsx";
import { GameOverOverlay } from "./GameOverOverlay.jsx";
import { App as CapApp } from "@capacitor/app";

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
  // True while a black overlay is fading in or out to mask a screen change.
  const [transitioning, setTransitioning] = useState(false);
  // True while the game→menu fade is in flight. Used to keep an empty
  // dim overlay over the board during the fade so the board doesn't
  // 'light back up' between unmounting the pause overlay and the
  // fade-to-black fully covering the screen.
  const [quittingGame, setQuittingGame] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(() => STORAGE.get("prism_sfx_muted", false));
  const [hapticsMuted, setHapticsMuted] = useState(() => STORAGE.get("prism_haptics_muted", false));

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
  // The displayed bar value, lerped toward `frac` each frame. Used to
  // smooth UPWARD jumps (refills) without lagging on DOWNWARD drain —
  // drain is matched instantly, refills ease in over ~10-15 frames.
  const barDisplayRef = useRef(1);
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

    const tick = now => {
      if (gameOvRef.current) return;
      const el = now - lastTickRef.current;
      lastTickRef.current = now;

      // Drain-frozen states: timer doesn't decrement. Fever freezes the
      // drain entirely so players can rip through cascades. Pause / busy /
      // not-yet-started also freeze.
      const drainFrozen =
        pausedRef.current ||
        busyRef.current ||
        !startedRef.current ||
        feverRef.current;
      if (!drainFrozen) remainingRef.current = remainingRef.current - el;

      // Tempo scales with the current time ceiling: 118 BPM at 14s → 155 BPM at 1.5s.
      const maxMs = getMaxMs(movesRef.current);
      const tempoFrac = Math.max(0, Math.min(1, (maxMs - 1500) / (14000 - 1500)));
      AUDIO.setTempo(Math.round(118 + 37 * (1 - tempoFrac)));

      // Defensive clamp: if remainingRef somehow exceeds maxMs (e.g. a
      // bonus/milestone/fever top-up was capped to an older maxMs that
      // has since decayed), pull it down so the bar can't stay at 100%
      // while the number reads a value larger than the current max.
      if (remainingRef.current > maxMs) remainingRef.current = maxMs;
      const remain = remainingRef.current;
      const frac = Math.max(0, Math.min(1, remain / maxMs));
      const isFever = feverRef.current;

      // UI-frozen: bar/text only stop while paused or not-yet-started.
      // We DO allow updates during busy so an addBonus / milestone /
      // fever refill can visibly glide up while the swap-animation +
      // cascade are still running. remainingRef itself is locked by
      // drainFrozen during busy, so the only way it can change in that
      // window is upward (top-ups), which is exactly what we want.
      const uiFrozen = pausedRef.current || !startedRef.current;

      // Update the timer bar. We separate "display" from "target":
      //   - Downward changes (drain) snap instantly so the bar tracks
      //     the numeric readout to the pixel.
      //   - Upward changes (refills from addBonus / milestone / fever)
      //     ease in over a handful of frames so the bar doesn't pop.
      if (barRef.current && !uiFrozen) {
        const target = frac;
        const display = barDisplayRef.current;
        let next;
        if (target > display + 0.005) {
          // Refill — ease up by ~3% of remaining gap each frame, so
          // addBonus / milestone / fever top-ups visibly glide for
          // about a second before settling. Lower this number for a
          // slower glide, raise it for a snappier one.
          next = display + (target - display) * 0.03;
          if (next > target - 0.002) next = target;
        } else {
          // Drain / hold — match exactly.
          next = target;
        }
        barDisplayRef.current = next;
        const tier = isFever ? "fever" : pickTier(frac, barRef.current.dataset.tier);
        barRef.current.style.transform = `scaleX(${next})`;
        if (barRef.current.dataset.tier !== tier) {
          barRef.current.className = `tbar ${tier}`;
          barRef.current.dataset.tier = tier;
        }
      }

      // Update the numeric seconds readout. During fever we replace the
      // number with just the flame emoji — the timer isn't draining so
      // the number would be meaningless and flashy.
      if (secRef.current && !uiFrozen) {
        const newText = isFever ? "🔥" : `${(Math.max(0, remain) / 1000).toFixed(1)}s`;
        if (secRef.current.textContent !== newText) secRef.current.textContent = newText;
        const stier = isFever ? "ok" : pickTier(frac, secRef.current.dataset.tier);
        if (secRef.current.dataset.tier !== stier) {
          secRef.current.className = `tsec ${stier}`;
          secRef.current.dataset.tier = stier;
        }
      }

      // Timer ran out — but give a short grace window (~400 ms) past zero
      // so a swap initiated right as the bar empties still gets credited
      // (addBonus inside attemptSwap will top the timer back up). Also
      // wait for any in-progress cascade to finish.
      if (remain <= -400 && !busyRef.current && !pausedRef.current) {
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
      // Lock countdowns ALWAYS tick down while the game is live — they
      // only pause when the game is paused. The setBoard + cascade
      // trigger below is still gated on busy so we don't stomp on
      // in-flight animations, but the `.chained` number decrements
      // regardless (it's a direct mutation; the canvas draw loop reads
      // the current value each frame so the visual countdown stays
      // accurate without a React re-render).
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

      // Only dispatch React state updates + trigger a cascade when the
      // game isn't already busy. If we ARE busy, the direct mutation of
      // `.chained = null` above is still reflected in the canvas draw
      // loop, and the in-flight cascade will see the newly-freed gem
      // when it re-scans for matches.
      if (busyRef.current) return;

      const newBoard = board.map(row => [...row]);
      setBoard(newBoard);
      if (findMatches(newBoard).matched.size > 0) {
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

  // Single source of truth for "drop a fresh board from the top".
  // Fills the fresh-gem set, kicks the drop-in animation, and schedules
  // the landing-clack burst. Every code path that shows a new/reshuffled
  // board — startGame, finishTutorial, reset, double-prism — goes
  // through here so behaviour (and the clack SFX) stay consistent.
  const dropFullBoard = () => {
    const allFresh = new Set();
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) allFresh.add(`${rr},${cc}`);
    setFreshGems(allFresh);
    // `0` tells the draw loop to set the animation start on its next
    // frame — works both from cold (canvas not mounted yet) and from
    // live (canvas already rendering).
    freshStart.current = 0;
    setTimeout(() => setFreshGems(new Set()), 800);
    playClacks(6, 500, 500);
  };

  // Back-compat alias for existing call sites.
  const triggerBoardDrop = dropFullBoard;

  // Schedule N clack SFX spread across `durMs` starting at `startMs`.
  // Small random jitter so clacks don't feel mechanical. Used to punctuate
  // the landing window of a drop animation — NOT the fall itself.
  const playClacks = (count, durMs, startMs = 0) => {
    for (let i = 0; i < count; i++) {
      const delay = startMs + (i * durMs) / Math.max(1, count) + Math.random() * 50;
      setTimeout(() => AUDIO.sfx("clack"), delay);
    }
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
    if (feverTimer.current) { clearInterval(feverTimer.current); feverTimer.current = null; }

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
    // Smooth menu → game transition: fade black IN, swap screens under
    // cover of the black, fade black OUT, THEN start the music. Music
    // is deferred well past the fade-out so the transition is clearly
    // over before any music plays.
    setTransitioning(true);
    setTimeout(() => {
      wipeRunState();
      setBoard(initBoard());
      triggerBoardDrop();
      setScreen("play");
      musicReady.current = true;
      requestAnimationFrame(() => setTransitioning(false));
      // Fade-out is .28s — wait an additional 500 ms past that so the
      // game is fully visible and stable before music kicks in.
      setTimeout(() => AUDIO.forceStart(), 600);
    }, 500);
  }, []);

  const finishTutorial = useCallback(() => {
    STORAGE.set(TUT_KEY, true);
    setTransitioning(true);
    setTimeout(() => {
      setShowTut(false);
      setBoard(initBoard());
      triggerBoardDrop();
      setScreen("play");
      musicReady.current = true;
      requestAnimationFrame(() => setTransitioning(false));
      // Music well after fade-out so the transition is clearly over.
      setTimeout(() => AUDIO.forceStart(), 600);
    }, 280);
  }, []);

  const backToMenu = useCallback(() => {
    // Tear down the pause overlay (it would flash back to its main
    // "PAUSED" screen during the fade because onPauseConfirm clears
    // confirmAction first) and replace it with a content-less dim
    // overlay (`quittingGame`) so the board stays dark instead of
    // 'lighting back up' while the fade-to-black is rising.
    setPaused(false);
    setConfirmAction(null);
    pausedRef.current = false;
    setQuittingGame(true);
    AUDIO.stopMusic();
    setTransitioning(true);
    setTimeout(() => {
      stopTimer();
      AUDIO.setTempo(118);
      wipeRunState();
      musicReady.current = false;
      setBest(loadBest());
      setScreen("menu");
      setQuittingGame(false);
      requestAnimationFrame(() => setTransitioning(false));
    }, 350);
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
    // Fever fills the timer to max and freezes the drain — bar displays
    // full + orange for the duration, and drain resumes from full when
    // fever ends.
    remainingRef.current = getMaxMs(movesRef.current);
    // Pause-aware fever timeout. A raw setTimeout would keep counting down
    // while paused — instead, poll every 50 ms and only decrement `remaining`
    // when the game is running. End fever when we've accumulated FEVER_DUR
    // of unpaused time.
    if (feverTimer.current) clearInterval(feverTimer.current);
    let feverRemaining = FEVER_DUR;
    let feverLastTick = performance.now();
    const feverGen = gameGenRef.current;
    feverTimer.current = setInterval(() => {
      if (feverGen !== gameGenRef.current) {
        clearInterval(feverTimer.current);
        feverTimer.current = null;
        return;
      }
      const now = performance.now();
      const dt = now - feverLastTick;
      feverLastTick = now;
      if (pausedRef.current || gameOvRef.current) return;
      feverRemaining -= dt;
      if (feverRemaining <= 0) {
        clearInterval(feverTimer.current);
        feverTimer.current = null;
        feverRef.current = false;
        setFever(false);
      }
    }, 50);
  }, []);

  // Fever triggers when a cascade reaches 4+ levels deep
  const checkFever = useCallback(
    cascadeLevel => {
      if (cascadeLevel >= 5 && !feverRef.current) triggerFever();
    },
    [triggerFever]
  );

  // ── Floaters ────────────────────────────────────────────────────────────
  // Each match pushes a "+N" floater that lives 1.2s. Cap the array at
  // FLOATER_CAP so long cascades don't balloon the DOM; when full we drop
  // the oldest entry.
  const FLOATER_CAP = 20;
  // `value` (optional) is the numeric points awarded — used to tier the
  // floater visually so big and huge scores stand out.
  const addFloater = useCallback((text, px, py, type, value = 0) => {
    const id = Date.now() + Math.random();
    let size = "";
    if (value >= 20000) size = "huge";
    else if (value >= 5000) size = "big";

    // Clamp px so the floater (which is centred on this point with
    // translateX(-50%)) keeps a safe padding from the viewport edges.
    // Without this, big/huge popups near board edges can clip against
    // .pa's overflow-x:hidden when the screen is narrow.
    let clampedPx = px;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      const scale = rect.width / CW;
      // Half-widths are conservative estimates based on the size tier;
      // text is monospaced-ish Orbitron at roughly these character counts.
      const halfW = size === "huge" ? 110 : size === "big" ? 75 : 50;
      const screenMargin = 12;
      const screenX = rect.left + (px + PAD) * scale;
      const minScreenX = screenMargin + halfW;
      const maxScreenX = window.innerWidth - screenMargin - halfW;
      if (screenX < minScreenX) clampedPx = (minScreenX - rect.left) / scale - PAD;
      else if (screenX > maxScreenX) clampedPx = (maxScreenX - rect.left) / scale - PAD;
    }

    setFloaters(f => {
      const entry = { id, text, px: clampedPx, py, type, size };
      return f.length >= FLOATER_CAP ? [...f.slice(1), entry] : [...f, entry];
    });
    setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 1200);
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
    reason => {
      gameOvRef.current = true;
      // Duck just the music (SFX stays audible) so the "over" sting
      // rings out clearly. stopMusic runs after the sting finishes.
      AUDIO.duckForGameOver();
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
  const checkMilestone = useCallback(newScore => {
    if (newScore >= nextMilestone.current) {
      const mmax = getMaxMs(movesRef.current);
      remainingRef.current = Math.min(remainingRef.current + 5000, mmax);
      AUDIO.sfx("milestone");
      showBanner(`🏆 ${(nextMilestone.current / 1000).toFixed(0)}K MILESTONE! +5s`, "milestone", 1400, 0);
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
          // Spawn the VFX blast here — the `clr` useEffect that normally
          // handles this can't see this cell because React's board state
          // has the prism cell nulled (from finalBoard) before cascade
          // runs, so it reads `board[prismPos]` as undefined and skips.
          const px = PAD + c * CELL + PX / 2;
          const py = PAD + r * CELL + PX / 2;
          if (pType === "zap") {
            addCross(wildcardClears, r, c);
            AUDIO.sfx("zap");
            HAPTICS.fire("zap");
            // Zap blast needs jagged bolt paths pre-computed (same as
            // the normal zap VFX spawner further down).
            const makeBoltPts = (x1, y1, x2, y2, jag) => {
              const pts = [{ x: x1, y: y1 }];
              const dx = x2 - x1;
              const dy = y2 - y1;
              const steps = Math.max(4, Math.floor(Math.sqrt(dx * dx + dy * dy) / 14));
              for (let s2 = 1; s2 < steps; s2++) {
                const t2 = s2 / steps;
                pts.push({
                  x: x1 + dx * t2 + (Math.random() - 0.5) * jag,
                  y: y1 + dy * t2 + (Math.random() - 0.5) * jag,
                });
              }
              pts.push({ x: x2, y: y2 });
              return pts;
            };
            const bL = PAD, bR = PAD + COLS * CELL - GAP;
            const bT = PAD, bB = PAD + ROWS * CELL - GAP;
            vfxRef.current.push({
              type: "zapBlast",
              x: px, y: py,
              start: performance.now(), dur: 600,
              hBolt: makeBoltPts(bL - 10, py, bR + 10, py, 12),
              vBolt: makeBoltPts(px, bT - 10, px, bB + 10, 12),
              hCore: makeBoltPts(bL - 5, py, bR + 5, py, 6),
              vCore: makeBoltPts(px, bT - 5, px, bB + 5, 6),
            });
          }
          if (pType === "bomb") {
            addRect(wildcardClears, r, c, 2);
            AUDIO.sfx("bomb");
            HAPTICS.fire("bomb");
            vfxRef.current.push({ type: "bombBlast", x: px, y: py, start: performance.now(), dur: 700 });
          }
          if (pType === "inferno") {
            addCheckered(wildcardClears, (r + c) % 2);
            AUDIO.sfx("inferno");
            HAPTICS.fire("inferno");
            vfxRef.current.push({ type: "infernoBlast", x: px, y: py, start: performance.now(), dur: 900 });
          }
          if (pType === "vortex") {
            addAll(wildcardClears);
            AUDIO.sfx("vortex");
            HAPTICS.fire("vortex");
            vfxRef.current.push({ type: "vortexBlast", x: px, y: py, start: performance.now(), dur: 1000 });
          }
          b[r][c].wasWild = false;
        }
      if (wildcardUsed) {
        AUDIO.sfx("wildcard");
        HAPTICS.fire("wildcard");
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

      const pts = calcScore(toClear.size, specTypes, level, feverRef.current);

      // Compute every multiplier that contributes to the score BEFORE
      // showing the floater so the displayed number matches the actual
      // points awarded. Previously the floater showed only `pts`, but
      // setScore added `pts * streak + wildcardBonus + cascadeMult` —
      // the displayed number was usually much smaller than what the
      // score actually went up by.
      const smult = streakMult(streakRef.current);
      const wildcardBonus = wildcardUsed ? 10000 : 0;
      const MULT_CAP = 20;
      let cascadeMult = 1;
      for (const k of toClear) {
        const { r, c } = parseKey(k);
        const t = b[r]?.[c]?.type;
        if (t === "mult2" || t === "mult5" || t === "mult10") {
          cascadeMult = Math.min(MULT_CAP, cascadeMult * (t === "mult10" ? 10 : t === "mult5" ? 5 : 2));
          AUDIO.sfx(t);
          setBoardFlash(t);
          setTimeout(() => setBoardFlash(null), 600);
        }
      }
      const totalPts = Math.round(pts * smult * cascadeMult) + wildcardBonus;

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
          ? `🔥+${totalPts.toLocaleString()}`
          : `+${totalPts.toLocaleString()}`;
      addFloater(floatText, px, py, floatType, totalPts);

      // Apply the (single) total score increment.
      setScore(s => {
        const ns = s + totalPts;
        scoreRefForSave.current = ns;
        checkMilestone(ns);
        return ns;
      });
      // If a shuffle power-up was triggered, mark it so finalize can reshuffle
      // the board after the match animation. We demote the gem back to normal
      // so it doesn't retrigger on the next cascade pass.
      let doShuffle = false;
      for (const k of matched) {
        const { r, c } = parseKey(k);
        if (b[r]?.[c]?.type === "shuffle") {
          AUDIO.sfx("shuffle");
          HAPTICS.fire("wildcard"); // sparkle-style burst
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

      // Activation SFX — fired only when an EXISTING special is in the
      // match (i.e. the player actually triggered it). Creating a new
      // power-up from a 4+/5+/6+/7+ match plays the regular match chime
      // plus a separate "special spawned" sparkle below.
      const isInferno = specTypes.includes("inferno") && !specTypes.includes("vortex");
      if (specTypes.includes("vortex")) {
        AUDIO.sfx("vortex");
        HAPTICS.fire("vortex");
        shakeBoard();
      } else if (isInferno) {
        AUDIO.sfx("inferno");
        HAPTICS.fire("inferno");
        shakeBoard();
        setTimeout(shakeBoard, 250);
        setTimeout(shakeBoard, 500);
      } else if (specTypes.includes("bomb")) {
        AUDIO.sfx("bomb");
        HAPTICS.fire("bomb");
        if (specTypes.length >= 2) shakeBoard();
      } else if (specTypes.includes("zap")) {
        AUDIO.sfx("zap");
        HAPTICS.fire("zap");
      } else {
        const { r, c } = parseKey([...matched][0]);
        AUDIO.sfx("match", b[r]?.[c]?.c || "r");
      }

      // If the match CREATED a power-up (zap/bomb/inferno/vortex), play a
      // short rising sparkle alongside — distinct from the activation
      // SFX so the player hears "you made something" without thinking
      // a bomb just went off. Scheduled after the match chime so it
      // isn't suppressed by the HI-priority gate.
      if (toCreate.length > 0 && !specTypes.length) {
        setTimeout(() => AUDIO.sfx("specialSpawn"), 80);
      }
      if (level > 2) AUDIO.sfx("cascade", level);

      // Banner text for the match — naturally-occurring special combos.
      if (label) {
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

        const next = b.map(r => [...r]);
        for (const k of toClear) {
          const { r, c } = parseKey(k);
          next[r][c] = null;
        }
        const spawnT = performance.now();
        for (const sp of toCreate) {
          if (next[sp.r][sp.c] === null) {
            // spawnAt is read by the draw loop to play a brief
            // pop-in / glow animation so power-ups don't just
            // appear instantly when they're formed.
            next[sp.r][sp.c] = { c: sp.color, type: sp.type, id: nextId(), spawnAt: spawnT };
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
          const sg = cells.map(p => next[p.r][p.c]);
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

        // Clack burst timed to the landing window, sparse enough to
        // read as individual hits. Count scales with how many gems
        // actually moved, capped at 4 so big cascades don't spam.
        const dropCount = Object.keys(drops).length + fresh.size;
        if (dropCount > 0) {
          const clacks = Math.min(4, Math.max(2, Math.ceil(dropCount / 6)));
          playClacks(clacks, 300, 280);
        }

        // Try another cascade pass after the drop-in finishes animating.
        pauseAwareTimeout(() => {
          setFreshGems(new Set());
          cascade(filled, level + 1);
        }, 430);
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

      const sw = board.map(r => [...r]);
      const gem1 = sw[r1][c1],
        gem2 = sw[r2][c2];
      // Double prism merge — clear entire board + massive bonus.
      // Animate as a regular swap (both prisms trade places visually)
      // before the board-clear effect fires, with a rainbow trail
      // streaming behind the swiped prism.
      if (gem1?.c === "w" && gem2?.c === "w") {
        movesRef.current += 1;
        startedRef.current = true;
        addBonus();
        if (limitRef.current)
          limitRef.current.textContent = `LIMIT: ${(getMaxMs(movesRef.current) / 1000).toFixed(1)}s`;
        setSel(null);
        setBusy(true);
        busyRef.current = true;
        swapAnimRef.current = {
          r1, c1, r2, c2,
          start: performance.now(),
          dur: 150,
          prismFromR: r1,
          prismFromC: c1,
          prismToR: r2,
          prismToC: c2,
        };
        pauseAwareTimeout(() => {
          swapAnimRef.current = null;
          AUDIO.sfx("doublePrism");
          HAPTICS.fire("doublePrism");
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
          setScore(s => {
            const ns = s + bonus;
            scoreRefForSave.current = ns;
            checkMilestone(ns);
            return ns;
          });
          addFloater(`+${bonus.toLocaleString()}`, boardCx, boardCy, "vortex");
          shakeBoard();
          setTimeout(shakeBoard, 300);
          setTimeout(shakeBoard, 600);
          // Mark every cell for clearing. No need to setBoard() here —
          // the cells are already populated in state, and a redundant
          // board update would thrash the draw useEffect (registered on
          // board changes) and cause visible flicker during the clear.
          const allKeys = new Set();
          for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) allKeys.add(`${rr},${cc}`);
          setClr(allKeys);
          // After clear animation, drop in a fresh clean board via the
          // shared helper so clacks + animation timing match everywhere.
          pauseAwareTimeout(() => {
            setClr(new Set());
            vfxSpawned.current.clear();
            setBoard(initBoard());
            dropFullBoard();
            pauseAwareTimeout(() => {
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
        // Post-swap board: prism (with wildcard marker for the cascade)
        // ends up at the gem's old cell, the gem ends up at the prism's
        // old cell. Cascade then color-wipes everything matching gemColor
        // and triggers any absorbed powerup.
        const cascadeBoard = board.map(row => [...row]);
        cascadeBoard[prismPos.r][prismPos.c] = nonPrismGem;
        cascadeBoard[gemPos.r][gemPos.c] = {
          c: gemColor,
          wasWild: true,
          type: targetPowerup,
          id: nextId(),
        };
        // Use the regular swap animation — the prism and the absorbed
        // gem visually trade places, no destroy effect. The rainbow
        // trail still streams behind the prism via the prism* fields
        // on swapAnimRef (read in the draw loop).
        swapAnimRef.current = {
          r1, c1, r2, c2,
          start: performance.now(),
          dur: 150,
          prismFromR: prismPos.r,
          prismFromC: prismPos.c,
          prismToR: gemPos.r,
          prismToC: gemPos.c,
        };
        pauseAwareTimeout(() => {
          swapAnimRef.current = null;
          setBoard(cascadeBoard);
          pauseAwareTimeout(() => cascade(cascadeBoard, 1), 40);
        }, 160);
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

  // Global button-tap SFX. One delegated pointerdown listener fires the
  // "click" SFX whenever a <button> is pressed anywhere in the app. Buttons
  // that should stay silent (e.g. the canvas board swap targets aren't
  // <button>s, so they're unaffected) can opt out with class "no-click-sfx".
  useEffect(() => {
    const onAnyButtonDown = e => {
      const btn = e.target.closest?.("button");
      if (!btn) return;
      if (btn.classList.contains("no-click-sfx")) return;
      AUDIO.sfx("click");
    };
    document.addEventListener("pointerdown", onAnyButtonDown, true);
    return () => document.removeEventListener("pointerdown", onAnyButtonDown, true);
  }, []);

  const audioInited = useRef(false);
  const ensureAudio = () => {
    AUDIO.init();
    if (!audioInited.current) {
      // Pass autoPlay=false: just sync the mute preference, don't kick
      // music playback as a side effect. Music start is handled
      // explicitly by startGame / forceStart at the right moment.
      AUDIO.setMusicMuted(musicMuted, false);
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
    // In-game pause: fade gain but keep the AudioContext alive. Cycling
    // ctx.suspend()/resume() for every pause causes a loud click on
    // Android because scheduled oscillators in the lookahead buffer fire
    // en masse on resume.
    setTimeout(() => AUDIO.pauseMusic(), 80);
  }, []);

  const resumeGame = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    AUDIO.resumeFromPause();
    musicReady.current = true;
    // Delay the unpause SFX until after the gain ramp (~200ms) has settled
    // — firing too early on Android can produce a loud click because the
    // AudioContext is still stabilizing after resume.
    setTimeout(() => AUDIO.sfx("pause"), 280);
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
  // the app. Routing priority:
  //   1. About modal open          → close About
  //   2. Tutorial open, step > 0   → previous step
  //   3. Tutorial open, step === 0 → exit to title
  //   4. Playing (not paused/over) → pause
  //   5. Anything else             → swallow the back press
  //
  // We hold the current navigation state in a ref so the popstate listener
  // can read the latest values without having to re-register every time
  // something changes (re-registering was causing the push/pop stack to
  // desync, making back presses seem to do nothing).
  const navRef = useRef({
    screen,
    showAbout,
    showTut,
    tutStep,
    paused,
    confirmAction,
    pauseGame,
    resumeGame,
    setShowAbout,
    setShowTut,
    setTutStep,
    setScreen,
    setConfirmAction,
  });
  useEffect(() => {
    navRef.current = {
      screen,
      showAbout,
      showTut,
      tutStep,
      paused,
      confirmAction,
      pauseGame,
      resumeGame,
      setShowAbout,
      setShowTut,
      setTutStep,
      setScreen,
      setConfirmAction,
    };
  });

  useEffect(() => {
    // Use Capacitor's native backButton event on Android — it fires
    // directly from the activity, independent of the WebView's history
    // state. The browser popstate approach was unreliable on some
    // Android versions because the WebView's history handling varied.
    //
    // Also register a popstate fallback so desktop/web browser still
    // works sensibly (push a dummy state so back doesn't leave the page).
    const handleBack = () => {
      const nav = navRef.current;
      if (nav.showAbout) {
        nav.setShowAbout(false);
        return;
      }
      if (nav.showTut) {
        if (nav.tutStep > 0) {
          nav.setTutStep(nav.tutStep - 1);
        } else {
          nav.setShowTut(false);
          nav.setScreen("menu");
        }
        return;
      }
      // Pause flow:
      //  - If the "NEW GAME?" / "QUIT TO MENU?" confirmation is open, back
      //    acts as CANCEL (returns to the main pause screen).
      //  - If we're just paused (no confirm), back acts as RESUME.
      if (nav.paused) {
        if (nav.confirmAction) {
          nav.setConfirmAction(null);
        } else {
          nav.resumeGame();
        }
        return;
      }
      if (nav.screen === "play" && !gameOvRef.current) {
        nav.pauseGame();
      }
    };

    // Native Android back button (Capacitor). Silently no-ops in the
    // browser because CapApp.addListener throws if not on native.
    let nativeHandle;
    try {
      const p = CapApp.addListener("backButton", handleBack);
      if (p && typeof p.then === "function") {
        p.then(h => { nativeHandle = h; }, () => {});
      } else {
        nativeHandle = p;
      }
    } catch {}

    // Browser fallback.
    window.history.pushState({ prism: true }, "", " ");
    const onPopstate = () => {
      window.history.pushState({ prism: true }, "", " ");
      handleBack();
    };
    window.addEventListener("popstate", onPopstate);

    return () => {
      window.removeEventListener("popstate", onPopstate);
      try {
        nativeHandle?.remove?.();
      } catch {}
    };
  }, []);

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

  const toggleHaptics = useCallback(() => {
    const n = !hapticsMuted;
    setHapticsMuted(n);
    HAPTICS.setEnabled(!n);
    STORAGE.set("prism_haptics_muted", n);
    // Quick confirmation tick so the user feels it turn on.
    if (!n) HAPTICS.fire("select");
  }, [hapticsMuted]);

  // Sync HAPTICS enabled state with the stored preference on mount.
  useEffect(() => {
    HAPTICS.setEnabled(!hapticsMuted);
  }, [hapticsMuted]);

  // ── Canvas board draw loop ──────────────────────────────────────────────
  const CELL = PX + GAP;
  // Pre-computed key grid to avoid string concatenation per frame
  const KEYS = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_2, c) => `${r},${c}`));
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

    const draw = now => {
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
      // Track full-board clear so we can draw a desaturation overlay
      // AFTER the gem loop (single composite-mode rect is much cheaper
      // than applying ctx.filter per gem).
      const fullBoardClear = clr.size >= ROWS * COLS;
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
            const delay = r * 0.04;
            const elapsed = Math.max(0, (now - freshStart.current) / 1000 - delay);
            const dur = 0.42;
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
          // Powerup spawn animation — when a special gem is freshly
          // formed via match, scale-pop + brief glow over ~400 ms so it
          // doesn't just appear instantly. Only fires once per gem
          // (the spawnAt timestamp is set in cascade's finalize).
          let spawnFlash = 0;
          if (g.spawnAt) {
            const spawnAge = (performance.now() - g.spawnAt) / 1000;
            const spawnDur = 0.4;
            if (spawnAge < spawnDur) {
              const p = Math.min(1, spawnAge / spawnDur);
              // Pop curve: 0 → 1.25 → 1.0 (ease-out overshoot)
              if (p < 0.5) {
                const a = p / 0.5;
                scale *= 1 + 0.25 * (a * (2 - a));
              } else {
                const a = (p - 0.5) / 0.5;
                scale *= 1.25 - 0.25 * a;
              }
              spawnFlash = 1 - p;
            } else {
              g.spawnAt = null; // one-shot — clear so it doesn't replay
            }
          }
          // Existing gems that dropped — smooth fall
          const dropDist = dropsRef.current[key];
          if (!isFresh && dropDist && dropDist > 0) {
            const elapsed = (now - dropStart.current) / 1000;
            const dur = 0.38 + dropDist * 0.05;
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
          // Powerup spawn flash — bright white halo behind the gem that
          // fades over the spawn animation duration.
          if (spawnFlash > 0) {
            ctx.globalAlpha = alpha * spawnFlash * 0.85;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, 0, PX * (0.5 + 0.25 * spawnFlash), 0, Math.PI * 2);
            ctx.fill();
          }
          // Prism aura — rainbow conic ring that slowly rotates, plus
          // orbiting sparkle dots. The ring is the signature "this is a
          // prism, not just a white gem" cue.
          if (g.c === "w") {
            ctx.save();
            ctx.globalAlpha = alpha * (0.45 + 0.25 * (gp * 0.5 + 0.5));
            drawConicRing(
              ctx,
              0,
              0,
              PX * 0.46,
              PX * 0.56,
              ["#ff2288", "#ff8800", "#ffcc22", "#22ee88", "#2299ff", "#cc44ff"],
              32,
              t * 1.4
            );
            ctx.restore();
            // Orbiting white sparkle dots — 6 dots rotating around the gem.
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = "#ffffff";
            for (let sp = 0; sp < 6; sp++) {
              const spA = (sp * Math.PI) / 3 + t * 3.5;
              const spR = PX * 0.54;
              ctx.beginPath();
              ctx.arc(Math.cos(spA) * spR, Math.sin(spA) * spR, 2, 0, Math.PI * 2);
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
            // Cyan-edged white bars. Simulated glow via two wide
            // transparent underlayers instead of shadowBlur (which was
            // the main reason zap gems caused per-frame lag on Android —
            // shadowBlur forces a per-pixel gaussian convolution every
            // frame on every zap tile).
            ctx.save();
            ctx.fillStyle = "rgba(0,220,255,0.35)";
            ctx.fillRect(-3, -PX * 0.4, 6, PX * 0.8);
            ctx.fillRect(-PX * 0.4, -3, PX * 0.8, 6);
            ctx.fillStyle = "rgba(0,220,255,0.55)";
            ctx.fillRect(-2, -PX * 0.4, 4, PX * 0.8);
            ctx.fillRect(-PX * 0.4, -2, PX * 0.8, 4);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-1, -PX * 0.4, 2, PX * 0.8);
            ctx.fillRect(-PX * 0.4, -1, PX * 0.8, 2);
            ctx.restore();
            // Sparks at the outer ends — solid circles, no gradient per frame.
            const sparkA = 0.75 + 0.25 * Math.sin(t * 6);
            ctx.save();
            ctx.globalAlpha = alpha * sparkA;
            ctx.fillStyle = "rgba(0,220,255,0.85)";
            ctx.beginPath();
            ctx.arc(-PX * 0.42, 0, 3.5, 0, Math.PI * 2);
            ctx.arc(PX * 0.42, 0, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(-PX * 0.42, 0, 1.5, 0, Math.PI * 2);
            ctx.arc(PX * 0.42, 0, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          if (g.type === "bomb") {
            const bp = 1 + 0.08 * Math.sin(t * 4.8);
            const ba = 0.82 + 0.15 * Math.sin(t * 4.8);
            // Simulated glow with a wider transparent stroke underneath,
            // instead of shadowBlur.
            ctx.save();
            ctx.globalAlpha = alpha * ba * 0.5;
            ctx.strokeStyle = "rgba(255,255,255,0.7)";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, PX * 0.34 * bp, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha * ba;
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = 2.5;
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
              ctx.drawImage(GEM_TEXTURES["badge_shuffle"], -bDrawSz2 / 2, -bDrawSz2 / 2, bDrawSz2, bDrawSz2);
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
      // Double-prism color drain — a single grey rectangle drawn with
      // "saturation" composite mode desaturates everything underneath
      // without the per-gem ctx.filter overhead.
      if (fullBoardClear) {
        const clrElapsed = (now - clearStart.current) / 1000;
        const p = Math.min(1, clrElapsed / 0.5);
        ctx.save();
        ctx.globalCompositeOperation = "saturation";
        ctx.globalAlpha = p;
        ctx.fillStyle = "rgb(128,128,128)"; // neutral = 0 saturation
        ctx.fillRect(0, 0, CW, CH);
        ctx.restore();
      }
      // Rainbow trail helper — used by BOTH the double-prism slide
      // (prismSlideRef) and the prism+color swap (swapAnimRef with
      // prism* fields). Draws a rainbow ribbon from (sx,sy) to (fx,fy)
      // with the same layered look (outer glow → main band → white
      // core → sparkles). pP is the animation's progress (0–1) for
      // tail fade.
      const drawPrismTrail = (sx, sy, fx, fy, pP) => {
        const dxSlide = fx - sx;
        const dySlide = fy - sy;
        const horizontal = Math.abs(dxSlide) >= Math.abs(dySlide);
        const nx = horizontal ? 0 : 1;
        const ny = horizontal ? 1 : 0;
        const WIDTH = 22;
        const g0x = sx - nx * (WIDTH / 2);
        const g0y = sy - ny * (WIDTH / 2);
        const g1x = sx + nx * (WIDTH / 2);
        const g1y = sy + ny * (WIDTH / 2);
        const rbw = ctx.createLinearGradient(g0x, g0y, g1x, g1y);
        rbw.addColorStop(0.00, "#ff3d7f");
        rbw.addColorStop(0.18, "#ff8833");
        rbw.addColorStop(0.36, "#ffe400");
        rbw.addColorStop(0.54, "#36d96b");
        rbw.addColorStop(0.72, "#3f9ffc");
        rbw.addColorStop(0.90, "#a248ff");
        rbw.addColorStop(1.00, "#ff4db2");
        const fadeGrad = ctx.createLinearGradient(sx, sy, fx, fy);
        fadeGrad.addColorStop(0, "rgba(255,255,255,0.55)");
        fadeGrad.addColorStop(1, "rgba(255,255,255,1)");
        const drawRibbon = w => {
          ctx.beginPath();
          ctx.moveTo(sx - nx * (w / 2), sy - ny * (w / 2));
          ctx.lineTo(fx - nx * (w / 2), fy - ny * (w / 2));
          ctx.lineTo(fx + nx * (w / 2), fy + ny * (w / 2));
          ctx.lineTo(sx + nx * (w / 2), sy + ny * (w / 2));
          ctx.closePath();
          ctx.fill();
        };
        ctx.save();
        ctx.globalAlpha = (1 - pP * 0.2) * 0.28;
        ctx.fillStyle = rbw;
        drawRibbon(WIDTH * 1.55);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 1 - pP * 0.2;
        ctx.fillStyle = rbw;
        drawRibbon(WIDTH);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = (1 - pP * 0.3) * 0.7;
        ctx.fillStyle = fadeGrad;
        drawRibbon(4);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.globalAlpha = 1 - pP * 0.3;
        const tNow = performance.now() / 1000;
        for (let i = 0; i < 5; i++) {
          const frac = (i + 1) / 6 + 0.04 * Math.sin(tNow * 3 + i);
          const px = sx + dxSlide * frac;
          const py = sy + dySlide * frac;
          const perp = Math.sin(tNow * 4 + i * 1.7) * (WIDTH * 0.28);
          const radius = 1.4 + Math.abs(Math.sin(tNow * 6 + i)) * 0.8;
          ctx.beginPath();
          ctx.arc(px + nx * perp, py + ny * perp, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      // Trail behind the prism during a regular prism+color swap.
      const sa = swapAnimRef.current;
      if (sa && sa.prismFromR !== undefined) {
        const sxP = PAD + sa.prismFromC * CELL + PX / 2;
        const syP = PAD + sa.prismFromR * CELL + PX / 2;
        const sp = Math.min(1, (performance.now() - sa.start) / sa.dur);
        const ease = sp * (2 - sp);
        const fxP = sxP + (sa.prismToC - sa.prismFromC) * CELL * ease;
        const fyP = syP + (sa.prismToR - sa.prismFromR) * CELL * ease;
        drawPrismTrail(sxP, syP, fxP, fyP, sp);
      }

      // Draw prism slide animation (+ rainbow trail for prism color).
      const ps = prismSlideRef.current;
      if (ps) {
        const pElapsed = (performance.now() - ps.start) / 1000;
        const pP = Math.min(1, pElapsed / (ps.dur / 1000));
        const ease = pP * (2 - pP); // ease-out
        const fx = PAD + ps.fromC * CELL + PX / 2 + (ps.toC - ps.fromC) * CELL * ease;
        const fy = PAD + ps.fromR * CELL + PX / 2 + (ps.toR - ps.fromR) * CELL * ease;
        const slideColor = ps.gemColor || "w";

        if (slideColor === "w") {
          const sx = PAD + ps.fromC * CELL + PX / 2;
          const sy = PAD + ps.fromR * CELL + PX / 2;
          drawPrismTrail(sx, sy, fx, fy, pP);
        }

        ctx.save();
        ctx.translate(fx, fy);
        // Draw the gem texture sliding toward the prism
        const pgs = PX * 0.82;
        ctx.globalAlpha = 1 - pP * 0.3;
        if (GEM_TEXTURES[slideColor]) ctx.drawImage(GEM_TEXTURES[slideColor], -pgs / 2, -pgs / 2, pgs, pgs);
        // Trail glow
        ctx.globalAlpha = 0.3 * (1 - pP);
        const glowTex = GEM_TEXTURES["glow_" + slideColor] || GEM_TEXTURES["glow_w"];
        if (glowTex) ctx.drawImage(glowTex, -glowTex.width / 2, -glowTex.width / 2, glowTex.width, glowTex.width);
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
          // Full-width lightning bolts — absolute coords, no translate.
          // Outer glow + inner core are SEPARATE random paths so the core
          // flickers inside the glow for that doubled-arc electric look.
          // Drawn in colour-batched order (all cyan first, then all white)
          // so we only set strokeStyle twice per frame.
          const fade = 1 - p;
          const drawPts = (pts, width) => {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let j2 = 1; j2 < pts.length; j2++) ctx.lineTo(pts[j2].x, pts[j2].y);
            ctx.lineWidth = width;
            ctx.stroke();
          };
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
          // Pre-compute jagged bolt points so they don't flicker each frame.
          // Keep the outer bolt and the inner core as SEPARATE random paths —
          // their slight misalignment is what sells the "doubled electric
          // arc" look. We just reduce the segment count (`/14` vs `/8`) so
          // each stroke has ~half the lineTo calls.
          const makeBoltPts = (x1, y1, x2, y2, jag) => {
            const pts = [{ x: x1, y: y1 }];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const steps = Math.max(4, Math.floor(Math.sqrt(dx * dx + dy * dy) / 14));
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
          const bL = PAD;
          const bR = PAD + COLS * CELL - GAP;
          const bT = PAD;
          const bB = PAD + ROWS * CELL - GAP;
          const ry = PAD + r * CELL + PX / 2;
          const cx2 = PAD + c * CELL + PX / 2;
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
    e => {
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
    e => {
      const pos = canvasToRC(e.touches[0].clientX, e.touches[0].clientY);
      if (!pos) return;
      ensureAudio();
      touchRef.current = { ...pos, x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    [canvasToRC]
  );

  const handleCanvasTouchEnd = useCallback(
    e => {
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
    e => {
      const pos = canvasToRC(e.clientX, e.clientY);
      if (!pos) return;
      ensureAudio();
      if (e.button !== 0) return;

      const startX = e.clientX,
        startY = e.clientY;
      const onUp = ue => {
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
    barDisplayRef.current = 1;
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
    setBoard(initBoard());
    setSel(null);
    setClr(new Set());

    remainingRef.current = getMaxMs(0);
    AUDIO.setTempo(118);
    startTimer();
    AUDIO.forceStart();
    musicReady.current = true;
    // Route through the shared helper so clacks + animation timing match
    // every other fresh-board entry point.
    dropFullBoard();
  };

  // Full-screen black fade overlay used to cover screen transitions.
  // Opacity is driven by `transitioning` — the CSS transition gives us
  // the smooth fade in and out for free.
  const transitionOverlay = (
    <div className={`page-fade ${transitioning ? "on" : ""}`} />
  );

  if (screen === "menu" && !showTut) {
    return (
      <>
        <style>{CSS}</style>
        <MainMenu
          best={best}
          onPlay={startGame}
          onOpenTutorial={() => {
            setShowTut(true);
            setTutStep(0);
          }}
          showAbout={showAbout}
          onOpenAbout={() => setShowAbout(true)}
          onCloseAbout={() => setShowAbout(false)}
        />
        {transitionOverlay}
      </>
    );
  }
  if (showTut) {
    return (
      <>
        <style>{CSS}</style>
        <Tutorial
          tutStep={tutStep}
          onNext={() => {
            if (tutStep < TUT_STEPS.length - 1) setTutStep(tutStep + 1);
            else finishTutorial();
          }}
          onBack={() => {
            if (tutStep > 0) setTutStep(tutStep - 1);
            else {
              setShowTut(false);
              setScreen("menu");
            }
          }}
        />
        {transitionOverlay}
      </>
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
          <button className="icon-btn" onClick={pauseGame} style={{ visibility: paused ? "hidden" : "visible" }}>
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

      <div className="bn-slot">{banner && <div className={`bn ${banner.type}`}>{banner.text}</div>}</div>

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

          {gameOver && (
            <GameOverOverlay
              goReason={goReason}
              score={score}
              best={best}
              bestInfo={bestInfo}
              onPlayAgain={() => {
                setBest(loadBest());
                reset();
              }}
              onMenu={backToMenu}
            />
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
              onToggleHaptics={toggleHaptics}
              musicMuted={musicMuted}
              sfxMuted={sfxMuted}
              hapticsMuted={hapticsMuted}
            />
          )}
          {/* Empty dim overlay during game→menu fade so the board stays
              dark instead of flashing bright between the pause overlay
              unmounting and the black fade-to-menu fully covering.
              animation:none disables the .overlay class's goIn fade-in
              (0→1 opacity), which would otherwise leave the board
              bright for the first 150 ms after the pause overlay
              unmounts. */}
          {quittingGame && !gameOver && (
            <div className="overlay" style={{ animation: "none" }} />
          )}
        </div>
        {/* Score floaters live OUTSIDE .pg (which clips its overflow)
            so a big +N number near the board's edge isn't cut off.
            .board-wrap is position:relative and has the same dimensions
            as .pg, so the existing px/py + PAD coords still align. */}
        {floaters.map(f => (
          <div
            key={f.id}
            className={`floater ${f.type}${f.size ? " " + f.size : ""}`}
            style={{ left: f.px + PAD, top: f.py + PAD, transform: "translateX(-50%)" }}
          >
            {f.text}
          </div>
        ))}
      </div>
      {transitionOverlay}
    </div>
  );
}
