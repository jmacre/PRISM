// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE & PROGRESSION
// localStorage wrapper + best-score / stats helpers + streak tier tables.
// ─────────────────────────────────────────────────────────────────────────────

// Tiny JSON wrapper around localStorage. Silently falls back on read errors
// (quota exceeded, private-mode Safari, etc.) so the game never hard-fails
// because of persistence.
export const STORAGE = {
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

export const BEST_KEY = "prism_best";
export const STATS_KEY = "prism_stats";
export const TUT_KEY = "prism_tut_seen";

export function loadBest() {
  return STORAGE.get(BEST_KEY, 0);
}

// Persist a new best score if this run beat the previous one. Returns
// `{isNew, prev}` so the game-over screen can highlight a new record.
export function saveBest(score) {
  const prev = loadBest();
  if (score > prev) {
    STORAGE.set(BEST_KEY, score);
    return { isNew: true, prev };
  }
  return { isNew: false, prev };
}

export function loadStats() {
  return STORAGE.get(STATS_KEY, { games: 0, totalScore: 0, bestStreak: 0 });
}

export function bumpStats(finalScore, bestStreak) {
  const s = loadStats();
  s.games += 1;
  s.totalScore += finalScore;
  if (bestStreak > s.bestStreak) s.bestStreak = bestStreak;
  STORAGE.set(STATS_KEY, s);
  return s;
}

// Streak tiers: at this run length, the score gets this multiplier, and the
// HUD shows this label. Highest tier that the streak qualifies for wins.
export const STREAK_TIERS = [
  { at: 0, mult: 1, label: "" },
  { at: 5, mult: 1.5, label: "×1.5" },
  { at: 10, mult: 2, label: "×2" },
  { at: 15, mult: 3, label: "×3" },
  { at: 20, mult: 5, label: "×5" },
  { at: 30, mult: 10, label: "×10 MEGA" },
];

export function streakMult(streak) {
  let m = 1;
  for (const t of STREAK_TIERS) if (streak >= t.at) m = t.mult;
  return m;
}

export function streakTier(streak) {
  let tier = STREAK_TIERS[0];
  for (const t of STREAK_TIERS) if (streak >= t.at) tier = t;
  return tier;
}

// Time ceiling decays from 14 s (move 0) toward 1.5 s as the player keeps
// moving. The exponential shape is what makes the game naturally accelerate.
// Decay constant 28 — about 35% faster ramp than the original 38, but less
// brutal than the earlier halved (19) tuning.
export function getMaxMs(moves) {
  return Math.round(1500 + 12500 * Math.exp(-moves / 28));
}

// Time bonus per successful swap — also decays, so late-game gives tighter
// windows than early-game. Matched to getMaxMs's pace.
export function getBonusMs(moves) {
  return Math.round(1000 + 5000 * Math.exp(-moves / 30));
}
