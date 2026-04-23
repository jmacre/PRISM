// ─────────────────────────────────────────────────────────────────────────────
// HAPTICS
// Thin wrapper around navigator.vibrate so powerups can fire tactile
// feedback without pulling in a Capacitor plugin. Web / iOS Safari silently
// no-op because vibrate() isn't supported there, which is the desired
// behavior (haptics are an Android-only enhancement for this app).
//
// Patterns are tuned so each powerup has its own recognizable "shape":
//   zap         short tick
//   bomb        single medium thump
//   inferno     rumbling trio
//   vortex      big pulse + echo
//   wildcard    double tap sparkle
//   fever       celebratory stutter
//   doublePrism long epic pattern
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS = {
  zap: [25],
  bomb: [55],
  inferno: [40, 30, 40, 30, 40],
  vortex: [100, 50, 140],
  wildcard: [35, 25, 35],
  fever: [35, 40, 35, 40, 70],
  doublePrism: [120, 70, 120, 70, 180],
  // Lighter taps kept for potential future use:
  tap: [10],
  select: [15],
};

let enabled = true;

export const HAPTICS = {
  setEnabled(v) { enabled = !!v; },
  isEnabled() { return enabled; },

  // Trigger a named pattern. Unknown names do nothing.
  fire(name) {
    if (!enabled) return;
    const pattern = PATTERNS[name];
    if (!pattern) return;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch {
      // Some browsers throw if called before a user gesture; ignore silently.
    }
  },
};
