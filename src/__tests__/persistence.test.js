import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  STORAGE,
  loadBest,
  saveBest,
  loadStats,
  bumpStats,
  streakMult,
  streakTier,
  STREAK_TIERS,
  getMaxMs,
  getBonusMs,
} from "../persistence.js";

// Minimal in-memory localStorage shim — jsdom's implementation has been
// flakey across versions, and we only need get/set/clear for these tests.
beforeAll(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
    key: i => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe("STORAGE", () => {
  it("round-trips plain JSON", () => {
    STORAGE.set("foo", { a: 1, b: [2, 3] });
    expect(STORAGE.get("foo", null)).toEqual({ a: 1, b: [2, 3] });
  });

  it("returns the fallback when a key is missing", () => {
    expect(STORAGE.get("missing", 42)).toBe(42);
  });

  it("returns the fallback when the stored value is malformed", () => {
    localStorage.setItem("broken", "{ not json");
    expect(STORAGE.get("broken", "ok")).toBe("ok");
  });
});

describe("loadBest / saveBest", () => {
  it("returns 0 when nothing has been saved", () => {
    expect(loadBest()).toBe(0);
  });

  it("saves a new best score and returns isNew=true", () => {
    const result = saveBest(1000);
    expect(result.isNew).toBe(true);
    expect(result.prev).toBe(0);
    expect(loadBest()).toBe(1000);
  });

  it("ignores a lower score and reports isNew=false", () => {
    saveBest(2000);
    const result = saveBest(500);
    expect(result.isNew).toBe(false);
    expect(result.prev).toBe(2000);
    expect(loadBest()).toBe(2000);
  });

  it("overwrites when a new score is strictly higher", () => {
    saveBest(1000);
    saveBest(1500);
    expect(loadBest()).toBe(1500);
  });

  it("does not overwrite on a tie", () => {
    saveBest(1000);
    const result = saveBest(1000);
    expect(result.isNew).toBe(false);
  });
});

describe("bumpStats", () => {
  it("creates default stats on first call", () => {
    const s = bumpStats(500, 3);
    expect(s.games).toBe(1);
    expect(s.totalScore).toBe(500);
    expect(s.bestStreak).toBe(3);
  });

  it("accumulates across calls", () => {
    bumpStats(500, 3);
    const s = bumpStats(1000, 2);
    expect(s.games).toBe(2);
    expect(s.totalScore).toBe(1500);
    // Best streak only goes UP, never down.
    expect(s.bestStreak).toBe(3);
  });

  it("raises bestStreak when a new run beats the prior record", () => {
    bumpStats(500, 2);
    const s = bumpStats(200, 7);
    expect(s.bestStreak).toBe(7);
  });
});

describe("loadStats", () => {
  it("returns zeros when nothing is persisted", () => {
    expect(loadStats()).toEqual({ games: 0, totalScore: 0, bestStreak: 0 });
  });
});

describe("streakMult", () => {
  it("is 1 below the first tier", () => {
    expect(streakMult(0)).toBe(1);
    expect(streakMult(4)).toBe(1);
  });

  it("matches each tier's multiplier at its breakpoint", () => {
    for (const tier of STREAK_TIERS) {
      expect(streakMult(tier.at)).toBe(tier.mult);
    }
  });

  it("climbs monotonically across all tiers", () => {
    let last = -Infinity;
    for (let s = 0; s <= 35; s++) {
      const m = streakMult(s);
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });
});

describe("streakTier", () => {
  it("returns the entry matching the streak value", () => {
    expect(streakTier(0).mult).toBe(1);
    expect(streakTier(10).mult).toBe(2);
    expect(streakTier(30).mult).toBe(10);
  });

  it("returns the highest tier for streaks past the last breakpoint", () => {
    expect(streakTier(100).mult).toBe(10);
  });
});

describe("getMaxMs", () => {
  it("starts near 14000ms at move 0", () => {
    // getMaxMs(0) = 1500 + 12500 * e^0 = 14000
    expect(getMaxMs(0)).toBe(14000);
  });

  it("decays toward 1500ms as moves increase", () => {
    expect(getMaxMs(1000)).toBe(1500);
  });

  it("decreases monotonically with more moves", () => {
    let last = Infinity;
    for (let m = 0; m < 200; m += 5) {
      const v = getMaxMs(m);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });
});

describe("getBonusMs", () => {
  it("starts at 6000ms at move 0", () => {
    expect(getBonusMs(0)).toBe(6000);
  });

  it("decays toward 1000ms at high move count", () => {
    expect(getBonusMs(1000)).toBe(1000);
  });
});
