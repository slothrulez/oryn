// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

const { prepareBundledMediaTools } = createRequire(import.meta.url)("../../../electron/media-tools.cjs");
let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "oryn-desktop-tools-")); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));
function tools(script = "#!/bin/sh\necho fixture version\n") {
  const modules = join(directory, "app.asar.unpacked", "node_modules");
  const paths = [join(modules, "ffmpeg-static", "ffmpeg"), join(modules, "@ffprobe-installer", `${process.platform}-${process.arch}`, "ffprobe")];
  for (const file of paths) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, script, { mode: 0o644 });
  }
  return paths;
}

describe("desktop package media tool acceptance", () => {
  it.skipIf(process.platform === "win32")("repairs tools without execute permission and actually runs them in the final package directory", () => {
    const paths = tools();
    expect(prepareBundledMediaTools(directory, process.platform, process.arch)).toEqual(paths);
    for (const file of paths) expect(statSync(file).mode & 0o777).toBe(0o755);
  });
  it("blocks building the installer when tools are missing", () => {
    expect(() => prepareBundledMediaTools(directory, "darwin", "arm64")).toThrow("missing media tool");
  });
  it.skipIf(process.platform === "win32")("blocks packaging when a tool cannot run, instead of only checking the file exists", () => {
    tools("#!/bin/sh\nexit 1\n");
    expect(() => prepareBundledMediaTools(directory, process.platform, process.arch)).toThrow();
  });
});
