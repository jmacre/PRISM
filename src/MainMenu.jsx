import { useEffect, useState } from "react";
import { warmupRenderer } from "./warmup.js";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// The title screen. Hidden behind a black overlay during initial warmup
// (gem texture GPU uploads + canvas shader priming) so the warmup doesn't
// janky-paint the title into view. Once warmup is done we reveal the
// elements with a staggered "fall from top" animation.
// ─────────────────────────────────────────────────────────────────────────────

export function MainMenu({ best, onPlay, onOpenTutorial, showAbout, onOpenAbout, onCloseAbout }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Give React one frame to mount the black background before we
    // hammer the CPU with warmup work. Feels instant either way but
    // avoids a visible hitch on very old devices.
    const id = requestAnimationFrame(() => {
      warmupRenderer();
      // One more frame so the GPU uploads actually flush before we
      // reveal — prevents the reveal itself from dropping frames.
      requestAnimationFrame(() => setReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`menu ${ready ? "menu-ready" : "menu-loading"}`}>
      <div className="menu-stagger" style={{ textAlign: "center" }}>
        <div className="pt">PRISM</div>
      </div>
      <button className="menu-btn menu-stagger" onClick={onPlay}>
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
