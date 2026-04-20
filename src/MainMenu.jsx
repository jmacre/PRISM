import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// The title screen. Shows PRISM, the PLAY button, best score, and the
// "How to Play" / "About" footer links. Self-contained — the parent only
// has to wire up the two callbacks.
// ─────────────────────────────────────────────────────────────────────────────

export function MainMenu({ best, onPlay, onOpenTutorial }) {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <div className="menu">
      <div style={{ textAlign: "center" }}>
        <div className="pt">PRISM</div>
      </div>
      <button className="menu-btn" onClick={onPlay}>
        ▶ PLAY
      </button>
      {best > 0 && (
        <div className="menu-best">
          BEST SCORE
          <br />
          <b>{best.toLocaleString()}</b>
        </div>
      )}
      <div className="menu-footer">
        <button className="menu-link" onClick={onOpenTutorial}>
          How to Play
        </button>
        <button className="menu-link" onClick={() => setShowAbout(true)}>
          About
        </button>
      </div>
      {showAbout && (
        <div className="tut" onClick={() => setShowAbout(false)}>
          <div className="tut-card">
            <div className="tut-title">ABOUT</div>
            <div className="tut-body">PRISM was developed by James Macre.</div>
          </div>
          <button className="menu-link" onClick={() => setShowAbout(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
