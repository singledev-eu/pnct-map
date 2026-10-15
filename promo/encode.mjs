// Composes and encodes the promo from the recorded frames and the rendered caption layers
// (record.mjs + captions.mjs): caption band on top, app frames below, captions faded in and out
// over the band, the end card faded in over everything. One ffmpeg run per format.
// Output: out/pnct-promo.mp4 (4x5) and out/pnct-promo-<format>.mp4 (others), plus stills of the
// 4x5 video in out/frames/. Every file is checked with ffprobe; any violation exits non-zero.
//
// Usage: node encode.mjs [--format 4x5|1x1] [--work <dir>]   (default: every format in work/)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CAPTION_FADE, CAPTIONS, END_CARD, FORMATS, FPS, TIMING as T } from "./storyboard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({ options: { format: { type: "string" }, work: { type: "string", default: "work" } } });
const root = resolve(here, args.work);
const outDir = resolve(here, "out");
const stillsDir = resolve(outDir, "frames");

const MAX_MB = 15;
const MB = 1_000_000; // decimal megabytes, so "under 15 MB" is strict
const formats = args.format ? [args.format] : Object.keys(FORMATS).filter((f) => existsSync(`${root}/${f}/timeline.json`));
for (const name of formats) if (!FORMATS[name]) throw new Error(`Unknown format ${name}; use one of ${Object.keys(FORMATS)}`);
if (!formats.length) throw new Error(`No <format>/timeline.json found in ${root}; run record.mjs first`);

/** Runs a tool and returns stdout; on failure prints the tail of stderr and exits. */
function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 64 * MB });
  if (r.error || r.status !== 0) {
    console.error(`\n${cmd} failed (${r.error?.message ?? `exit ${r.status}`}):\n${(r.stderr ?? "").trim().split("\n").slice(-25).join("\n")}`);
    process.exit(1);
  }
  return r.stdout;
}

const sec = (x) => x.toFixed(3); // filter times, in seconds

/** Builds the ffmpeg arguments for one format (inputs + filter graph); the encoder options are added later. */
function buildGraph(name, timeline) {
  const dir = `${root}/${name}`;
  const { width, height, band } = FORMATS[name];
  const { fps, frames, duration, markers } = timeline;
  const at = ([marker, offset]) => {
    if (!(marker in markers)) throw new Error(`Unknown caption marker "${marker}"`);
    return markers[marker] + offset;
  };

  // Inputs: the app frames, then the still layers looped for the whole video.
  const still = (file) => ["-loop", "1", "-framerate", String(fps), "-t", sec(duration), "-i", `${dir}/layers/${file}`];
  const inputs = ["-framerate", String(fps), "-i", `${dir}/frames/%05d.png`, ...still("band.png")];
  CAPTIONS.forEach((_, i) => inputs.push(...still(`caption-${i + 1}.png`)));
  inputs.push(...still("endcard.png"));
  const bandIn = 1;
  const captionIn = (i) => 2 + i;
  const endIn = 2 + CAPTIONS.length;

  // Band over app frames (both are `width` wide), kept in RGB until the final conversion.
  const filters = [`[0:v]format=rgb24[app]`, `[${bandIn}:v]format=rgb24[band]`, `[band][app]vstack=inputs=2[v0]`];
  let last = "v0";

  // Captions: alpha fades in at start and out before end; transparent outside [start, end].
  CAPTIONS.forEach((c, i) => {
    const start = Math.max(0, at(c.start));
    const end = at(c.end);
    let chain = `[${captionIn(i)}:v]format=rgba,fade=t=in:st=${sec(start)}:d=${CAPTION_FADE}:alpha=1`;
    if (end < duration) chain += `,fade=t=out:st=${sec(end - CAPTION_FADE)}:d=${CAPTION_FADE}:alpha=1`; // else it stays to the end
    filters.push(`${chain}[c${i}]`, `[${last}][c${i}]overlay=0:0:format=auto[v${i + 1}]`);
    last = `v${i + 1}`;
  });

  // End card: opacity 0 → 1 over END_CARD.fadeIn from the "end" marker, then stays.
  filters.push(
    `[${endIn}:v]format=rgba,fade=t=in:st=${sec(markers.end)}:d=${END_CARD.fadeIn}:alpha=1[end]`,
    `[${last}][end]overlay=0:0:format=auto[vend]`,
    // RGB → limited-range BT.709 YUV 4:2:0 (tagged below, so players don't guess BT.601).
    `[vend]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[out]`,
  );
  return { inputs, filter: filters.join(";"), size: `${width}x${height}`, frames, band };
}

/** Encodes at the given CRF; returns the output size in bytes. */
function encode(name, graph, file, crf, fps) {
  const argv = [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    ...graph.inputs,
    "-filter_complex", graph.filter,
    "-map", "[out]", "-an",
    "-r", String(fps), "-frames:v", String(graph.frames),
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-movflags", "+faststart", file,
  ];
  console.log(`$ ffmpeg ${argv.map((a) => (a === graph.filter ? `"${a.slice(0, 90)}…"` : a)).join(" ")}`);
  run("ffmpeg", argv);
  return statSync(file).size;
}

