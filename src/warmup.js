// ─────────────────────────────────────────────────────────────────────────────
// WARMUP
// Exercise the expensive canvas paths once on a hidden offscreen canvas so
// the JIT can compile the draw loop, the GPU can upload gem textures, and
// shader pipelines for strokes / shadows / gradients are primed before the
// player ever sees the board. Without this, the FIRST of each effect (first
// gem draw, first zap, first bomb) lags noticeably on lower-end Android.
// ─────────────────────────────────────────────────────────────────────────────

import { COLORS } from "./constants.js";
import { GEM_TEXTURES } from "./gemTextures.js";

let warmedUp = false;

export function warmupRenderer() {
  if (warmedUp) return;
  warmedUp = true;

  try {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 256;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // 1) Gem textures — forces the GPU to upload each texture to VRAM.
    //    Without this, the first real drawImage per texture stalls the frame.
    for (const k of [...COLORS, "w"]) {
      const tex = GEM_TEXTURES[k];
      if (tex) ctx.drawImage(tex, 0, 0, 48, 48);
      const glow = GEM_TEXTURES["glow_" + k];
      if (glow) ctx.drawImage(glow, 0, 0, 48, 48);
    }
    for (const k of ["badge_mult2", "badge_mult5", "badge_mult10", "badge_shuffle"]) {
      const tex = GEM_TEXTURES[k];
      if (tex) ctx.drawImage(tex, 0, 0, 32, 32);
    }

    // 2) Lightning stroke path — matches the zapBlast draw in the main
    //    loop. Primes the stroke shader + shadow blur pipeline. Without
    //    this, the FIRST zap in a run always stutters.
    ctx.save();
    ctx.shadowColor = "rgba(0,220,255,0.9)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#00ccff";
    ctx.lineWidth = 8;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    for (let i = 1; i <= 8; i++) {
      ctx.lineTo(i * 32, 128 + (i % 2 ? 8 : -8));
    }
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 3) Bomb / inferno / vortex overlays — a quick circle fill, a conic-
    //    style annulus, and the center flash. Primes radial gradients and
    //    the fill+stroke cycle that those specials use.
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(128, 128, 32, 0, Math.PI * 2);
    ctx.fill();
    const rg = ctx.createRadialGradient(128, 128, 0, 128, 128, 40);
    rg.addColorStop(0, "#ffdd00");
    rg.addColorStop(1, "rgba(255,136,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(128, 128, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4) Rounded-rect outline (the per-frame colored cell outlines).
    //    Primes the batched rect + stroke path used every frame.
    ctx.save();
    ctx.strokeStyle = "#ff2255";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) ctx.rect(i * 28, 8, 24, 24);
    ctx.stroke();
    ctx.restore();
  } catch {}
}
