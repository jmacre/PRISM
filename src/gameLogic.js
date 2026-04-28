// ─────────────────────────────────────────────────────────────────────────────
// GAME LOGIC
// Pure board transformations: gem spawning, match detection, gravity, score
// math. No React, no canvas, no audio — everything here is safe to unit-test.
// ─────────────────────────────────────────────────────────────────────────────

import { ROWS, COLS, PX, GAP, COLORS } from "./constants.js";

// Monotonically-increasing id counter. Every gem gets a unique id so React's
// reconciler and the canvas renderer can track them across moves.
let _id = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────

export const parseKey = k => {
  const [r, c] = k.split(",").map(Number);
  return { r, c };
};

// Build a single gem. Pass `bonus=true` for fresh gems coming down from the
// top of the board — those have a small chance of rolling into a power-up
// (multiplier / shuffle / wildcard).
export const mkGem = (c, bonus = false) => {
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

// Create a fresh board, re-rolling any gem that would start in a match
// state (3-in-a-row horizontally or vertically).
export function initBoard() {
  const b = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => mkGem()));
  let dirty = true;
  while (dirty) {
    dirty = false;
    for (let r = 0; r < ROWS; r++) {
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
  }
  return b;
}

// ── Set-building helpers used by expandForSpecials ──────────────────────────

// Square of radius `rd` centred on (r,c) — used by bombs.
export const addRect = (s, r, c, rd) => {
  for (let dr = -rd; dr <= rd; dr++) {
    for (let dc = -rd; dc <= rd; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        s.add(`${nr},${nc}`);
      }
    }
  }
};

// Full row + full column through (r,c) — used by zaps.
export const addCross = (s, r, c) => {
  for (let cc = 0; cc < COLS; cc++) s.add(`${r},${cc}`);
  for (let rr = 0; rr < ROWS; rr++) s.add(`${rr},${c}`);
};

// Every gem of a specific colour — used by wildcards / inferno combos.
export const addColor = (s, b, col) => {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c]?.c === col) s.add(`${r},${c}`);
    }
  }
};

// The entire board — used by vortex / double-inferno.
export const addAll = s => {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) s.add(`${r},${c}`);
  }
};

// Every other cell in a checkerboard pattern — used by inferno.
export const addCheckered = (s, phase = 0) => {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2 === phase) s.add(`${r},${c}`);
    }
  }
};

// ── Match detection ─────────────────────────────────────────────────────────

// Scan for runs of 3+ matching gems. Returns the matched-key set plus any
// power-ups to spawn (4-in-a-row → zap, 5 → bomb, 6 → inferno, 7+ → vortex).
// Chained and wildcard gems never START a run — wildcards take on their
// neighbour's colour at swap time via attemptSwap.
export function findMatches(b) {
  const matched = new Set();
  const toCreate = [];

  const canMatch = (r, c) => b[r][c] && !b[r][c].chained && b[r][c].c && b[r][c].c !== "w";

  // Mark a run of `len` cells matched, and queue a power-up spawn if 4+.
  function scanRun(keys, len, color) {
    keys.forEach(k => matched.add(k));
    const pos = parseKey(keys[Math.floor((len - 1) / 2)]);
    if (len >= 7) toCreate.push({ type: "vortex", ...pos, color });
    else if (len >= 6) toCreate.push({ type: "inferno", ...pos, color });
    else if (len >= 5) toCreate.push({ type: "bomb", ...pos, color });
    else if (len >= 4) toCreate.push({ type: "zap", ...pos, color });
  }

  // Horizontal runs. Skip cells whose left neighbour is the same colour —
  // those are already part of the previous scan.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!canMatch(r, c)) continue;
      if (c > 0 && canMatch(r, c - 1) && b[r][c - 1].c === b[r][c].c) continue;
      const col = b[r][c].c;
      let n = 1;
      while (c + n < COLS && canMatch(r, c + n) && b[r][c + n].c === col) n++;
      if (n >= 3) {
        scanRun(
          Array.from({ length: n }, (_, k) => `${r},${c + k}`),
          n,
          col
        );
      }
    }
  }

  // Vertical runs. Same trick with the cell above.
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (!canMatch(r, c)) continue;
      if (r > 0 && canMatch(r - 1, c) && b[r - 1][c].c === b[r][c].c) continue;
      const col = b[r][c].c;
      let n = 1;
      while (r + n < ROWS && canMatch(r + n, c) && b[r + n][c].c === col) n++;
      if (n >= 3) {
        scanRun(
          Array.from({ length: n }, (_, k) => `${r + k},${c}`),
          n,
          col
        );
      }
    }
  }

  return { matched, toCreate };
}

