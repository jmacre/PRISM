// ─────────────────────────────────────────────────────────────────────────────
// GEM TEXTURES
// Pre-rendered canvas textures for every gem / glow / badge the draw loop
// might need. Generating these once at module load means the per-frame draw
// path only has to `drawImage`, which is much cheaper than rebuilding
// gradients and polygons every 16 ms.
// ─────────────────────────────────────────────────────────────────────────────

import { PX, COLORS, PAL, SHAPE_OF } from "./constants.js";

// Faceted polygon geometry per gem shape. Each facet is three `x,y` pairs
// plus a shade index `s` (0 = brightest … 4 = darkest), interpreted relative
// to a light source at the upper-left.
const FACETS = {
  circle: null, // circles use the radial gradient path instead

  // Marquise (elongated, pointed top/bottom) — 8 facets around the centre.
  marquise: [
    { pts: "50,3 36,25 50,50", s: 0 },
    { pts: "50,3 64,25 50,50", s: 1 },
    { pts: "36,25 16,50 50,50", s: 1 },
    { pts: "64,25 84,50 50,50", s: 2 },
    { pts: "16,50 36,75 50,50", s: 3 },
    { pts: "84,50 64,75 50,50", s: 4 },
    { pts: "36,75 50,97 50,50", s: 4 },
    { pts: "64,75 50,97 50,50", s: 4 },
  ],
  diamond: [
    { pts: "50,4 50,50 8,50", s: 0 },
    { pts: "50,4 92,50 50,50", s: 1 },
    { pts: "8,50 50,50 50,96", s: 3 },
    { pts: "50,50 92,50 50,96", s: 4 },
  ],
  triangle: [
    { pts: "50,6 50,82 6,90", s: 1 },
    { pts: "50,6 94,90 50,82", s: 3 },
    { pts: "6,90 50,82 94,90", s: 4 },
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

// Linear-interpolate two #rrggbb hex colours by `t` in [0,1].
export function lerpColor(a, b, t) {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ar = parseInt(pa.slice(0, 2), 16);
  const ag = parseInt(pa.slice(2, 4), 16);
  const ab = parseInt(pa.slice(4, 6), 16);
  const br = parseInt(pb.slice(0, 2), 16);
  const bg = parseInt(pb.slice(2, 4), 16);
  const bb = parseInt(pb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return "#" + [r, g, bl].map(v => v.toString(16).padStart(2, "0")).join("");
}

// Pick a shaded colour for a facet. Stops run brightest → palette light →
// fill → dark → darkest; `s` in [0,4] picks a position in that ramp.
function shadeColor(pal, s) {
  const stops = ["#ffffff", pal.light, pal.fill, pal.dark, pal.dark];
  const lo = Math.floor(s);
  const hi = Math.min(4, lo + 1);
  const t = s - lo;
  return lerpColor(stops[lo], stops[hi], t);
}

// Annulus with a conic-style gradient (approximated via slices), rotated
// by `rot` radians. Used by inferno / vortex specials in the main draw loop.
export function drawConicRing(ctx, cx, cy, rInner, rOuter, colors, slices, rot) {
  const n = colors.length;
  ctx.save();
  for (let i = 0; i < slices; i++) {
    const t = i / slices;
    const a0 = t * Math.PI * 2 + rot;
    const a1 = ((i + 1) / slices) * Math.PI * 2 + rot;
    const idx = t * n;
    const i0 = Math.floor(idx) % n;
    const i1 = (i0 + 1) % n;
    const ft = idx - Math.floor(idx);
    ctx.fillStyle = lerpColor(colors[i0], colors[i1], ft);
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, a0, a1, false);
    ctx.arc(cx, cy, rInner, a1, a0, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Keyed off colour id — `GEM_TEXTURES.r` is the red gem canvas, etc.
// Also contains `glow_<c>` halos and `badge_mult2/5/10/shuffle` overlays.
export const GEM_TEXTURES = {};

// Build every cached texture. Called once at module load — if this is ever
// hit twice (e.g. HMR) the canvases simply get replaced in-place.
export function buildGemTextures() {
  const SZ = 128; // render at 2× resolution, display at PX

  for (const colorKey of COLORS) {
    const pal = PAL[colorKey];
    const shape = SHAPE_OF[colorKey];
    const canvas = document.createElement("canvas");
    canvas.width = SZ;
    canvas.height = SZ;
    const ctx = canvas.getContext("2d");
    const sc = SZ / 100; // facet coords are in 0..100 space
    const facets = FACETS[shape];

    if (!facets) {
      // Circle — single radial gradient.
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
      // Faceted shape — draw each triangular facet with its own gradient.
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
        for (let i = 2; i < pts.length; i += 2) {
          ctx.lineTo(pts[i] * sc, pts[i + 1] * sc);
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 0.25 * sc;
        ctx.stroke();
      }
    }

    // Diagonal highlight overlay (upper-left).
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(SZ * 0.55, 0);
    ctx.lineTo(0, SZ * 0.55);
    ctx.closePath();
    ctx.fill();
    // Diagonal shadow (bottom-right).
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.moveTo(SZ, SZ);
    ctx.lineTo(SZ * 0.45, SZ);
    ctx.lineTo(SZ, SZ * 0.45);
    ctx.closePath();
    ctx.fill();
    // Bottom rim gradient.
    const rimGrad = ctx.createLinearGradient(0, SZ * 0.72, 0, SZ);
    rimGrad.addColorStop(0, "rgba(0,0,0,0)");
    rimGrad.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, SZ * 0.72, SZ, SZ * 0.28);

    GEM_TEXTURES[colorKey] = canvas;
  }

  // Wildcard ("w") gem — hand-drawn faceted crystal to match the app
  // icon. Rendered at 4× the normal gem size (512 px) because prisms are
  // rare (almost never >2 on screen), so the extra memory is negligible
  // and the extra pixels mean the facet edges stay razor-sharp even when
  // the gem is enlarged by the selection pulse animation.
  buildWildcardTexture(SZ * 4);

  // Per-colour glow halos — used behind each gem in the draw loop.
  buildGlowTextures();

  // Multiplier / shuffle badges overlaid on power-up gems.
  buildBadgeTextures();
}

function buildWildcardTexture(SZ) {
  const wc = document.createElement("canvas");
  wc.width = SZ;
  wc.height = SZ;
  const wctx = wc.getContext("2d");
  const ws = SZ / 100;

  // The icon is a flat-shaded vector — no per-facet gradients, no
  // lighting overlays. Just solid fills with crisp edges.
  const poly = (fill, coords) => {
    wctx.fillStyle = fill;
    wctx.beginPath();
    wctx.moveTo(coords[0] * ws, coords[1] * ws);
    for (let i = 2; i < coords.length; i += 2) {
      wctx.lineTo(coords[i] * ws, coords[i + 1] * ws);
    }
    wctx.closePath();
    wctx.fill();
  };

  // Icon-matched palette + 3-zone layout:
  //   Top zone — triangular cap with pink-white highlight, big hot-pink
  //     facet on the upper-left, big cyan facet on the upper-right,
  //     lavender wedge filling the centre under the cap.
  //   Middle zone — one wide vivid-purple band spanning the full width.
  //   Bottom zone — pointed triangle with dark indigo (left) and dark
  //     blue-purple (right) meeting at the bottom tip.
  //
  //                      (50, 10)
  //                    /          \
  //                (42, 28)   (58, 28)     <- top-cap base
  //              /      \      /      \
  //          (10, 52) --(50, 52)-- (90, 52)  <- widest line
  //              |                       |
  //              |   middle purple band  |
  //              |                       |
  //          (10, 62) --(50, 62)-- (90, 62)
  //              \       |       /
  //             (30, 82) | (70, 82)
  //                  \   |   /
  //                   (50, 96)

  // Draw in paint order: big facets first, then smaller highlight facets
  // on top. Each big facet extends all the way to the top peak (50, 10)
  // so there are no gaps in the outline — the top-cap highlight is
  // drawn LAST as a small white triangle sitting over the peak.

  // Upper-left — hot pink / vivid magenta (full left half of upper zone)
  poly("#e24d93", [50, 10, 42, 28, 10, 52, 50, 52]);
  // Upper-right — cyan / teal (full right half of upper zone)
  poly("#3cc6df", [50, 10, 58, 28, 90, 52, 50, 52]);
  // Upper centre wedge — lavender (between top cap and middle band)
  poly("#c89cdc", [42, 28, 58, 28, 50, 52]);
  // Top-cap highlight (drawn AFTER upper-left/right so it sits on top)
  poly("#fdf0f7", [50, 10, 42, 28, 58, 28]);
  // Middle band — one wide vivid-purple strip (the icon's signature belt)
  poly("#7b4dcc", [10, 52, 90, 52, 90, 62, 10, 62]);
  // Lower-left — dark indigo (near-black)
  poly("#1c1a3e", [10, 62, 50, 62, 50, 96, 30, 82]);
  // Lower-right — medium blue (transition from upper cyan)
  poly("#2c5aa8", [50, 62, 90, 62, 70, 82, 50, 96]);

  // Thin white edge lines connecting the facets.
  wctx.strokeStyle = "rgba(255,255,255,0.15)";
  wctx.lineWidth = 0.5 * ws;
  const EDGES = [
    // Top cap
    [50, 10, 42, 28],
    [50, 10, 58, 28],
    [42, 28, 58, 28],
    // Top cap → widest line
    [42, 28, 10, 52],
    [58, 28, 90, 52],
    // Upper centre wedge — interior lines down to widest-mid
    [42, 28, 50, 52],
    [58, 28, 50, 52],
    // Horizontal middle-band boundaries
    [10, 52, 90, 52],
    [10, 62, 90, 62],
    // Outer vertical edges of the middle band
    [10, 52, 10, 62],
    [90, 52, 90, 62],
    // Lower outline
    [10, 62, 30, 82],
    [30, 82, 50, 96],
    [50, 96, 70, 82],
    [70, 82, 90, 62],
    // Lower centre divider
    [50, 62, 50, 96],
  ];
  for (const [x1, y1, x2, y2] of EDGES) {
    wctx.beginPath();
    wctx.moveTo(x1 * ws, y1 * ws);
    wctx.lineTo(x2 * ws, y2 * ws);
    wctx.stroke();
  }

  GEM_TEXTURES.w = wc;

  // Then asynchronously replace with the ACTUAL app-icon PNG so the
  // in-game prism matches the icon pixel-perfect. The polygon version
  // above is used as a fallback for the first frames while the image
  // loads + in case the fetch ever fails.
  if (typeof Image !== "undefined") {
    const img = new Image();
    img.onload = () => {
      try {
        const iconCanvas = document.createElement("canvas");
        iconCanvas.width = SZ;
        iconCanvas.height = SZ;
        const ictx = iconCanvas.getContext("2d");
        // Android adaptive-icon foregrounds have ~18% padding around
        // the safe-zone. Crop it out so the gem fills the texture.
        const pad = 0.18;
        const sx = img.width * pad;
        const sy = img.height * pad;
        const sw = img.width * (1 - 2 * pad);
        const sh = img.height * (1 - 2 * pad);
        ictx.drawImage(img, sx, sy, sw, sh, 0, 0, SZ, SZ);

        // Mask to the gem silhouette — kills everything outside the
        // gem outline (dark halo + lighter blue glow, all gone).
        ictx.globalCompositeOperation = "destination-in";
        ictx.fillStyle = "#000";
        const s = SZ / 100;
        const silhouette = [
          [50, 10], [58, 28], [90, 52], [90, 62],
          [70, 82], [50, 96], [30, 82], [10, 62],
          [10, 52], [42, 28],
        ];
        ictx.beginPath();
        ictx.moveTo(silhouette[0][0] * s, silhouette[0][1] * s);
        for (let i = 1; i < silhouette.length; i++) {
          ictx.lineTo(silhouette[i][0] * s, silhouette[i][1] * s);
        }
        ictx.closePath();
        ictx.fill();
        ictx.globalCompositeOperation = "source-over";

        GEM_TEXTURES.w = iconCanvas;
      } catch {
        // Silent fallback — polygon version remains in place.
      }
    };
    img.src = "/prism-gem.png";
  }
}

function buildGlowTextures() {
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
}

function buildBadgeTextures() {
  const br = Math.ceil(PX * 0.22);
  const BADGE_SCALE = 3; // render at 3× so the text is crisp on high-DPI
  const bsz = (br * 2 + 4) * BADGE_SCALE;
  const brS = br * BADGE_SCALE;

  const BADGES = [
    { key: "badge_mult2", style: "linear", colors: ["#ffd700", "#ff8800"], label: "×2", fontSize: 8 * BADGE_SCALE },
    { key: "badge_mult5", style: "linear", colors: ["#66ddff", "#2266ff"], label: "×5", fontSize: 8 * BADGE_SCALE },
    { key: "badge_mult10", style: "linear", colors: ["#ff66dd", "#aa00aa"], label: "×10", fontSize: 7 * BADGE_SCALE },
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
    const cx = bsz / 2;
    const cy = bsz / 2;

    // Main fill — diagonal gradient for multipliers, conic for shuffle.
    if (style === "linear") {
      const lg = bx2.createLinearGradient(cx - brS * 0.7, cy - brS * 0.7, cx + brS * 0.7, cy + brS * 0.7);
      lg.addColorStop(0, colors[0]);
      lg.addColorStop(1, colors[1]);
      bx2.fillStyle = lg;
      bx2.beginPath();
      bx2.arc(cx, cy, brS, 0, Math.PI * 2);
      bx2.fill();
    } else {
      const n = colors.length;
      const slices = 48;
      for (let i = 0; i < slices; i++) {
        const t = i / slices;
        const a0 = t * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / slices) * Math.PI * 2 - Math.PI / 2;
        const idx = t * n;
        const i0 = Math.floor(idx) % n;
        const i1 = (i0 + 1) % n;
        const ft = idx - Math.floor(idx);
        bx2.fillStyle = lerpColor(colors[i0], colors[i1], ft);
        bx2.beginPath();
        bx2.moveTo(cx, cy);
        bx2.arc(cx, cy, brS, a0, a1);
        bx2.closePath();
        bx2.fill();
      }
    }

    // Inset highlight — small upper-left shine spot.
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

    // White border ring.
    bx2.strokeStyle = "#ffffff";
    bx2.lineWidth = 1.5 * BADGE_SCALE;
    bx2.beginPath();
    bx2.arc(cx, cy, brS - BADGE_SCALE * 0.6, 0, Math.PI * 2);
    bx2.stroke();

    // Label with a subtle shadow for readability.
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

// Populate GEM_TEXTURES immediately on import so the draw loop can use them.
buildGemTextures();
