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
    // Run warmup one frame after mount so the black background paints
    // first. We then flip `ready` to trigger the fade-in.
    //
    // We use a setTimeout fallback (in addition to the RAF path) so that
    // if the WebView ever skips a RAF callback — which has been seen on
    // some Android builds — we still reveal the menu instead of getting
    // stuck on black forever.
    let done = false;
    const flip = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const rafId = requestAnimationFrame(() => {
      try {
        warmupRenderer();
      } catch {}
      flip();
    });
    const safetyTimer = setTimeout(flip, 250);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(safetyTimer);
    };
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
