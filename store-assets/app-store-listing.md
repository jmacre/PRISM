# Apple App Store — Listing Copy

> Note: PRISM is currently built for Android via Capacitor only. Shipping to
> iOS would require either a Capacitor iOS build (`npx cap add ios`) and Xcode
> signing, or a separate native rebuild. The copy below is ready when you do.

## Name (max 30 chars, current = 5)
```
PRISM
```

## Subtitle (max 30 chars)
```
Neon Match-3 With Prism Combos
```

## Promotional text (max 170 chars, can update without re-review)
```
Match, cascade, chain. Trigger fever mode for 3× score and a frozen timer.
Smash double prisms for a full-board wipe.
```

## Description (max 4000 chars)
```
PRISM is a fast, satisfying match-3 puzzle wrapped in a neon-purple aesthetic.

Match three or more gems of the same color to clear them. Stack cascades by
matching gems that drop into new positions. Trigger powerups by matching four
or more in a row.

GAMEPLAY
• Match-4 spawns ZAP — clears the entire row and column
• Match-5 spawns BOMB — clears a 5×5 area
• Match-6 spawns INFERNO — sweeps the board
• Match-7+ spawns VORTEX — destroys everything
• Hit 5 cascades fast for FEVER MODE: 3× score, timer freezes
• Multipliers (×2, ×5, ×10), shuffle gems, locked chained cells

PRISMS
The signature gem. Swap a prism into any colored gem and every gem of that
color clears. Stack two prisms together for a full-board wipe and a massive
score bonus.

PROGRESSION
The timer ceiling tightens the longer you play, forcing faster decisions.
Milestones top up the timer at score thresholds. Your best score is saved
across runs.

FEATURES
• Touch-first design
• Edge-to-edge immersive presentation
• Per-powerup haptic feedback (toggleable)
• Original soundtrack + responsive sound design
• Hardware back button + pause support

No ads. No microtransactions. Just gems, cascades, and the chase for a
better score.
```

## Keywords (max 100 chars total, comma-separated, no spaces after commas)
```
match3,puzzle,cascade,neon,gem,prism,combo,casual,score,fever,relaxing,arcade
```

## What's New (per release, max 4000 chars)
```
v1.0.4 — first release.

Welcome to PRISM. A fast match-3 with prism wildcards, multipliers, shuffle
gems, and a fever mode that triples your score and freezes the clock when
you cascade hard.
```

## Support URL
```
https://github.com/jmacre/PRISM/issues
```
(or your own page)

## Marketing URL (optional)
```
https://github.com/jmacre/PRISM
```

## Privacy policy URL
Required. Template in `privacy-policy.md`. Host on GitHub Pages or similar.

## Age rating questionnaire (App Store Connect)
- Cartoon or fantasy violence: **None**
- Realistic violence: **None**
- Sexual content or nudity: **None**
- Profanity or crude humor: **None**
- Alcohol, tobacco, drug use or references: **None**
- Mature/suggestive themes: **None**
- Horror/fear themes: **None**
- Prolonged graphic or sadistic violence: **None**
- Graphic sexual content: **None**
- Nudity: **None**
- Gambling: **None**
- Unrestricted web access: **No**
- Gambling and contests: **No**
- Made for kids: **No** (general audience puzzle)

Result: **4+** (suitable for all ages).

## Required visual assets
- **App icon:** 1024×1024 PNG, no transparency, no rounded corners, sRGB.
  Apple adds the corners. Generate from `prism-gem.png` against a dark
  navy/purple background — see `icon-1024.png` notes below.
- **iPhone 6.7" screenshots:** 1290×2796 px portrait, ≥ 1 image.
- **iPhone 6.5" screenshots:** 1242×2688 or 1284×2778 portrait (often
  required as fallback for older iPhones), ≥ 1 image.
- **iPad Pro 12.9" screenshots:** 2048×2732 (only required if iPad
  supported in build settings).
- **App Preview video (optional):** 15-30 s .mov / .mp4, portrait,
  1080×1920 or 1080×1920+ (must match a screenshot resolution it pairs
  with). Audio recommended.

## Build requirements (when ready to ship iOS)
- Bundle ID: `com.jmgames.prism`
- Min iOS: 13+ (Capacitor 6 default)
- Capabilities: none required (offline single-player)
- Encryption: uses standard HTTPS only — declare `ITSAppUsesNonExemptEncryption: NO`
