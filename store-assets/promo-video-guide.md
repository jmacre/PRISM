# Promo Video / App Preview — Recording Guide

## Specs

### Play Store (YouTube link)
- **Length:** 30 s — 2 min (30 s recommended)
- **Format:** Upload as a regular YouTube video, then paste URL in Play Console
- **Orientation:** Either, but landscape (1920×1080 or 720×1280 portrait) plays better
- **Audio:** Up to you; YouTube auto-mutes thumbnails

### App Store (App Preview)
- **Length:** 15 s — 30 s (must be no shorter / longer)
- **Format:** .mov, .m4v, or .mp4, 30 fps, ProRes 422 HQ or H.264 max
- **Resolution:** Must match the screenshot resolution it pairs with
  - iPhone 6.7": 1290×2796 portrait or 2796×1290 landscape
- **Audio:** Optional but encouraged; will play (muted by default) on the listing
- **Filename pattern:** `{language}-{n}.mp4` e.g. `en-US-1.mp4`

## Recommended 30-second cut

| Beat | Time | Action | Audio |
|------|------|--------|-------|
| 1 | 0:00–0:02 | Title card: "PRISM" with the rainbow logo, dark bg | Logo chime / silence |
| 2 | 0:02–0:06 | Real gameplay — make a 3-match, then a 4-match (zap) | Match SFX |
| 3 | 0:06–0:11 | Cascade chain — score floaters popping up | Cascading chimes |
| 4 | 0:11–0:16 | Trigger fever mode (5 cascades) — bar goes orange + 🔥 | Fever sting |
| 5 | 0:16–0:21 | Swap a prism into a colored gem — color wipe + powerup | Wildcard whoosh |
| 6 | 0:21–0:26 | Double prism — full board clear with rainbow trail + +100K | Double prism sting |
| 7 | 0:26–0:30 | End card: app icon + "PRISM" + "Free • No Ads" | App theme outro |

Total: 30 s. Trim by skipping beats 6-7 for the 15 s App Store preview.

## Capture workflow

### On a real Android device
```
adb shell screenrecord --bit-rate 12000000 /sdcard/prism.mp4
# play through the game, then on the device tap stop or Ctrl-C the command
adb pull /sdcard/prism.mp4 ./store-assets/promo-raw.mp4
```

### On Android emulator
- Click the camera/record icon in the AVD toolbar
- Default 720p, 30 fps, MP4

## Editing

Free tools:
- **DaVinci Resolve** — full-featured, free
- **CapCut** — fast for short cuts, has built-in templates
- **iMovie** (Mac) / **Photos > Video Editor** (Windows) — basic trim/fade

Workflow:
1. Cut to 30 s using the beat plan above
2. Drop in the title + end cards (use `feature-1024x500.png` as a base)
3. Optional: punch-in zoom on the powerup/fever moments for emphasis
4. Render at the target resolution

## Audio considerations

Mute or duck the in-game music to ~30% in the final mix — too loud and
phone speakers clip on the Play Store autoplay. The SFX hits (zap, bomb,
fever, double-prism) should remain at full level — they're the rhythm
of the video.

If you want a separate music track, royalty-free options:
- YouTube Audio Library (free, attribution sometimes required)
- Pixabay Music (free, no attribution)
- Epidemic Sound (paid, license cleared)

## Tips

- Take 5-10 minutes of raw gameplay so you have plenty to cut from
- Make sure the device is in **Do Not Disturb** so notifications don't
  appear in the recording
- Charge the device — battery icon changes will show across cuts
- Status bar should be hidden (immersive mode does this automatically
  in this app, so no work required)
- Lock orientation in your build (already locked to portrait via
  AndroidManifest's `android:screenOrientation="portrait"`... wait, our
  manifest doesn't set this — confirm before recording)
