# PRISM — Store Assets

Everything you need for a Google Play Store launch (and a future App Store launch). Open the files individually for full text / specs.

## What's in this folder

| File | Purpose | Status |
|------|---------|--------|
| `play-store-listing.md` | Title, descriptions, tags, release notes (Play Store) | ✅ Ready to paste |
| `app-store-listing.md` | Name, subtitle, keywords, age rating (App Store) | ✅ Ready when you build iOS |
| `privacy-policy.md` | Boilerplate "we collect nothing" privacy policy | ✅ Ready, host it somewhere |
| `screenshot-guide.md` | Recommended shot list + how to capture | ✅ Reference |
| `promo-video-guide.md` | 30-second cut plan + recording workflow | ✅ Reference |
| `generate-visuals.mjs` | Node script to (re)generate icon + feature graphic | ✅ Run via `node store-assets/generate-visuals.mjs` |
| `icon-512.png` | Play Store icon (512×512 PNG, transparent) | ✅ Generated |
| `icon-1024.png` | App Store icon (1024×1024 PNG, opaque) | ✅ Generated |
| `feature-1024x500.png` | Play Store feature graphic | ✅ Generated |
| `screenshots/` | Where you'll drop captured screenshots | 📷 To capture |
| `promo-raw.mp4` | Raw screen recording before editing | 🎥 To record |

## Launch checklist — Google Play Store

### Pre-flight (one-time)
- [ ] Sign up for a Play Console account ($25 one-time)
- [ ] Generate a real upload keystore (you already have `android/app/prism-release.jks`)
- [ ] Host the privacy policy somewhere public (GitHub Pages, free)
- [ ] Pick a permanent app title (currently `PRISM`)

### Build & upload
- [ ] Bump versionCode + versionName in `android/app/build.gradle`
- [ ] Run `npm run aab` to produce `PRISM-Game.aab`
- [ ] Verify the AAB is signed with the same key as previous uploads
  (fingerprint should match the one Play Console expects)

### Store listing
- [ ] App name (Play Console > Main store listing > App details)
- [ ] Short description (paste from `play-store-listing.md`)
- [ ] Full description (paste from `play-store-listing.md`)
- [ ] App icon → upload `icon-512.png`
- [ ] Feature graphic → upload `feature-1024x500.png`
- [ ] Phone screenshots → upload 4-8 from `screenshots/`
- [ ] (Optional) YouTube promo video URL
- [ ] Category: Games > Puzzle
- [ ] Tags: match-3, puzzle, casual, single-player

### App content
- [ ] Privacy policy URL
- [ ] Ads: No
- [ ] Content rating questionnaire (defaults to Everyone)
- [ ] Target audience: 13+ (or "all ages" if Designed for Families is desired — has extra requirements)
- [ ] Data safety: declare "no data collected" (matches the privacy policy)

### Release tracks
- [ ] Internal testing first — invite 2-3 testers, verify install + gameplay
- [ ] Closed alpha (optional) — bigger group via email list
- [ ] Production release once you're confident

## Launch checklist — Apple App Store

> Currently no iOS build. Skip until you add Capacitor iOS.

- [ ] Apple Developer Program membership ($99/year)
- [ ] Add iOS to Capacitor (`npx cap add ios`)
- [ ] Configure signing in Xcode
- [ ] Generate icon assets via `xcassets` (Xcode does this from a 1024×1024)
- [ ] Capture iPhone 6.7" screenshots (1290×2796)
- [ ] Record 15-30s App Preview video
- [ ] Fill in App Store Connect metadata from `app-store-listing.md`
- [ ] Submit for review

## Regenerating visuals

If you change the app icon or want to tweak the feature graphic:

```
node store-assets/generate-visuals.mjs
```

The script reads from `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` and
writes the three PNGs in this folder. Tweak the SVG strings inside the
script to change colors / layout / text.

## Privacy policy hosting

Easiest option: GitHub Pages.

1. Push `privacy-policy.md` to a public repo (e.g. `jmacre/PRISM-policy`)
2. Settings → Pages → Source: main branch, root
3. Wait a minute for Pages to build
4. Your URL will be `https://jmacre.github.io/PRISM-policy/privacy-policy`
5. Use that URL in Play Console + App Store Connect

Or just inline it as a hosted page on any site you control.
