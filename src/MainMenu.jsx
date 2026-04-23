import { useEffect } from "react";
import { warmupRenderer } from "./warmup.js";
import { AUDIO } from "./audio.js";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// The title screen. The fade-from-black is a pure CSS animation on `.menu`
// (no JS ready state) so it cannot get stuck — if React mounts us, we
// animate. The warmup still runs on mount for the benefit of gameplay.
// ─────────────────────────────────────────────────────────────────────────────

export function MainMenu({ best, onPlay, onOpenTutorial, showAbout, onOpenAbout, onCloseAbout }) {
  useEffect(() => {
    // Kick off renderer warmup one frame after mount. Separate concern
    // from the title fade — warmup is just about priming the GPU/JIT so
    // the first gem draw + first zap don't stutter. Keep it in a RAF so
    // the menu animation starts painting first.
    const id = requestAnimationFrame(() => {
      try {
        warmupRenderer();
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="menu">
      <div className="menu-stagger" style={{ textAlign: "center" }}>
        <div className="pt">PRISM</div>
      </div>
      <button
        className="menu-btn menu-stagger no-click-sfx"
        onClick={() => {
          // Unique "launch" SFX instead of the generic UI click so the
          // PLAY press feels like the start of a run, not a menu tap.
          AUDIO.init();
          AUDIO.resumeAll();
          AUDIO.sfx("playStart");
          onPlay();
        }}
      >
        ▶ PLAY
      </button>
      {best > 0 && (
        <div className="menu-best menu-stagger">
          BEST SCORE
          <br />
          <b>{best.toLocaleString()}</b>
        </div>
      )}
      <div className="menu-footer menu-stagger">
        <button className="menu-link" onClick={onOpenTutorial}>
          How to Play
        </button>
        <button className="menu-link" onClick={onOpenAbout}>
          About
        </button>
      </div>
      {showAbout && (
        <div className="tut" onClick={onCloseAbout}>
          <div className="tut-card">
            <div className="tut-title">ABOUT</div>
            <div className="tut-body">PRISM was developed by James Macre.</div>
          </div>
          <button className="menu-link" onClick={onCloseAbout}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
