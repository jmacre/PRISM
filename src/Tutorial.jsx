// ─────────────────────────────────────────────────────────────────────────────
// TUTORIAL
// 5-step onboarding shown the first time the player hits PLAY.
// Self-contained: only needs `tutStep` + two navigation callbacks from the
// main game. All tutorial-specific gem previews live here.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { COLORS, PX } from "./constants.js";
import { GEM_TEXTURES, drawConicRing, onTexturesChanged } from "./gemTextures.js";

// Tutorial previews render gems as plain <img> tags with data-URL sources.
// Building these once up-front is cheaper than rendering the full canvas.
// We keep the map mutable so it can be refreshed when a texture is swapped
// at runtime (e.g. the prism PNG finishing its async load) — see the
// useGemDataUrls hook used by the <G> component below.
const gemDataUrls = {};
function refreshGemDataUrls() {
  for (const k of [...COLORS, "w"]) {
    if (GEM_TEXTURES[k]) gemDataUrls[k] = GEM_TEXTURES[k].toDataURL();
  }
}
refreshGemDataUrls();
// Bump whenever textures change so React components can invalidate.
let gemDataUrlsVersion = 0;
onTexturesChanged(() => {
  refreshGemDataUrls();
  gemDataUrlsVersion++;
});

// Hook that returns a bump counter — components using gemDataUrls can
// depend on it to re-render when a texture is replaced.
function useGemDataUrlsVersion() {
  const [, setV] = useState(gemDataUrlsVersion);
  useEffect(() => {
    // Poll briefly at mount in case a texture update landed between
    // module load and this hook running (async PNG loads are fast but
    // not instantaneous).
    if (setV.__current !== gemDataUrlsVersion) setV(gemDataUrlsVersion);
    const unsubscribe = onTexturesChanged(() => setV(gemDataUrlsVersion));
    return unsubscribe;
  }, []);
}

