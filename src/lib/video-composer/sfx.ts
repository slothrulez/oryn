import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ffmpegBin } from "@/lib/ffmpeg-path";

const run = promisify(execFile);

/**
 * A short synthetic "whoosh-hit" for cut points (no third-party sample needed): filtered noise burst
 * with a fast attack and a tail, pre-levelled so it sits under the voice.
 */
export async function ensureCutSfx(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "cut-whoosh.wav");
  if (existsSync(out)) return out;
  await run(ffmpegBin(), [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.6:duration=0.28:sample_rate=48000",
    "-af", "lowpass=f=2400,highpass=f=180,afade=t=in:st=0:d=0.03,afade=t=out:st=0.08:d=0.2,volume=-13dB",
    "-ac", "2", out,
  ]);
  return out;
}
