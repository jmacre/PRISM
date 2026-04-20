// ─────────────────────────────────────────────────────────────────────────────
// GAME OVER OVERLAY
// Shown when the run ends — either the timer hit zero ("timeout") or there
// are no legal swaps left ("nomoves"). Highlights a new best score and
// gives the player Play Again + Menu buttons.
// ─────────────────────────────────────────────────────────────────────────────

export function GameOverOverlay({ goReason, score, best, bestInfo, onPlayAgain, onMenu }) {
  const isTimeout = goReason === "timeout";
  return (
    <div className="overlay ov-stagger">
      <div className={`ov-title ${goReason}`}>{isTimeout ? "TIME'S UP" : "NO MOVES"}</div>
      <div className="ov-sub">{isTimeout ? "you ran out of time" : "no valid swaps remain"}</div>

      {bestInfo.isNew && (
        <div
          className="nb"
          style={{
            fontFamily: "Orbitron",
            fontSize: ".9rem",
            letterSpacing: ".15em",
            marginTop: 6,
          }}
        >
          ★ NEW BEST ★
        </div>
      )}

      <div className="ov-score">FINAL SCORE: {score.toLocaleString()}</div>
      <div style={{ fontSize: ".6rem", letterSpacing: ".12em", color: "#554477", marginTop: -2 }}>
        BEST: {Math.max(best, score).toLocaleString()}
      </div>

      <button className="ov-btn danger" onClick={onPlayAgain}>
        ↺ PLAY AGAIN
      </button>
      <button className="menu-link" onClick={onMenu}>
        ← MENU
      </button>
    </div>
  );
}
