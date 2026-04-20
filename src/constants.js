// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// Board geometry, gem colour palette, and progression thresholds. Shared by
// almost every other module, so keep this file small and allocation-free.
// ─────────────────────────────────────────────────────────────────────────────

// Board geometry (px).
export const ROWS = 8;
export const COLS = 7;
export const PX = 44;
export const GAP = 4;

// Gem colour ids. `w` is the wildcard/prism — it's not in this list because
// prisms don't spawn as regular gems.
export const COLORS = ["r", "b", "g", "y", "p"];

// Shape assigned to each colour. Canvas gem textures use this to pick their
// faceted silhouette.
export const SHAPE_OF = {
  r: "marquise",
  b: "diamond",
  g: "triangle",
  y: "star",
  p: "hex",
};

// Per-colour palette used by both the canvas outlines and the gem textures.
// `fill` is the solid colour, `light`/`dark` feed the gradient highlights,
// and `glow` is the rgba used for halos and selection rings.
export const PAL = {
  r: { fill: "#ff2255", light: "#ff88aa", dark: "#7a0020", glow: "rgba(255,34,85,0.9)" },
  b: { fill: "#2299ff", light: "#88ccff", dark: "#003a88", glow: "rgba(34,153,255,0.9)" },
  g: { fill: "#22ee88", light: "#88ffcc", dark: "#005528", glow: "rgba(34,238,136,0.9)" },
  y: { fill: "#ffcc22", light: "#ffee99", dark: "#775500", glow: "rgba(255,204,34,0.9)" },
  p: { fill: "#cc44ff", light: "#ee99ff", dark: "#550088", glow: "rgba(200,68,255,0.9)" },
  w: { fill: "#ffffff", light: "#ffffff", dark: "#888888", glow: "rgba(255,255,255,0.9)" },
};

// CSS clip-path polygons (legacy — only used by the tutorial preview now).
export const CLIP = {
  circle: null,
  diamond: "polygon(50% 2%,98% 50%,50% 98%,2% 50%)",
  triangle: "polygon(50% 3%,97% 94%,3% 94%)",
  star: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
  hex: "polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)",
};

// Score threshold between milestone rewards (+5 s of time each time).
export const MILESTONE = 25000;

// How long a fever burst lasts, in ms.
export const FEVER_DUR = 10000;
