import { memo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PAUSE OVERLAY
// Kept in its own module and wrapped in `memo` so toggling the `paused` flag
// doesn't force the main game component to reconcile the overlay's JSX tree.
// Callers pass stable callback references so memo can actually bail out of
// re-renders (see `useCallback` wiring in prism-game.jsx).
// ─────────────────────────────────────────────────────────────────────────────

// A compact toggle button used for MUSIC / SFX / BUZZ. Two-line label so
// the button widths stay consistent and readable at the pause-screen font
// size.
const Toggle = ({ label, state, onClick }) => (
  <button
    className="icon-btn"
    onClick={onClick}
    style={{
      opacity: state === "OFF" ? 0.4 : 1,
      padding: "6px 0",
      width: 64,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      lineHeight: 1,
    }}
  >
    <span style={{ fontSize: ".56rem", letterSpacing: ".1em" }}>{label}</span>
    <span style={{ fontSize: ".62rem", fontWeight: 700, letterSpacing: ".08em" }}>
      {state}
    </span>
  </button>
);

export const PauseOverlay = memo(function PauseOverlay({
  confirmAction,
  onConfirm,
  onCancel,
  onResume,
  onReset,
  onMenu,
  onToggleMusic,
  onToggleSfx,
  onToggleHaptics,
  musicMuted,
  sfxMuted,
  hapticsMuted,
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

      {/* Music / SFX / Haptics toggles — one row of equal-width two-line
          buttons so the group stays tidy regardless of state. */}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Toggle label="MUSIC" state={musicMuted ? "OFF" : "ON"} onClick={onToggleMusic} />
        <Toggle label="SFX" state={sfxMuted ? "OFF" : "ON"} onClick={onToggleSfx} />
        <Toggle label="BUZZ" state={hapticsMuted ? "OFF" : "ON"} onClick={onToggleHaptics} />
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