// Expand the matched set to include every cell a special would clear. Runs
// iteratively so that if one special's explosion catches another special,
// that one's effect triggers too.
export function expandForSpecials(b, matched) {
  const ex = new Set(matched);
  const processed = new Set();

  let changed = true;
  while (changed) {
    changed = false;

    // Collect every unprocessed special currently in the clear set.
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
    const has = t => sp.some(s => s.type === t);
    const get = t => sp.find(s => s.type === t);
    const cnt = t => sp.filter(s => s.type === t).length;

    // Exotic combos first — these eat the whole board.
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
      for (const bm of sp.filter(s => s.type === "bomb")) {
        addRect(ex, bm.r, bm.c, 2);
      }
    }
    if (has("zap")) {
      for (const z of sp.filter(s => s.type === "zap")) {
        addCross(ex, z.r, z.c);
      }
    }

    if (ex.size > prevSize) changed = true;
  }
  return ex;
}

// Pick the most impressive label to show for a match. Ordered from most
// spectacular combo down — the first case that matches wins.
export function comboLabel(b, matched) {
  const sp = [];
  for (const k of matched) {
    const { r, c } = parseKey(k);
    if (b[r]?.[c]?.type && b[r][c].type !== "normal") sp.push(b[r][c].type);
  }
  if (!sp.length) return null;

  const has = t => sp.includes(t);
  const cnt = t => sp.filter(s => s === t).length;

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

// ── Board state helpers ─────────────────────────────────────────────────────

export function countChained(b) {
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (b[r][c]?.chained) n++;
  }
  return n;
}

// Apply gravity and top-fill. Returns the new board plus metadata the render
// loop uses: `fresh` (cells that were just spawned) and `drops` (how many
// rows each surviving gem fell, for smooth slide-down animation).
export function dropAndFill(b, currentScore = 0) {
  const next = b.map(r => [...r]);
  const fresh = new Set();
  const drops = {}; // "r,c" → rows dropped
  const chainedCount = countChained(next);

  for (let c = 0; c < COLS; c++) {
    // Compact existing gems downward, recording drop distance.
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

      // Chained gems start appearing once the player has some score on the
      // board. Chance, max-on-board, and duration all scale with score. We
      // never chain the top row so there's always somewhere to move into.
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

// Return true if ANY legal swap would create a match. Used to detect the
// "no moves left" game-over state. Wildcards are temporarily given a
// concrete colour so the matcher can see the match they'd produce.
export function hasValidMove(b) {
  const DIRS = [
    [0, 1],
    [1, 0],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b[r][c]?.chained) continue;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= ROWS || nc >= COLS) continue;
        if (b[nr][nc]?.chained) continue;

        const s = b.map(row => [...row]);
        [s[r][c], s[nr][nc]] = [s[nr][nc], s[r][c]];

        // Wildcard involved? Adopt the neighbour's colour just for this test.
        const origA = s[r][c];
        const origB = s[nr][nc];
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
  }
  return false;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

// Score formula for a single cascade pass. Inferno doubles the per-gem
// value on top of its flat bonus. Stacking specials adds +80%, deeper
// cascades add +30% per level, and fever mode triples the total.
export function calcScore(cleared, specTypes, level, fever) {
  const infernoCount = specTypes.filter(s => s === "inferno").length;
  const perGem = infernoCount > 0 ? 30 : 15;

  let pts = cleared * perGem;
  pts += specTypes.filter(s => s === "zap").length * 200;
  pts += specTypes.filter(s => s === "bomb").length * 350;
  pts += infernoCount * 1200;
  pts += specTypes.filter(s => s === "vortex").length * 1500;

  if (specTypes.length >= 2) pts = Math.floor(pts * 1.8);
  if (level > 1) pts += Math.floor(pts * 0.3 * (level - 1));
  if (fever) pts = Math.floor(pts * 3);
  return pts;
}

// Pixel-space centroid of a set of matched keys — used to place floaters
// at the visual centre of a match.
export function matchCentroid(matched) {
  let sr = 0;
  let sc = 0;
  let n = 0;
  for (const k of matched) {
    const { r, c } = parseKey(k);
    sr += r;
    sc += c;
    n++;
  }
  const ar = sr / n;
  const ac = sc / n;
  return {
    px: 7 + ac * (PX + GAP) + PX / 2,
    py: 7 + ar * (PX + GAP) + PX / 2,
  };
}

// Expose the id counter so the main component can mint new ids when it
// spawns special gems during cascade resolution.
export function nextId() {
  return ++_id;
}
