# Screenshot Capture Guide

## Recommended shot list (8 screenshots)

For best Play Store / App Store conversion, plan **5–8 screenshots** that
each tell a story. Take them on a real device or via Android Studio's emulator.

### 1. Hero shot — the title screen
- **Why:** First impression. PRISM logo + neon background.
- **Setup:** Tap the app icon, wait for the title transition to finish, screenshot.
- **Caption overlay (optional):** "MATCH. CASCADE. WIN."

### 2. Mid-cascade gameplay — fever mode active
- **Why:** Shows the game in motion with the orange fever bar + 🔥 indicator.
- **Setup:** Play, chain 5 cascades, screenshot when fever is firing
  with floaters visible.
- **Caption overlay:** "FEVER MODE — 3× SCORE"

### 3. Vortex / massive combo moment
- **Why:** Demonstrates the spectacle.
- **Setup:** Trigger a vortex (match 7+) or a double prism. Screenshot
  during the rainbow blast / board clear.
- **Caption overlay:** "DOUBLE PRISM — BOARD CLEAR"

### 4. Powerups on the board
- **Why:** Shows variety — bombs, zaps, mults, prisms all visible.
- **Setup:** Mid-game with several specials on the board. Screenshot
  in a calm moment.
- **Caption overlay:** "ZAP. BOMB. INFERNO. VORTEX."

### 5. Multiplier × prism combo
- **Why:** Highlights the deep score system.
- **Setup:** Trigger a mult tile + cascade so a big +N popup
  (yellow/amber or white "huge" tier) is on screen.
- **Caption overlay:** "MULTIPLIERS UP TO ×10"

### 6. Tutorial step (powerups)
- **Why:** Shows the game is friendly to new players.
- **Setup:** Reset tutorial via storage (`localStorage.removeItem('prism_tut_done')`),
  open game, navigate to step 2 (POWERUPS).
- **Caption overlay:** "EASY TO LEARN"

### 7. Pause overlay
- **Why:** Demonstrates polish (BUZZ/SFX/MUSIC toggles + clean UI).
- **Setup:** Tap pause button mid-game, screenshot.
- **Caption overlay:** "FULL CONTROL"

### 8. Game over / score screen
- **Why:** Shows the loop's conclusion + best score motivation.
- **Setup:** Let the timer run out or play through. Screenshot when
  game over overlay is showing.
- **Caption overlay:** "BEAT YOUR BEST"

## Capturing on Android (real device)

```
adb shell screencap -p /sdcard/shot.png
adb pull /sdcard/shot.png ./store-assets/screenshots/01-title.png
```

Or use the Power + Volume Down hardware combo, then transfer via cable / cloud.

## Capturing on Android (emulator)

In Android Studio's Device Manager, the AVD has a camera-icon "screenshot"
button in the toolbar. Saves PNG to your Pictures folder by default.

## Resolutions for the Play Store

Target dimensions for portrait phone screenshots:
- **1080×2400** (modern Android default, 20:9)
- **1080×1920** (older 16:9)

Either works. Both should be 24-bit RGB PNG (no alpha channel) or JPG, ≤ 8 MB.

## Resolutions for the App Store

If you ship to iOS later, capture on these device sizes:
- **iPhone 6.7"**: 1290×2796 (iPhone 14 Pro Max, 15 Pro Max)
- **iPhone 6.5"**: 1242×2688 (iPhone 11 Pro Max) — fallback for older Apple devices
- **iPad Pro 12.9"**: 2048×2732 (only if iPad supported in your build)

## Caption overlay tips (optional)

Use a tool like Figma, Photoshop, or [appstorescreenshot.com](https://www.appstorescreenshot.com/)
to add text captions over the screenshot. Keep:
- Same font family across all (Orbitron matches the game)
- One thought per screenshot, max 4-5 words
- High-contrast color (white or hot pink on the dark backgrounds)
- Position consistent (top or bottom band)

Plain unedited screenshots are fine for a first release — captions are a polish step.
