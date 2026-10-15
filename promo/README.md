# Promo video

A 17-second promo of the **live** site (https://pnct.singledev.eu) for X/Twitter, recorded with Playwright and encoded with ffmpeg. It doesn't use or change the app code.

| Output | Format |
|---|---|
| `out/pnct-promo.mp4` | 1080×1350 (4:5, the X feed), H.264 High, yuv420p, 30 fps, no audio |
| `out/pnct-promo-1x1.mp4` | 1080×1080 (1:1), same settings |
| `out/frames/*.png` | one still per shot of the 4:5 video, for review |

## Re-record

```sh
cd promo
npm run setup          # once: npm ci + Chromium into node_modules
npm run promo          # record both formats from the live site, render captions, encode, verify (≈ 10–30 min)
npm run promo:encode   # after editing captions or the end card in storyboard.mjs: seconds
node record.mjs --format 4x5   # one format only (also captions.mjs / encode.mjs)
```

Needs ffmpeg and ffprobe on `PATH` (`brew install ffmpeg`). The recording depends on the network: every frame waits for its basemap tiles. `encode.mjs` checks the result with ffprobe and exits non-zero if any of these fails: codec, pixel format, 30 fps, no audio, under 15 MB, 15–20 s, frame size.

## How it works

| File | Role |
|---|---|
| `storyboard.mjs` | Everything you'd tweak: concelho and parish, shot timings, caption texts and times, end card, formats |
| `record.mjs` | Drives the live site and writes `work/<format>/frames/*.png` and `timeline.json` (marker times) |
| `captions.mjs` | Renders the caption band, one transparent pill PNG per caption, and the end card, in Chromium |
| `encode.mjs` | ffmpeg: band on top, app below, caption fades, end card; x264 CRF 18; stills; ffprobe checks |

**Capture.** `record.mjs` captures deterministically, one frame at a time:
- Each frame sets the camera for its own time and waits until the map has every tile for it.
- Then it saves a lossless PNG at device scale 2. The app viewport is 540 CSS px wide, so the frame is 1080 px.
- Camera moves are eased in and out, along a "fixed point" path: the target grows in place, like a pinch.
- Taps are real touch taps on the site. A ripple overlay marks each one.
- The app's instant changes become dissolves, by fading a screenshot of the previous state over the page. That covers the "Only PNCT" filter, the bottom sheet opening and closing, and the sheet switching to the parish.
- When the app animates the camera itself after a tap, the script lets the animation finish, reads where it ends, and replays the move at storyboard speed.

**Why not real-time capture:**
- Playwright's `recordVideo` writes the page at CSS resolution (540×675) into the corner of the frame, as about 750 kbps VP8.
- CDP `Page.startScreencast` also delivers CSS-pixel frames, so it needs a 2× upscale.
- Both run in real time, so a slow tile shows up on camera.

**Captions** sit in a band above the app, not over it. In the phone layout the toolbar fills the top and the bottom sheet covers half the screen, so no spot over the map is free in every shot. A band keeps them clear of the action and lets them be large enough to read on a phone. The end card carries the data credits: CAOP © DGT, OpenFreeMap, © OpenMapTiles and © OpenStreetMap contributors.

`work/` (frames, layers) and `out/` (videos, stills) are gitignored, to keep binaries out of the repo history. The finished videos stay local.