// Draws a power-up overlay at the current ctx origin (expected to be the
// gem center). This mirrors the in-game draw code from prism-game.jsx so
// tutorial gems show the identical animated sprite. `t` is seconds since
// some fixed start (used for animation phase).
function drawPowerupOverlay(ctx, type, px, t) {
  if (type === "zap") {
    ctx.save();
    ctx.fillStyle = "rgba(0,220,255,0.35)";
    ctx.fillRect(-3, -px * 0.4, 6, px * 0.8);
    ctx.fillRect(-px * 0.4, -3, px * 0.8, 6);
    ctx.fillStyle = "rgba(0,220,255,0.55)";
    ctx.fillRect(-2, -px * 0.4, 4, px * 0.8);
    ctx.fillRect(-px * 0.4, -2, px * 0.8, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-1, -px * 0.4, 2, px * 0.8);
    ctx.fillRect(-px * 0.4, -1, px * 0.8, 2);
    ctx.restore();
    const sparkA = 0.75 + 0.25 * Math.sin(t * 6);
    ctx.save();
    ctx.globalAlpha = sparkA;
    ctx.fillStyle = "rgba(0,220,255,0.85)";
    ctx.beginPath();
    ctx.arc(-px * 0.42, 0, 3.5, 0, Math.PI * 2);
    ctx.arc(px * 0.42, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-px * 0.42, 0, 1.5, 0, Math.PI * 2);
    ctx.arc(px * 0.42, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === "bomb") {
    const bp = 1 + 0.08 * Math.sin(t * 4.8);
    const ba = 0.82 + 0.15 * Math.sin(t * 4.8);
    ctx.save();
    ctx.globalAlpha = ba * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, px * 0.34 * bp, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = ba;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  } else if (type === "inferno") {
    drawConicRing(ctx, 0, 0, px * 0.34, px * 0.42,
      ["#ff2200", "#ff8800", "#ffcc00", "#ff5500", "#ff2200"], 32, t * 9);
  } else if (type === "vortex") {
    drawConicRing(ctx, 0, 0, px * 0.36, px * 0.45,
      ["#ff2255", "#ff8800", "#ffcc22", "#22ee88", "#2299ff", "#cc44ff"], 48, t * 14);
    drawConicRing(ctx, 0, 0, px * 0.22, px * 0.28,
      ["#ffcc22", "#2299ff", "#cc44ff", "#22ee88", "#ff2255"], 40, -t * 14);
  } else if (type === "mult2" || type === "mult5" || type === "mult10") {
    const mv = type === "mult10" ? 10 : type === "mult5" ? 5 : 2;
    const bk = `badge_${type}`;
    const br = px * 0.22;
    const bx = px * 0.3, by = -px * 0.28;
    if (GEM_TEXTURES[bk]) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = mv === 10 ? "#ee88ff" : mv === 5 ? "#66ddff" : "#ffd700";
      ctx.beginPath();
      ctx.arc(0, 0, br + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const tex = GEM_TEXTURES[bk];
      const dsz = tex.width / 3;
      ctx.drawImage(tex, -dsz / 2, -dsz / 2, dsz, dsz);
      ctx.rotate(t * 3.9);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, br - 1, 0, Math.PI * 0.7);
      ctx.stroke();
      ctx.restore();
    }
  } else if (type === "shuffle") {
    const br = px * 0.22;
    const bx = px * 0.3, by = -px * 0.28;
    if (GEM_TEXTURES.badge_shuffle) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#bb44ff";
      ctx.beginPath();
      ctx.arc(0, 0, br + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const tex = GEM_TEXTURES.badge_shuffle;
      const dsz = tex.width / 3;
      ctx.drawImage(tex, -dsz / 2, -dsz / 2, dsz, dsz);
      ctx.rotate(t * 3.9);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, br - 1, 0, Math.PI * 0.7);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Single gem image. `hl` highlights the image for "tap this" callouts.
// Subscribes to texture changes so the prism image updates from its
// polygon fallback to the real app-icon PNG once that PNG loads.
const G = ({ k, size = 28, hl = false }) => {
  useGemDataUrlsVersion();
  return (
    <img
      src={gemDataUrls[k]}
      alt=""
      className={hl ? "ts-highlight" : ""}
      style={{ width: size, height: size, display: "block" }}
      draggable="false"
    />
  );
};

// Gem preview that renders to a <canvas> so tutorial previews use the EXACT
// same sprites as the in-game draw loop (via drawPowerupOverlay, which
// mirrors the game's per-frame overlay code). Previous CSS-based approaches
// had cross-device rendering bugs — this is pixel-identical on every
// screen because canvas rendering is DPR-aware and doesn't depend on font
// metrics or CSS percentage quirks.
const TutGem = ({ c = "r", type = "normal", locked = null, size = 36 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * DPR);
    canvas.height = Math.round(size * DPR);
    const ctx = canvas.getContext("2d");
    let raf;
    let running = true;
    const startTime = performance.now();

    const frame = () => {
      if (!running) return;
      const t = (performance.now() - startTime) / 1000;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Base gem texture — stretched to the requested size.
      const tex = GEM_TEXTURES[c];
      if (tex) ctx.drawImage(tex, 0, 0, size, size);

      // Scale the in-game overlay code (written in PX units) to our size.
      if (type !== "normal") {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        const s = size / PX;
        ctx.scale(s, s);
        drawPowerupOverlay(ctx, type, PX, t);
        ctx.restore();
      }

      // Lock overlay (kept as simple vector shapes drawn directly).
      if (locked != null) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        const s = size / 100;
        ctx.scale(s, s);
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.arc(0, 0, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#778899";
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(-11, -6);
        ctx.lineTo(-11, -14);
        ctx.arc(0, -14, 11, Math.PI, 0);
        ctx.lineTo(11, -6);
        ctx.stroke();
        ctx.fillStyle = "#556677";
        ctx.fillRect(-19, -6, 38, 30);
        ctx.fillStyle = "#667788";
        ctx.fillRect(-19, -6, 38, 7);
        ctx.fillStyle = "#222833";
        ctx.beginPath();
        ctx.arc(0, 9, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-1.25, 9, 2.5, 9);
        ctx.fillStyle = "#fff";
        ctx.font = "900 14px Orbitron,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(locked), 0, 40);
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [c, type, locked, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "inline-block", verticalAlign: "middle" }}
      aria-hidden="true"
    />
  );
};

// ── Per-step scenes ─────────────────────────────────────────────────────────

const SwapScene = () => (
  <>
    <div className="ts-row">
      <G k="g" hl />
      <span className="ts-swap">⇄</span>
      <G k="r" hl />
      <G k="r" />
    </div>
    <div className="ts-label" style={{ marginTop: 10 }}>
      tap two adjacent gems to swap
    </div>
    <div className="ts-row" style={{ marginTop: 10 }}>
      <G k="r" />
      <G k="r" />
      <G k="r" />
      <span className="ts-arrow">→</span>
      <span className="ts-result">✨ MATCH!</span>
    </div>
  </>
);

// Inline label displayed next to a resulting powerup gem — styled like a
// small Orbitron tag so the name is clearly paired with the icon.
const PowerName = ({ children, color = "#cc88ff" }) => (
  <span
    style={{
      fontFamily: "Orbitron,sans-serif",
      fontSize: ".68rem",
      fontWeight: 900,
      letterSpacing: ".14em",
      color,
      textShadow: `0 0 10px ${color}`,
      marginLeft: 6,
    }}
  >
    {children}
  </span>
);

const PowerupsScene = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div className="ts-label">match 4 · row + column clear</div>
    <div className="ts-row">
      <G k="r" size={22} />
      <G k="r" size={22} />
      <G k="r" size={22} />
      <G k="r" size={22} />
      <span className="ts-arrow">→</span>
      <TutGem c="r" type="zap" size={32} />
      <PowerName color="#66bbff">ZAP</PowerName>
    </div>
    <div className="ts-label">match 5 · area blast</div>
    <div className="ts-row">
      <G k="b" size={22} />
      <G k="b" size={22} />
      <G k="b" size={22} />
      <G k="b" size={22} />
      <G k="b" size={22} />
      <span className="ts-arrow">→</span>
      <TutGem c="b" type="bomb" size={32} />
      <PowerName color="#ffaa66">BOMB</PowerName>
    </div>
    <div className="ts-label">match 6 · burns the board</div>
    <div className="ts-row">
      <G k="g" size={20} />
      <G k="g" size={20} />
      <G k="g" size={20} />
      <G k="g" size={20} />
      <G k="g" size={20} />
      <G k="g" size={20} />
      <span className="ts-arrow">→</span>
      <TutGem c="g" type="inferno" size={32} />
      <PowerName color="#ff8844">INFERNO</PowerName>
    </div>
    <div className="ts-label">match 7+ · clears the board</div>
    <div className="ts-row">
      <G k="p" size={18} />
      <G k="p" size={18} />
      <G k="p" size={18} />
      <G k="p" size={18} />
      <G k="p" size={18} />
      <G k="p" size={18} />
      <G k="p" size={18} />
      <span className="ts-arrow">→</span>
      <TutGem c="p" type="vortex" size={32} />
      <PowerName color="#ee88ff">VORTEX</PowerName>
    </div>
  </div>
);

const SpecialsScene = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div className="ts-label">random drops — match to activate</div>
    <div className="ts-row" style={{ gap: 14 }}>
      <div style={{ textAlign: "center" }}>
        <TutGem c="y" type="mult2" size={36} />
        <div className="ts-label" style={{ fontWeight: 700, color: "#ffcc44" }}>
          MULT ×2
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <TutGem c="b" type="mult5" size={36} />
        <div className="ts-label" style={{ fontWeight: 700, color: "#66ccff" }}>
          MULT ×5
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <TutGem c="p" type="mult10" size={36} />
        <div className="ts-label" style={{ fontWeight: 700, color: "#ee88ff" }}>
          MULT ×10
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <TutGem c="r" type="shuffle" size={36} />
        <div className="ts-label" style={{ fontWeight: 700, color: "#cc88ff" }}>
          SHUFFLE
        </div>
      </div>
    </div>
    <div className="ts-label" style={{ marginTop: 6 }}>
      PRISM + any color = full color wipe
    </div>
    <div className="ts-row">
      <G k="w" size={36} hl />
      <span className="ts-arrow">+</span>
      <G k="b" size={28} />
      <span className="ts-arrow">→</span>
      <span className="ts-result">clears all blue!</span>
    </div>
    <div className="ts-label">PRISM + PRISM = board wipe + 100K bonus</div>
    <div className="ts-row">
      <G k="w" size={32} hl />
      <span className="ts-arrow">+</span>
      <G k="w" size={32} hl />
      <span className="ts-arrow">→</span>
      <span className="ts-result">BOARD CLEAR!</span>
    </div>
  </div>
);

