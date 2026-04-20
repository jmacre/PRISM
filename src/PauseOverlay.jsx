import { memo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PAUSE OVERLAY
// Kept in its own module and wrapped in `memo` so toggling the `paused` flag
// doesn't force the main game component to reconcile the overlay's JSX tree.
// Callers pass stable callback references so memo can actually bail out of
// re-renders (see `useCallback` wiring in prism-game.jsx).
// ─────────────────────────────────────────────────────────────────────────────

export const PauseOverlay = memo(function PauseOverlay({
  confirmAction,
  onConfirm,
  onCancel,
  onResume,
  onReset,
  onMenu,
  onToggleMusic,
  onToggleSfx,
  musicMuted,
  sfxMuted,
}) {
  // When the user hits NEW GAME or MENU, we show a confirmation step instead
  // of tearing the run down immediately.
  if (confirmAction) {
    return (
      <div className="overlay">
        <div className="ov-title pause" style={{ fontSize: "1rem" }}>
          {confirmAction === "reset" ? "NEW GAME?" : "QUIT TO MENU?"}
        </div>
        <div className="ov-sub">your current progress will be lost</div>
        <button className="ov-btn danger" onClick={onConfirm}>
          YES
        </button>
        <button className="ov-btn" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="ov-title pause">PAUSED</div>

      {/* Music / SFX toggles — inline so the user can mute/unmute mid-run. */}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          className="icon-btn"
          onClick={onToggleMusic}
          style={{
            opacity: musicMuted ? 0.45 : 1,
            padding: "8px 10px",
            fontSize: ".6rem",
            width: 88,
            textAlign: "center",
          }}
        >
          MUSIC {musicMuted ? "OFF" : "ON"}
        </button>
        <button
          className="icon-btn"
          onClick={onToggleSfx}
          style={{
            opacity: sfxMuted ? 0.45 : 1,
            padding: "8px 10px",
            fontSize: ".6rem",
            width: 76,
            textAlign: "center",
          }}
        >
          SFX {sfxMuted ? "OFF" : "ON"}
        </button>
      </div>

      <button className="ov-btn" onClick={onResume}>
        ▶ RESUME
      </button>
      <button className="ov-btn danger" onClick={onReset} style={{ fontSize: ".6rem", padding: "7px 20px" }}>
        ↺ NEW GAME
      </button>
      <button className="menu-link" onClick={onMenu}>
        ← MENU
      </button>
    </div>
  );
});
