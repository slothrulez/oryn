import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegBin } from "@/lib/ffmpeg-path";

const run = promisify(execFile);
const FPS = 30;
/** dissolve length between two camera positions of the same scene */
export const FRAME_DISSOLVE_SEC = 0.45;

/**
 * Eased camera move for one still (zoompan). Easing = speed ramp: the move starts quick and settles,
 * so a sequence of 2–3 frames of the same scene reads as a continuous take rather than a slideshow.
 */
export function frameMotionFilter(index: number, frames: number, width: number, height: number): string {
  const p = `(1-pow(1-on/${frames},2))`; // ease-out progress 0→1
  const kind = index % 3;
  if (kind === 0) {
    // push-in
    return `zoompan=z='1+0.16*${p}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${FPS}`;
  }
  if (kind === 1) {
    // lateral drift with a light zoom
    return `zoompan=z='1.14+0.04*${p}':x='iw/2-(iw/zoom/2)+(iw/zoom)*0.08*(2*${p}-1)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${FPS}`;
  }
  // settle back out
  return `zoompan=z='1.18-0.14*${p}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${FPS}`;
}

/** Per-frame hold lengths (seconds) so that the dissolved sequence lasts exactly `duration`. */
export function frameHolds(count: number, duration: number): number[] {
  const overlap = FRAME_DISSOLVE_SEC * (count - 1);
  const each = (duration + overlap) / count;
  return Array.from({ length: count }, () => Math.max(each, 0.6));
}

/**
 * Pre-render several stills of one shot into a silent clip: eased camera move on each, dissolves
 * between them. The composer then treats the shot as footage (voice, captions, timing unchanged).
 */
export async function renderFrameSequence(input: {
  frames: string[];
  duration: number;
  width: number;
  height: number;
  outPath: string;
}): Promise<string> {
  const { frames, duration, width, height, outPath } = input;
  if (frames.length < 2) throw new Error("renderFrameSequence needs at least two frames");
  const holds = frameHolds(frames.length, duration);
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (let i = 0; i < frames.length; i++) args.push("-loop", "1", "-t", holds[i].toFixed(3), "-i", frames[i]);
  const parts: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const n = Math.round(holds[i] * FPS);
    parts.push(
      `[${i}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},${frameMotionFilter(i, n, width, height)},setsar=1,format=yuv420p[f${i}]`
    );
  }
  let cur = "f0";
  let acc = holds[0];
  for (let i = 1; i < frames.length; i++) {
    const next = i === frames.length - 1 ? "vout" : `x${i}`;
    const offset = Math.max(acc - FRAME_DISSOLVE_SEC, 0);
    parts.push(`[${cur}][f${i}]xfade=transition=fade:duration=${FRAME_DISSOLVE_SEC}:offset=${offset.toFixed(3)}[${next}]`);
    acc = offset + holds[i];
    cur = next;
  }
  args.push("-filter_complex", parts.join(";"), "-map", "[vout]", "-t", duration.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an", outPath);
  await run(ffmpegBin(), args, { maxBuffer: 16 * 1024 * 1024 });
  return outPath;
}
