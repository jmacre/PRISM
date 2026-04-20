// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// The title screen. Shows PRISM, the PLAY button, best score, and the
// "How to Play" / "About" footer links. The About modal's visibility is
// managed by the parent so the Android hardware back button can close it.
// ─────────────────────────────────────────────────────────────────────────────

export function MainMenu({ best, onPlay, onOpenTutorial, showAbout, onOpenAbout, onCloseAbout }) {
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