const HazardsScene = () => (
  <>
    <div className="ts-row" style={{ gap: 8 }}>
      <TutGem c="p" locked={3} size={38} />
      <span className="ts-arrow">⋯</span>
      <TutGem c="p" locked={1} size={38} />
      <span className="ts-arrow">→</span>
      <G k="p" size={38} />
    </div>
    <div className="ts-label">timer ticks down each move · then unlocks</div>
    <div className="ts-row" style={{ marginTop: 10, gap: 4 }}>
      <TutGem c="r" type="zap" size={26} />
      <TutGem c="b" type="bomb" size={26} />
      <TutGem c="g" type="inferno" size={26} />
      <G k="w" size={26} />
      <span className="ts-arrow">→</span>
      <span className="ts-result">BREAK LOCKS!</span>
    </div>
  </>
);

const SurviveScene = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
    <div
      style={{
        width: 220,
        height: 10,
        background: "rgba(255,255,255,.05)",
        border: "1px solid rgba(160,80,255,.3)",
        borderRadius: 4,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "65%",
          height: "100%",
          background: "linear-gradient(90deg,#4422aa,#9966ff)",
        }}
      />
    </div>
    <div className="ts-label" style={{ marginTop: -4 }}>
      every match refills the timer
    </div>
    <div className="ts-row" style={{ gap: 6, marginTop: 4 }}>
      <div
        style={{
          fontFamily: "Orbitron",
          fontSize: ".6rem",
          fontWeight: 900,
          letterSpacing: ".08em",
          padding: "3px 9px",
          background: "rgba(255,80,0,.2)",
          border: "1px solid rgba(255,120,0,.6)",
          color: "#ff8844",
        }}
      >
        🔥 FEVER ×3
      </div>
    </div>
    <div className="ts-label">5 cascades fast = fever mode · 3× score · timer freezes</div>
  </div>
);

