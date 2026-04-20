// ─────────────────────────────────────────────────────────────────────────────
// TUTORIAL
// 5-step onboarding shown the first time the player hits PLAY.
// Self-contained: only needs `tutStep` + two navigation callbacks from the
// main game. All tutorial-specific gem previews live here.
// ─────────────────────────────────────────────────────────────────────────────

import { COLORS } from "./constants.js";
import { GEM_TEXTURES } from "./gemTextures.js";

// Tutorial previews render gems as plain <img> tags with data-URL sources.
// Building these once up-front is cheaper than rendering the full canvas.
const gemDataUrls = {};
for (const k of [...COLORS, "w"]) {
  if (GEM_TEXTURES[k]) gemDataUrls[k] = GEM_TEXTURES[k].toDataURL();
}

// Single gem image. `hl` highlights the image for "tap this" callouts.
const G = ({ k, size = 28, hl = false }) => (
  <img
    src={gemDataUrls[k]}
    alt=""
    className={hl ? "ts-highlight" : ""}
    style={{ width: size, height: size, display: "block" }}
    draggable="false"
  />
);

// Gem with a matching in-game powerup overlay on top (zap/bomb/inferno/
// multipliers/etc.). Also supports a chained overlay with a countdown number.
const TutGem = ({ c = "r", type = "normal", locked = null, size = 36 }) => (
  <div style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
    <img
      src={gemDataUrls[c]}
      alt=""
      style={{
        width: size,
        height: size,
        display: "block",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.4))",
      }}
      draggable="false"
    />
    {type === "zap" && (
      <div className="sp-z">
        <div className="sp-bb h" />
        <div className="sp-bb v" />
      </div>
    )}
    {type === "bomb" && <div className="sp-bm" />}
    {type === "inferno" && <div className="sp-inf" />}
    {type === "vortex" && (
      <>
        <div className="sp-vortex-outer" />
        <div className="sp-vortex-inner" />
      </>
    )}
    {type === "mult2" && <div className="sp-mult">×2</div>}
    {type === "mult5" && <div className="sp-mult sp-mult5">×5</div>}
    {type === "mult10" && <div className="sp-mult sp-mult10">×10</div>}
    {type === "shuffle" && <div className="sp-shuffle">↻</div>}
    {locked != null && (
      <svg
        viewBox="0 0 100 100"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <circle cx="50" cy="50" r="42" fill="rgba(0,0,0,.35)" />
        <path d="M 39 44 L 39 36 A 11 11 0 0 1 61 36 L 61 44" fill="none" stroke="#778899" strokeWidth="4.5" />
        <rect x="31" y="44" width="38" height="30" fill="#556677" />
        <rect x="31" y="44" width="38" height="7" fill="#667788" />
        <circle cx="50" cy="59" r="3.5" fill="#222833" />
        <rect x="48.75" y="59" width="2.5" height="9" fill="#222833" />
        <text
          x="50"
          y="92"
          textAnchor="middle"
          fontSize="14"
          fontWeight="900"
          fill="#fff"
          fontFamily="Orbitron,sans-serif"
        >
          {locked}
        </text>
      </svg>
    )}
  </div>
);

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

const PowerupsScene = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div className="ts-label">match 4 · row+column clear</div>
    <div className="ts-row">
      <G k="r" size={22} />
      <G k="r" size={22} />
      <G k="r" size={22} />
      <G k="r" size={22} />
      <span className="ts-arrow">→</span>
      <TutGem c="r" type="zap" size={32} />
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
    </div>
  </div>
);

const SpecialsScene = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div className="ts-row" style={{ gap: 12 }}>
      <div style={{ textAlign: "center" }}>
        <TutGem c="y" type="mult2" size={32} />
        <div className="ts-label">score ×2</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <TutGem c="b" type="mult5" size={32} />
        <div className="ts-label">score ×5</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <TutGem c="p" type="mult10" size={32} />
        <div className="ts-label">score ×10</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <TutGem c="r" type="shuffle" size={32} />
        <div className="ts-label">shuffle</div>
      </div>
    </div>
    <div className="ts-label" style={{ marginTop: 6 }}>
      prism + any color = full color wipe
    </div>
    <div className="ts-row">
      <G k="w" size={36} hl />
      <span className="ts-arrow">+</span>
      <G k="b" size={28} />
      <span className="ts-arrow">→</span>
      <span className="ts-result">clears all blue!</span>
    </div>
    <div className="ts-label">prism + prism = board wipe + 100K bonus</div>
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
    <div className="ts-label">4 cascades fast = fever mode · triple score · bonus time</div>
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
      <button className="menu-btn" onClick={onNext}>
        {isLast ? "START" : "NEXT"}
      </button>
      <button className="menu-link" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}
