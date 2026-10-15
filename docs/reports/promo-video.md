# Promo video

A 17-second promo of the live site for X/Twitter, on branch `promo/video`. It doesn't touch the app code. The recipe is in [promo/README.md](../../promo/README.md), and every shot, caption and timing is in `promo/storyboard.mjs`.

**Outputs** (in `promo/out/`, which is gitignored, so they aren't committed):

| File | Size | Length |
|---|---|---|
| `pnct-promo.mp4` | 1080×1350 (4:5, X feed), 4.38 MB | 17.23 s |
| `pnct-promo-1x1.mp4` | 1080×1080 (1:1), 3.77 MB | 17.23 s |
| `frames/*.png` | one still per shot of the 4:5 video | – |

Both videos: H.264 High, yuv420p, BT.709, 30 fps, CRF 18, faststart, no audio. `encode.mjs` checked each one with ffprobe (codec, pixel format, fps, no audio, < 15 MB, 15–20 s, frame size): **all checks passed**.

**Storyboard:**
1. The country view.
2. "Only PNCT" turns on.
3. A tap on concelho Bragança, all 39 of its parishes PNCT, and a zoom in.
4. A tap on parish Gimonde, then a scroll to its Idealista links.
5. The sheet closes and the map zooms back out.
6. The end card: pnct.singledev.eu, "free · open source", and the full data credits (IEFP, CAOP 2025 © DGT CC BY 4.0, OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors).

The captions sit in a band above the app, so they never cover the toolbar or the bottom sheet.

**How it's made:**
- `record.mjs` drives https://pnct.singledev.eu frame by frame at DSF 2. Each frame waits for its own tiles, so a slow network can't show up on camera.
- Taps are real touch taps, marked with a ripple.
- The app's instant state changes become dissolves.
- `captions.mjs` renders the band, the caption pills and the end card in Chromium.
- `encode.mjs` composes them with ffmpeg.

**Sessions:**
- 2026-10-14: the pipeline, the recording of both formats, and the 4:5 encode.
- 2026-10-15: the 1:1 encode from the finished recording.
  - Re-encoding reproduced `pnct-promo.mp4` byte for byte.
  - A frame check of the 1:1 at the "Only PNCT", parish-links and end-card shots showed nothing clipped.
  - The videos were then taken out of git, to save repo space.
  - The unpushed branch was squashed into one commit, so the ~12 MB of binaries never enter history.
  - `promo/out/` is now gitignored.
  - A backup is in `~/backups/pnct-map-promo-out-2026-10-15/`.

**Not done:**
- The branch is not merged or pushed.
- The videos stay on the local machine for now: no GitHub release, by choice.
- Nothing has been posted to X.
