const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/** The installer must make sure the media tools are executable itself; it can't rely on optional-dependency install scripts. */
function prepareBundledMediaTools(resourcesDir, platform, arch) {
  const modules = path.join(resourcesDir, "app.asar.unpacked", "node_modules");
  const suffix = platform === "win32" ? ".exe" : "";
  const tools = [
    path.join(modules, "ffmpeg-static", `ffmpeg${suffix}`),
    path.join(modules, "@ffprobe-installer", `${platform}-${arch}`, `ffprobe${suffix}`),
  ];
  for (const file of tools) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`[afterPack] missing media tool: ${file}`);
    if (platform !== "win32") fs.chmodSync(file, 0o755);
    // cross-platform builds only check the file; on the current OS/arch it is actually executed, and failure blocks packaging.
    if (platform === process.platform && arch === process.arch) {
      execFileSync(file, ["-version"], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
    }
  }
  return tools;
}

module.exports = { prepareBundledMediaTools };
