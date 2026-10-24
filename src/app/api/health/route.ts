import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDataDir, getMigrationsDir } from "@/lib/paths";
import { db, dbInitError, dbMigrationError } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/**
 * One-stop self-diagnostics: for a bug report, a single screenshot of http://127.0.0.1:<port>/api/health
 * shows the real database/migration/ffmpeg/runtime state — no more back-and-forth over log files (lesson from issues #10/#12).
 * Read-only, side-effect free, and contains no secrets.
 */
export async function GET() {
  // database connectivity: run a real query (surfaces both native-module ABI problems and missing tables)
  let dbStatus = "ok";
  let projectCount: number | null = null;
  try {
    const row = db.select({ n: sql<number>`count(*)` }).from(projects).get();
    projectCount = row?.n ?? 0;
  } catch (e) {
    dbStatus = e instanceof Error ? e.message : String(e);
  }

  const migrationsDir = getMigrationsDir();
  const dataDir = getDataDir();
  const ffmpeg = process.env.FFMPEG_PATH || "system";

  return NextResponse.json({
    version: process.env.npm_package_version || "unknown",
    time: new Date().toISOString(),
    runtime: {
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      electron: process.versions.electron || null,
      moduleAbi: process.versions.modules,
    },
    db: {
      status: dbStatus,
      initError: dbInitError,
      migrationError: dbMigrationError,
      projectCount,
      file: path.join(dataDir, "sqlite.db"),
      fileExists: fs.existsSync(path.join(dataDir, "sqlite.db")),
    },
    paths: {
      dataDir,
      dataDirWritable: (() => {
        try {
          fs.accessSync(dataDir, fs.constants.W_OK);
          return true;
        } catch {
          return false;
        }
      })(),
      migrationsDir,
      migrationsDirExists: fs.existsSync(migrationsDir),
    },
    ffmpeg: {
      path: ffmpeg,
      exists: ffmpeg === "system" ? null : fs.existsSync(ffmpeg),
    },
  });
}