/** Extracts frame number `n` of the encoded video (selecting by number is exact, unlike seeking by time). */
function still(video, n, file) {
  run("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", video, "-vf", `select=eq(n\\,${n})`, "-fps_mode", "passthrough", "-frames:v", "1", file]);
  if (!existsSync(file)) throw new Error(`No frame ${n} in ${video}`);
}

/** The six stills of the 4x5 video (times in seconds, see the storyboard). */
function extractStills(video, timeline) {
  const m = timeline.markers;
  const picks = {
    "01-country": m.intro + 1.2,
    "02-only-pnct": m.toggle + T.toggleLead + T.toggleDissolve + 0.6,
    "03-concelho": m.parish - 0.1, // end of the zoom into the concelho
    "04-parish-links": m.links + T.scroll + 0.6,
    "05-zoom-out": m.close + T.closeLead + T.closeDissolve + T.zoomOut * 0.5,
    "06-end-card": m.end + 1.8,
  };
  mkdirSync(stillsDir, { recursive: true });
  for (const f of readdirSync(stillsDir)) if (f.endsWith(".png")) rmSync(`${stillsDir}/${f}`);
  for (const [label, t] of Object.entries(picks)) {
    const n = Math.min(timeline.frames - 1, Math.round(t * timeline.fps));
    still(video, n, `${stillsDir}/${label}.png`);
    console.log(`  still ${label}.png  t=${t.toFixed(2)} s (frame ${n})`);
  }
}

/** ffprobe checks; prints one line and returns the list of problems. */
function verify(name, file) {
  const info = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate", "-of", "json", file]));
  const video = info.streams.find((s) => s.codec_type === "video") ?? {};
  const audio = info.streams.filter((s) => s.codec_type === "audio").length;
  const [num, den] = (video.avg_frame_rate ?? "0/1").split("/").map(Number);
  const fps = den ? num / den : 0;
  const duration = Number(info.format.duration);
  const mb = Number(info.format.size) / MB;
  const { width, height } = FORMATS[name];

  console.log(`${file.replace(`${here}/`, "")}: ${duration.toFixed(2)} s, ${video.width}×${video.height}, ${video.codec_name}, ${video.pix_fmt}, ${fps} fps, ${mb.toFixed(2)} MB, ${audio} audio streams`);
  const problems = [];
  if (video.codec_name !== "h264") problems.push(`codec ${video.codec_name} ≠ h264`);
  if (video.pix_fmt !== "yuv420p") problems.push(`pix_fmt ${video.pix_fmt} ≠ yuv420p`);
  if (fps !== FPS) problems.push(`fps ${fps} ≠ ${FPS}`);
  if (audio) problems.push(`${audio} audio stream(s)`);
  if (mb >= MAX_MB) problems.push(`size ${mb.toFixed(2)} MB ≥ ${MAX_MB} MB`);
  if (!(duration >= 15 && duration <= 20)) problems.push(`duration ${duration.toFixed(2)} s outside 15–20 s`);
  if (video.width !== width || video.height !== height) problems.push(`size ${video.width}×${video.height} ≠ ${width}×${height}`);
  return problems;
}

mkdirSync(outDir, { recursive: true });
const failures = [];
for (const name of formats) {
  const dir = `${root}/${name}`;
  const timeline = JSON.parse(readFileSync(`${dir}/timeline.json`, "utf8"));
  const have = existsSync(`${dir}/frames`) ? readdirSync(`${dir}/frames`).filter((f) => f.endsWith(".png")).length : 0;
  if (have !== timeline.frames) throw new Error(`${name}: ${have} frames in ${dir}/frames, timeline.json says ${timeline.frames}`);
  for (const f of ["band.png", "endcard.png", ...CAPTIONS.map((_, i) => `caption-${i + 1}.png`)]) {
    if (!existsSync(`${dir}/layers/${f}`)) throw new Error(`${name}: missing ${dir}/layers/${f}; run captions.mjs`);
  }

  const file = resolve(outDir, name === "4x5" ? "pnct-promo.mp4" : `pnct-promo-${name}.mp4`);
  const graph = buildGraph(name, timeline);
  console.log(`\n== ${name} (${graph.size}, ${timeline.frames} frames, ${timeline.duration.toFixed(2)} s)`);

  // Raise the CRF by 2 until the file is small enough.
  let crf = 18;
  let size = encode(name, graph, file, crf, timeline.fps);
  while (size >= MAX_MB * MB && crf < 40) {
    console.log(`crf ${crf}: ${(size / MB).toFixed(2)} MB ≥ ${MAX_MB} MB, re-encoding at crf ${crf + 2}`);
    crf += 2;
    size = encode(name, graph, file, crf, timeline.fps);
  }
  console.log(`encoded at crf ${crf}: ${(size / MB).toFixed(2)} MB`);

  if (name === "4x5") extractStills(file, timeline);
  failures.push(...verify(name, file).map((p) => `${name}: ${p}`));
}

if (failures.length) {
  console.error(`\nVerification failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