// Pick the scene component for the current tutorial step.
const TutScene = ({ type }) => {
  if (type === "SWAP") return <SwapScene />;
  if (type === "POWERUPS") return <PowerupsScene />;
  if (type === "SPECIALS") return <SpecialsScene />;
  if (type === "HAZARDS") return <HazardsScene />;
  if (type === "SURVIVE") return <SurviveScene />;
  return null;
};

// The full set of steps, in order. `b` is an optional body paragraph under
// the scene — only SURVIVE uses it.
export const TUT_STEPS = [
  { t: "SWAP" },
  { t: "POWERUPS" },
  { t: "SPECIALS" },
  { t: "HAZARDS" },
  { t: "SURVIVE", b: <>Match as quickly as you can!</> },
];

// Full tutorial screen. The parent passes the current step and two callbacks:
// one for Next/Start and one for Back/exit.
export function Tutorial({ tutStep, onNext, onBack }) {
  const s = TUT_STEPS[tutStep];
  const isLast = tutStep === TUT_STEPS.length - 1;
  return (
    <div className="tut">
      <div className="tut-card">
        <div className="tut-num">
          STEP {tutStep + 1} OF {TUT_STEPS.length}
        </div>
        <div className="tut-title">{s.t}</div>
        <TutScene type={s.t} />
        {s.b && <div className="tut-body">{s.b}</div>}
      </div>
      <div className="tut-nav">
        <button className="menu-link" onClick={onBack}>
          ← BACK
        </button>
        <button className="menu-btn" onClick={onNext}>
          {isLast ? "START" : "NEXT"}
        </button>
      </div>
    </div>
  );
}
