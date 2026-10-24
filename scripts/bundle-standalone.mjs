// After build, fill in the standalone self-contained assets (next build's standalone omits static/public by default),
// copy migration SQL, and replace the better-sqlite3 copy inside standalone with the Electron ABI prebuilt binary.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { createRequire } from "module";
import { join } from "path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("✗ .next/standalone not found; run next build first (next.config needs output:'standalone')");
  process.exit(1);
}

const copies = [
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
  [join(root, "public"), join(standalone, "public")],
  [join(root, "drizzle"), join(standalone, "drizzle")],
];

for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.warn(`⚠ skipped (source missing): ${from}`);
    continue;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`✓ ${from} → ${to}`);
}

// Belt-and-braces installer diet: even with outputFileTracingExcludes in next.config, any future
// trace regression must not silently ship the local data dir (user uploads/outputs), the docs site
// or repo metadata inside the desktop package again (this once inflated the dmg to 330MB).
for (const junk of [".git", ".github", "data", "docs", "tasks", "release", "integrations", "e2e", "remotion", "tsconfig.tsbuildinfo", "pnpm-lock.yaml"]) {
  const p = join(standalone, junk);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`✓ slimmed: removed standalone/${junk}`);
  }
}

// Note: node-linker=hoisted (.npmrc) makes standalone/node_modules a flat, symlink-free tree of real files.
// This is deliberate: the pnpm symlink layout, when reproduced in the standalone, breaks on Windows packaging
// (robocopy follows the links and flattens `next` to the top level, detaching it from its .pnpm peers such as
// @swc/helpers -> MODULE_NOT_FOUND, issue #10). A flat tree copies cleanly on every OS with any copy method.

// === Replace the standalone better-sqlite3 copy with the Electron runtime ABI prebuilt ===
// The copy in the main node_modules keeps the system Node ABI (needed by next build's collect page data step);
// the packaged App runs server.js via Electron's built-in Node fork, which must match Electron's ABI (e.g. Electron 42=146),
// otherwise any DB route will 500 due to NODE_MODULE_VERSION mismatch. Pull the official electron-vXXX prebuilt; do not compile from source.
// Note: `tar` is available on macOS/Linux and on Windows 10+ (bsdtar), so the extract step works on the whole CI matrix.
await rebuildBetterSqlite3ForElectron();

async function rebuildBetterSqlite3ForElectron() {
  // Flat (hoisted) layout: better-sqlite3 lives directly at node_modules/better-sqlite3.
  // Fallback keeps the legacy .pnpm store path in case a build ever runs without node-linker=hoisted.
  let bsDir = join(standalone, "node_modules", "better-sqlite3");
  if (!existsSync(join(bsDir, "package.json"))) {
    const pnpmDir = join(standalone, "node_modules", ".pnpm");
    const bsEntry = existsSync(pnpmDir) ? readdirSync(pnpmDir).find((d) => d.startsWith("better-sqlite3@")) : null;
    if (bsEntry) bsDir = join(pnpmDir, bsEntry, "node_modules", "better-sqlite3");
  }
  if (!existsSync(join(bsDir, "package.json"))) {
    console.warn("⚠ better-sqlite3 not found in standalone; skipping Electron ABI rebuild");
    return;
  }
  const bsVer = JSON.parse(readFileSync(join(bsDir, "package.json"), "utf8")).version;

  // Ask Electron itself for its module ABI (most reliable; does not depend on node-abi version mapping)
  const electronPath = require("electron"); // returns the absolute path to the Electron executable
  const abi = execSync(`"${electronPath}" -e "process.stdout.write(String(process.versions.modules))"`, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  })
    .toString()
    .trim();

  const plat = process.platform; // darwin / win32 / linux
  const arch = process.arch; // arm64 / x64 / ia32
  const asset = `better-sqlite3-v${bsVer}-electron-v${abi}-${plat}-${arch}.tar.gz`;
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsVer}/${asset}`;
  console.log(`Rebuilding standalone better-sqlite3 → Electron ABI ${abi}: ${asset}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download the Electron prebuild ${res.status}: ${url} (check that the better-sqlite3 ${bsVer} release has an electron-v${abi}-${plat}-${arch} asset)`);
  }
  const tmp = join(root, ".next", "bs-electron.tar.gz");
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  execSync(`tar -xzf "${tmp}" -C "${bsDir}"`);

  const node = join(bsDir, "build", "Release", "better_sqlite3.node");
  if (!existsSync(node)) throw new Error("better_sqlite3.node not found after unpacking; Electron ABI rebuild failed");

  // Key point: the Next build copies serverExternalPackages native packages again into standalone/.next/node_modules/<pkg>-<hash>/,
  // and at runtime that copy loads first, not the top-level node_modules one — swapping only the top level leaves every
  // DB route in the packaged app with a NODE_MODULE_VERSION mismatch (ERR_DLOPEN_FAILED) → 500 (issue #12).
  // Platform differences: on mac this copy is a hard-linked real directory; on Windows standalone/.next/node_modules is a
  // junction (directory symlink) that a generic "skip symlinks" scan misses, while electron-builder's robocopy
  // follows the junction and materializes the old Node ABI binary into the installer. So enter that directory explicitly (readdirSync
  // traverses junctions), and for each better-sqlite3* copy resolve its real path, delete the old file, then copy in the Electron ABI binary,
  // so a hard link doesn't also change the project root's Node ABI version (a later local next build still needs it).
  const replaced = [];
  const dotNextNM = join(standalone, ".next", "node_modules");
  if (existsSync(dotNextNM)) {
    for (const name of readdirSync(dotNextNM)) {
      if (!name.startsWith("better-sqlite3")) continue;
      const target = join(dotNextNM, name, "build", "Release", "better_sqlite3.node");
      if (!existsSync(target)) continue;
      const real = realpathSync(target);
      if (real === realpathSync(node)) {
        // mac: the copy directory is a symlink back to the top-level node_modules/better-sqlite3, which was just swapped = already Electron ABI
        replaced.push(`${target} (symlink to the top level, replaced with it)`);
        continue;
      }
      rmSync(real);
      copyFileSync(node, real);
      replaced.push(`${target}${real !== target ? ` → ${real}` : ""}`);
    }
  }
  if (replaced.length === 0) {
    // the copy must exist and be replaced: Next 16 standalone always generates it for serverExternalPackages;
    // not finding it most likely means the layout changed or the scan broke, so abort packaging rather than ship a package whose DB routes fail (issue #12).
    throw new Error(`No better-sqlite3 copy found in ${dotNextNM}; cannot confirm the Electron ABI swap is complete, aborting packaging`);
  }
  console.log(`✓ standalone better-sqlite3 switched to Electron ABI (including ${replaced.length} copies inside .next); DB routes work in the packaged app`);
  for (const p of replaced) console.log(`  ↳ replaced copy: ${p}`);
}

console.log("standalone assets complete");
